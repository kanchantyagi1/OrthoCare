import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/chat_message.dart';
import '../../models/escalation.dart';
import '../auth/auth_controller.dart';
import 'patient_session_controller.dart';

// Patient requests carry the chat session id explicitly: patients are
// account-less, so there is no JWT to identify them by.
final chatHistoryProvider = FutureProvider.autoDispose<List<ChatSession>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final sessionId = ref.watch(patientSessionProvider).sessionId;
  if (sessionId == null) return [];
  final data = await api.get('/chat/history', query: {'sessionId': sessionId});
  final items = data['items'] as List<dynamic>? ?? (data['data'] as List<dynamic>? ?? []);
  return items.map((e) => ChatSession.fromJson(e as Map<String, dynamic>)).toList();
});

final patientEscalationsProvider = FutureProvider.autoDispose<List<Escalation>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final sessionId = ref.watch(patientSessionProvider).sessionId;
  if (sessionId == null) return [];
  final data = await api.get('/escalations', query: {'sessionId': sessionId});
  final items = data['items'] as List<dynamic>? ?? (data['data'] as List<dynamic>? ?? []);
  return items.map((e) => Escalation.fromJson(e as Map<String, dynamic>)).toList();
});

class ChatState {
  final String? sessionId;
  final List<ChatMessage> messages;
  final bool sending;
  final String? error;

  const ChatState({this.sessionId, this.messages = const [], this.sending = false, this.error});

  ChatState copyWith({String? sessionId, List<ChatMessage>? messages, bool? sending, String? error}) => ChatState(
        sessionId: sessionId ?? this.sessionId,
        messages: messages ?? this.messages,
        sending: sending ?? this.sending,
        error: error,
      );
}

final chatControllerProvider = StateNotifierProvider.autoDispose<ChatController, ChatState>((ref) {
  return ChatController(ref);
});

class ChatController extends StateNotifier<ChatState> {
  final Ref _ref;
  ChatController(this._ref) : super(const ChatState());

  /// `/chat/history` lists *sessions*; the messages of one thread come from
  /// `/chat/messages`. Pointing this at history parsed session rows as messages.
  Future<void> loadSession(String sessionId) async {
    final api = _ref.read(apiClientProvider);
    final data = await api.get('/chat/messages', query: {'sessionId': sessionId});
    final items = data['items'] as List<dynamic>? ?? (data['messages'] as List<dynamic>? ?? []);
    state = state.copyWith(
      sessionId: sessionId,
      messages: items.map((e) => ChatMessage.fromJson(e as Map<String, dynamic>)).toList(),
    );
  }

  /// The patient's session is created when they enter their phone number
  /// (see PatientSessionController) - there is nothing to create here, we just
  /// adopt it. Chat is unreachable without one, enforced by the router.
  Future<void> _ensureSession() async {
    if (state.sessionId != null) return;
    final sessionId = _ref.read(patientSessionProvider).sessionId;
    if (sessionId == null) {
      throw Exception('No patient session - enter a phone number to start chatting');
    }
    state = state.copyWith(sessionId: sessionId);
  }

  Future<void> sendMessage(String text) async {
    if (text.trim().isEmpty) return;
    state = state.copyWith(sending: true, error: null);
    final optimisticUserMessage = ChatMessage(
      id: 'local-${DateTime.now().microsecondsSinceEpoch}',
      sender: MessageSender.patient,
      text: text.trim(),
      createdAt: DateTime.now(),
    );
    state = state.copyWith(messages: [...state.messages, optimisticUserMessage]);

    try {
      await _ensureSession();
      final api = _ref.read(apiClientProvider);
      final response = await api.post('/chat/message', data: {
        'sessionId': state.sessionId,
        'message': text.trim(),
      });
      // The reply is `{patientMessage, assistantMessage, duplicate}` - reading
      // the envelope for an `answer` key yielded a blank assistant bubble.
      final assistant = response['assistantMessage'] as Map<String, dynamic>?;
      final assistantReply = assistant != null
          ? ChatMessage.fromJson(assistant)
          : ChatMessage(
              id: 'ai-${DateTime.now().microsecondsSinceEpoch}',
              sender: MessageSender.assistant,
              text: response['answer'] as String? ?? '',
              createdAt: DateTime.now(),
              needsHumanFollowUp: response['needsHuman'] as bool? ?? false,
            );
      state = state.copyWith(messages: [...state.messages, assistantReply], sending: false);
    } catch (e) {
      state = state.copyWith(sending: false, error: e.toString());
    }
  }

  void setHelpful(String messageId, bool helpful) {
    state = state.copyWith(
      messages: state.messages.map((m) => m.id == messageId ? m.copyWith(helpful: helpful) : m).toList(),
    );
  }

  /// Patient tapped "No, talk to a doctor" — create (or confirm) a human
  /// escalation for this assistant answer.
  Future<String?> requestDoctor(ChatMessage assistantMessage) async {
    setHelpful(assistantMessage.id, false);
    if (assistantMessage.escalationId != null) return assistantMessage.escalationId;

    // `question` is required by the API, so send the patient turn this assistant answer
    // was replying to - that is what the doctor reads on the case screen.
    final index = state.messages.indexWhere((m) => m.id == assistantMessage.id);
    String question = '';
    for (var i = (index == -1 ? state.messages.length : index) - 1; i >= 0; i--) {
      if (state.messages[i].sender == MessageSender.patient) {
        question = state.messages[i].text;
        break;
      }
    }

    final api = _ref.read(apiClientProvider);
    final data = await api.post('/escalations', data: {
      // The session identifies the (account-less) patient and carries the phone
      // number the doctor will call back on.
      'sessionId': state.sessionId,
      'chatMessageId': assistantMessage.id,
      'question': question.isEmpty ? 'Patient requested to speak to a doctor' : question,
      'aiResponse': assistantMessage.text,
      'reason': 'patient_not_satisfied',
    });
    return data['id'] as String?;
  }
}
