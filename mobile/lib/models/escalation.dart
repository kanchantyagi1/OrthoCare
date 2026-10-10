import '../core/util/date_time_x.dart';

enum EscalationPriority { normal, high, urgent }

EscalationPriority priorityFromString(String? value) {
  switch ((value ?? 'normal').toLowerCase()) {
    case 'urgent':
      return EscalationPriority.urgent;
    case 'high':
      return EscalationPriority.high;
    default:
      return EscalationPriority.normal;
  }
}

enum EscalationStatus { waitingForDoctor, assigned, contacted, resolved, escalatedToDoctor }

EscalationStatus escalationStatusFromString(String value) {
  switch (value.toUpperCase()) {
    case 'WAITING_FOR_DOCTOR':
    // Tolerated so a stale value from an older backend can't break parsing.
    case 'WAITING_FOR_NURSE':
      return EscalationStatus.waitingForDoctor;
    case 'ASSIGNED':
      return EscalationStatus.assigned;
    case 'CONTACTED':
      return EscalationStatus.contacted;
    case 'RESOLVED':
      return EscalationStatus.resolved;
    case 'ESCALATED_TO_DOCTOR':
      return EscalationStatus.escalatedToDoctor;
    default:
      return EscalationStatus.waitingForDoctor;
  }
}

class SourceDocument {
  final String documentId;
  final String fileName;
  final int? pageNumber;
  final String? sectionTitle;
  final double? similarityScore;

  const SourceDocument({
    required this.documentId,
    required this.fileName,
    this.pageNumber,
    this.sectionTitle,
    this.similarityScore,
  });

  factory SourceDocument.fromJson(Map<String, dynamic> json) => SourceDocument(
        documentId: json['documentId'] as String,
        fileName: json['fileName'] as String? ?? 'document',
        pageNumber: json['pageNumber'] as int?,
        sectionTitle: json['sectionTitle'] as String?,
        similarityScore: (json['similarityScore'] as num?)?.toDouble(),
      );
}

class Escalation {
  final String id;
  final String patientId;
  final String patientName;
  final String? patientPhone;
  final String? surgeryType;
  final String? surgeryDate;
  final String chatSessionId;
  final String question;
  final String aiResponse;
  final String? reason;
  final EscalationPriority priority;
  final EscalationStatus status;
  final String? assignedDoctorId;
  final String? assignedDoctorName;
  final List<SourceDocument> sources;
  final DateTime createdAt;
  final DateTime? assignedAt;
  final DateTime? contactedAt;
  final DateTime? resolvedAt;

  const Escalation({
    required this.id,
    required this.patientId,
    required this.patientName,
    this.patientPhone,
    this.surgeryType,
    this.surgeryDate,
    required this.chatSessionId,
    required this.question,
    required this.aiResponse,
    this.reason,
    required this.priority,
    required this.status,
    this.assignedDoctorId,
    this.assignedDoctorName,
    this.sources = const [],
    required this.createdAt,
    this.assignedAt,
    this.contactedAt,
    this.resolvedAt,
  });

  factory Escalation.fromJson(Map<String, dynamic> json) => Escalation(
        id: json['id'] as String,
        patientId: json['patientId'] as String,
        patientName: json['patientName'] as String? ?? 'Patient',
        patientPhone: json['patientPhone'] as String?,
        surgeryType: json['surgeryType'] as String?,
        surgeryDate: json['surgeryDate'] as String?,
        chatSessionId: json['chatSessionId'] as String? ?? '',
        question: json['question'] as String? ?? '',
        aiResponse: json['aiResponse'] as String? ?? '',
        reason: json['reason'] as String?,
        priority: priorityFromString(json['priority'] as String?),
        status: escalationStatusFromString(json['status'] as String? ?? 'WAITING_FOR_DOCTOR'),
        assignedDoctorId: json['assignedDoctorId'] as String?,
        assignedDoctorName: json['assignedDoctorName'] as String?,
        sources: (json['sources'] as List<dynamic>? ?? [])
            .map((e) => SourceDocument.fromJson(e as Map<String, dynamic>))
            .toList(),
        createdAt: parseApiDateTimeOr(json['createdAt']),
        assignedAt: parseApiDateTime(json['assignedAt']),
        contactedAt: parseApiDateTime(json['contactedAt']),
        resolvedAt: parseApiDateTime(json['resolvedAt']),
      );
}
