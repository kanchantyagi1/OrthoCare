import '../core/util/date_time_x.dart';

enum MessageSender { patient, assistant, system }

class ChatMessage {
  final String id;
  final MessageSender sender;
  final String text;
  final DateTime createdAt;
  final bool needsHumanFollowUp;
  final String? escalationId;
  final bool? helpful;

  /// Backend's internal note on an assistant reply - `greeting`, or
  /// `awaiting_patient_reply: ...` when the reply is a question back to the patient.
  final String? reason;

  const ChatMessage({
    required this.id,
    required this.sender,
    required this.text,
    required this.createdAt,
    this.needsHumanFollowUp = false,
    this.escalationId,
    this.helpful,
    this.reason,
  });

  /// Greetings and questions back to the patient are not answers, so they get no
  /// "Was this helpful? / talk to a doctor" prompt.
  bool get isFinalAnswer =>
      sender == MessageSender.assistant &&
      reason != 'greeting' &&
      !(reason ?? '').startsWith('awaiting_patient_reply');

  /// The backend persists messages as `role` ('patient' | 'assistant') and
  /// `message`; `sender`/`text` are accepted too so either shape parses.
  factory ChatMessage.fromJson(Map<String, dynamic> json) => ChatMessage(
        id: json['id'] as String,
        sender: _senderFrom((json['role'] ?? json['sender']) as String?),
        text: (json['message'] ?? json['text']) as String? ?? '',
        createdAt: parseApiDateTimeOr(json['createdAt']),
        needsHumanFollowUp:
            (json['needsHuman'] ?? json['needsHumanFollowUp']) as bool? ?? false,
        escalationId: json['escalationId'] as String?,
        helpful: json['helpful'] as bool?,
        reason: json['reason'] as String?,
      );

  static MessageSender _senderFrom(String? value) {
    switch (value) {
      case 'assistant':
      case 'ai':
        return MessageSender.assistant;
      case 'system':
        return MessageSender.system;
      default:
        return MessageSender.patient;
    }
  }

  ChatMessage copyWith({bool? helpful}) => ChatMessage(
        id: id,
        sender: sender,
        text: text,
        createdAt: createdAt,
        needsHumanFollowUp: needsHumanFollowUp,
        escalationId: escalationId,
        helpful: helpful ?? this.helpful,
        reason: reason,
      );
}

class ChatSession {
  final String id;
  final DateTime createdAt;
  final String? lastMessagePreview;

  const ChatSession({required this.id, required this.createdAt, this.lastMessagePreview});

  factory ChatSession.fromJson(Map<String, dynamic> json) => ChatSession(
        id: json['id'] as String,
        createdAt: parseApiDateTimeOr(json['createdAt']),
        lastMessagePreview: json['lastMessagePreview'] as String?,
      );
}
