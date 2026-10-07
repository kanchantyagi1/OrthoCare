enum MessageSender { patient, ai, system }

class ChatMessage {
  final String id;
  final MessageSender sender;
  final String text;
  final DateTime createdAt;
  final bool needsHumanFollowUp;
  final String? escalationId;
  final bool? helpful;

  const ChatMessage({
    required this.id,
    required this.sender,
    required this.text,
    required this.createdAt,
    this.needsHumanFollowUp = false,
    this.escalationId,
    this.helpful,
  });

  /// The backend persists messages as `role` ('patient' | 'assistant') and
  /// `message`; `sender`/`text` are accepted too so either shape parses.
  factory ChatMessage.fromJson(Map<String, dynamic> json) => ChatMessage(
        id: json['id'] as String,
        sender: _senderFrom((json['role'] ?? json['sender']) as String?),
        text: (json['message'] ?? json['text']) as String? ?? '',
        createdAt: DateTime.parse(json['createdAt'] as String),
        needsHumanFollowUp:
            (json['needsHuman'] ?? json['needsHumanFollowUp']) as bool? ?? false,
        escalationId: json['escalationId'] as String?,
        helpful: json['helpful'] as bool?,
      );

  static MessageSender _senderFrom(String? value) {
    switch (value) {
      case 'assistant':
      case 'ai':
        return MessageSender.ai;
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
      );
}

class ChatSession {
  final String id;
  final DateTime createdAt;
  final String? lastMessagePreview;

  const ChatSession({required this.id, required this.createdAt, this.lastMessagePreview});

  factory ChatSession.fromJson(Map<String, dynamic> json) => ChatSession(
        id: json['id'] as String,
        createdAt: DateTime.parse(json['createdAt'] as String),
        lastMessagePreview: json['lastMessagePreview'] as String?,
      );
}
