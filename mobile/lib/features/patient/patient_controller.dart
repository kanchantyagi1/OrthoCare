import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/chat_message.dart';
import '../../models/escalation.dart';
import '../auth/auth_controller.dart';

final chatHistoryProvider = FutureProvider.autoDispose<List<ChatSession>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final data = await api.get('/chat/history');
  final items = data['items'] as List<dynamic>? ?? (data['data'] as List<dynamic>? ?? []);
  return items.map((e) => ChatSession.fromJson(e as Map<String, dynamic>)).toList();
});

final patientEscalationsProvider = FutureProvider.autoDispose<List<Escalation>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final data = await api.get('/escalations', query: {'scope': 'mine'});
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

  Future<void> loadSession(String sessionId) async {
    final api = _ref.read(apiClientProvider);
    final data = await api.get('/chat/history', query: {'sessionId': sessionId});
    final items = data['items'] as List<dynamic>? ?? (data['messages'] as List<dynamic>? ?? []);
    state = state.copyWith(
      sessionId: sessionId,
      messages: items.map((e) => ChatMessage.fromJson(e as Map<String, dynamic>)).toList(),
    );
  }

  Future<void> _ensureSession() async {
    if (state.sessionId != null) return;
    final api = _ref.read(apiClientProvider);
    final user = _ref.read(authControllerProvider).user;
    final data = await api.post('/chat/session', data: {'patientId': user?.id});
    state = state.copyWith(sessionId: data['id'] as String? ?? data['sessionId'] as String?);
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
      final aiMessage = ChatMessage(
        id: response['messageId'] as String? ?? 'ai-${DateTime.now().microsecondsSinceEpoch}',
        sender: MessageSender.ai,
        text: response['answer'] as String? ?? '',
        createdAt: DateTime.now(),
        needsHumanFollowUp: response['needsHuman'] as bool? ?? false,
        escalationId: response['escalationId'] as String?,
      );
      state = state.copyWith(messages: [...state.messages, aiMessage], sending: false);
    } catch (e) {
      state = state.copyWith(sending: false, error: e.toString());
    }
  }

  void setHelpful(String messageId, bool helpful) {
    state = state.copyWith(
      messages: state.messages.map((m) => m.id == messageId ? m.copyWith(helpful: helpful) : m).toList(),
    );
  }

  /// Patient tapped "No, talk to nurse" — create (or confirm) a human
  /// escalation for this AI answer.
  Future<String?> requestNurse(ChatMessage aiMessage) async {
    setHelpful(aiMessage.id, false);
    if (aiMessage.escalationId != null) return aiMessage.escalationId;
    final api = _ref.read(apiClientProvider);
    final data = await api.post('/escalations', data: {
      'chatSessionId': state.sessionId,
      'chatMessageId': aiMessage.id,
      'reason': 'patient_not_satisfied',
    });
    return data['id'] as String?;
  }
}
