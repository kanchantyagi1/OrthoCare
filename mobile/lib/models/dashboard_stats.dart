class AdminDashboardStats {
  final int activeNurses;
  final int patientChats;
  final int aiResolved;
  final int humanEscalations;
  final int pending;
  final int urgent;
  final List<NursePerformance> nursePerformance;

  const AdminDashboardStats({
    required this.activeNurses,
    required this.patientChats,
    required this.aiResolved,
    required this.humanEscalations,
    required this.pending,
    required this.urgent,
    this.nursePerformance = const [],
  });

  factory AdminDashboardStats.fromJson(Map<String, dynamic> json) => AdminDashboardStats(
        activeNurses: json['activeNurses'] as int? ?? 0,
        patientChats: json['patientChats'] as int? ?? 0,
        aiResolved: json['aiResolved'] as int? ?? 0,
        humanEscalations: json['humanEscalations'] as int? ?? 0,
        pending: json['pending'] as int? ?? 0,
        urgent: json['urgent'] as int? ?? 0,
        nursePerformance: (json['nursePerformance'] as List<dynamic>? ?? [])
            .map((e) => NursePerformance.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class NursePerformance {
  final String nurseId;
  final String nurseName;
  final int assigned;
  final int resolved;
  final int pending;
  final double averageResponseMinutes;
  final int slaBreaches;

  const NursePerformance({
    required this.nurseId,
    required this.nurseName,
    required this.assigned,
    required this.resolved,
    required this.pending,
    required this.averageResponseMinutes,
    required this.slaBreaches,
  });

  factory NursePerformance.fromJson(Map<String, dynamic> json) => NursePerformance(
        nurseId: json['nurseId'] as String,
        nurseName: json['nurseName'] as String? ?? '',
        assigned: json['assigned'] as int? ?? 0,
        resolved: json['resolved'] as int? ?? 0,
        pending: json['pending'] as int? ?? 0,
        averageResponseMinutes: (json['averageResponseMinutes'] as num?)?.toDouble() ?? 0,
        slaBreaches: json['slaBreaches'] as int? ?? 0,
      );
}
