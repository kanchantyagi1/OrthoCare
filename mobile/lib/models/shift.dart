class Shift {
  final String id;
  final String nurseId;
  final String nurseName;
  final DateTime startTime;
  final DateTime endTime;

  const Shift({
    required this.id,
    required this.nurseId,
    required this.nurseName,
    required this.startTime,
    required this.endTime,
  });

  factory Shift.fromJson(Map<String, dynamic> json) => Shift(
        id: json['id'] as String,
        nurseId: json['nurseId'] as String,
        nurseName: json['nurseName'] as String? ?? '',
        startTime: DateTime.parse(json['startTime'] as String),
        endTime: DateTime.parse(json['endTime'] as String),
      );

  bool get isActiveNow {
    final now = DateTime.now();
    return now.isAfter(startTime) && now.isBefore(endTime);
  }
}

enum AttendanceStatus { active, offline }

class AttendanceRecord {
  final String id;
  final String? shiftId;
  final DateTime punchIn;
  final DateTime? punchOut;

  const AttendanceRecord({required this.id, this.shiftId, required this.punchIn, this.punchOut});

  AttendanceStatus get status => punchOut == null ? AttendanceStatus.active : AttendanceStatus.offline;

  factory AttendanceRecord.fromJson(Map<String, dynamic> json) => AttendanceRecord(
        id: json['id'] as String,
        shiftId: json['shiftId'] as String?,
        punchIn: DateTime.parse(json['punchIn'] as String),
        punchOut: json['punchOut'] != null ? DateTime.parse(json['punchOut'] as String) : null,
      );
}
