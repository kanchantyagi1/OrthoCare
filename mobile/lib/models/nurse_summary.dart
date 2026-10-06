class NurseSummary {
  final String id;
  final String name;
  final String phone;
  final bool active;

  const NurseSummary({required this.id, required this.name, required this.phone, required this.active});

  factory NurseSummary.fromJson(Map<String, dynamic> json) => NurseSummary(
        id: json['id'] as String,
        name: json['name'] as String? ?? '',
        phone: json['phone'] as String? ?? '',
        active: json['active'] as bool? ?? true,
      );
}

class AttendanceRow {
  final String nurseName;
  final DateTime punchIn;
  final DateTime? punchOut;

  const AttendanceRow({required this.nurseName, required this.punchIn, this.punchOut});

  factory AttendanceRow.fromJson(Map<String, dynamic> json) => AttendanceRow(
        nurseName: json['nurseName'] as String? ?? '',
        punchIn: DateTime.parse(json['punchIn'] as String),
        punchOut: json['punchOut'] != null ? DateTime.parse(json['punchOut'] as String) : null,
      );
}
