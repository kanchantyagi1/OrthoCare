import 'package:intl/intl.dart';

import '../core/util/date_time_x.dart';

/// A shift is a *daily recurring time-of-day window*, not a date range: the
/// backend stores `startTime`/`endTime` as "HH:mm" strings (see spec section 30,
/// e.g. 09:00-12:00). Passing those to DateTime.parse throws
/// "FormatException: Invalid date format 00:00", so they stay strings here and
/// comparisons are done lexicographically, which is valid for zero-padded HH:mm.
class Shift {
  final String id;
  final String doctorId;
  final String doctorName;
  final String? label;
  final String startTime;
  final String endTime;

  const Shift({
    required this.id,
    required this.doctorId,
    required this.doctorName,
    this.label,
    required this.startTime,
    required this.endTime,
  });

  factory Shift.fromJson(Map<String, dynamic> json) => Shift(
        id: json['id'] as String,
        doctorId: json['doctorId'] as String? ?? '',
        doctorName: json['doctorName'] as String? ?? '',
        label: json['label'] as String?,
        startTime: json['startTime'] as String? ?? '00:00',
        endTime: json['endTime'] as String? ?? '00:00',
      );

  /// "09:00" -> "9:00 AM". Falls back to the raw value if it isn't HH:mm.
  static String formatTime(String hhmm) {
    final parts = hhmm.split(':');
    if (parts.length != 2) return hhmm;
    final hour = int.tryParse(parts[0]);
    final minute = int.tryParse(parts[1]);
    if (hour == null || minute == null) return hhmm;
    return DateFormat.jm().format(DateTime(2000, 1, 1, hour, minute));
  }

  /// Converts a picked wall-clock time into the "HH:mm" the API expects.
  static String toHhMm(int hour, int minute) =>
      '${hour.toString().padLeft(2, '0')}:${minute.toString().padLeft(2, '0')}';

  String get startLabel => formatTime(startTime);
  String get endLabel => formatTime(endTime);
  String get rangeLabel => '$startLabel – $endLabel';

  bool get isActiveNow {
    final now = DateTime.now();
    final nowHhMm = toHhMm(now.hour, now.minute);
    // A window whose end is at or before its start wraps past midnight.
    return endTime.compareTo(startTime) > 0
        ? nowHhMm.compareTo(startTime) >= 0 && nowHhMm.compareTo(endTime) < 0
        : nowHhMm.compareTo(startTime) >= 0 || nowHhMm.compareTo(endTime) < 0;
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
        punchIn: parseApiDateTimeOr(json['punchIn']),
        punchOut: parseApiDateTime(json['punchOut']),
      );
}
