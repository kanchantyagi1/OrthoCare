import '../core/util/date_time_x.dart';

class DoctorSummary {
  final String id;
  final String name;
  final String phone;
  final bool active;

  const DoctorSummary({required this.id, required this.name, required this.phone, required this.active});

  factory DoctorSummary.fromJson(Map<String, dynamic> json) => DoctorSummary(
        id: json['id'] as String,
        name: json['name'] as String? ?? '',
        phone: json['phone'] as String? ?? '',
        active: json['active'] as bool? ?? true,
      );
}

class AttendanceRow {
  final String doctorName;
  final DateTime punchIn;
  final DateTime? punchOut;

  const AttendanceRow({required this.doctorName, required this.punchIn, this.punchOut});

  factory AttendanceRow.fromJson(Map<String, dynamic> json) => AttendanceRow(
        doctorName: json['doctorName'] as String? ?? '',
        punchIn: parseApiDateTimeOr(json['punchIn']),
        punchOut: parseApiDateTime(json['punchOut']),
      );
}
