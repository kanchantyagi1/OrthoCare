class AdminDashboardStats {
  final int activeDoctors;
  final int patientChats;
  final int resolvedByAssistant;
  final int humanEscalations;
  final int pending;
  final int urgent;
  final List<DoctorPerformance> doctorPerformance;

  const AdminDashboardStats({
    required this.activeDoctors,
    required this.patientChats,
    required this.resolvedByAssistant,
    required this.humanEscalations,
    required this.pending,
    required this.urgent,
    this.doctorPerformance = const [],
  });

  factory AdminDashboardStats.fromJson(Map<String, dynamic> json) => AdminDashboardStats(
        activeDoctors: json['activeDoctors'] as int? ?? 0,
        patientChats: json['patientChats'] as int? ?? 0,
        resolvedByAssistant: json['resolvedByAssistant'] as int? ?? 0,
        humanEscalations: json['humanEscalations'] as int? ?? 0,
        pending: json['pending'] as int? ?? 0,
        urgent: json['urgent'] as int? ?? 0,
        doctorPerformance: (json['doctorPerformance'] as List<dynamic>? ?? [])
            .map((e) => DoctorPerformance.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class DoctorPerformance {
  final String doctorId;
  final String doctorName;
  final int assigned;
  final int resolved;
  final int pending;
  final double averageResponseMinutes;
  final int slaBreaches;

  const DoctorPerformance({
    required this.doctorId,
    required this.doctorName,
    required this.assigned,
    required this.resolved,
    required this.pending,
    required this.averageResponseMinutes,
    required this.slaBreaches,
  });

  factory DoctorPerformance.fromJson(Map<String, dynamic> json) => DoctorPerformance(
        doctorId: json['doctorId'] as String,
        doctorName: json['doctorName'] as String? ?? '',
        assigned: json['assigned'] as int? ?? 0,
        resolved: json['resolved'] as int? ?? 0,
        pending: json['pending'] as int? ?? 0,
        averageResponseMinutes: (json['averageResponseMinutes'] as num?)?.toDouble() ?? 0,
        slaBreaches: json['slaBreaches'] as int? ?? 0,
      );
}
