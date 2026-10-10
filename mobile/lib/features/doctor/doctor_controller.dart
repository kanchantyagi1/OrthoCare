import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/escalation.dart';
import '../../models/shift.dart';
import '../auth/auth_controller.dart';

class DoctorDashboardData {
  final Shift? todayShift;
  final AttendanceRecord? attendance;
  final int newCases;
  final int pending;
  final int resolved;
  final double averageResponseMinutes;

  const DoctorDashboardData({
    this.todayShift,
    this.attendance,
    required this.newCases,
    required this.pending,
    required this.resolved,
    required this.averageResponseMinutes,
  });

  factory DoctorDashboardData.fromJson(Map<String, dynamic> json) => DoctorDashboardData(
        todayShift: json['todayShift'] != null ? Shift.fromJson(json['todayShift'] as Map<String, dynamic>) : null,
        attendance: json['attendance'] != null
            ? AttendanceRecord.fromJson(json['attendance'] as Map<String, dynamic>)
            : null,
        newCases: json['newCases'] as int? ?? 0,
        pending: json['pending'] as int? ?? 0,
        resolved: json['resolved'] as int? ?? 0,
        averageResponseMinutes: (json['averageResponseMinutes'] as num?)?.toDouble() ?? 0,
      );
}

final doctorDashboardProvider = FutureProvider.autoDispose<DoctorDashboardData>((ref) async {
  final api = ref.watch(apiClientProvider);
  final data = await api.get('/dashboard/doctor');
  return DoctorDashboardData.fromJson(data);
});

final doctorEscalationsProvider = FutureProvider.autoDispose<List<Escalation>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final data = await api.get('/escalations', query: {'scope': 'mine'});
  final items = data['items'] as List<dynamic>? ?? (data['data'] as List<dynamic>? ?? []);
  return items.map((e) => Escalation.fromJson(e as Map<String, dynamic>)).toList();
});

final escalationDetailProvider =
    FutureProvider.autoDispose.family<Escalation, String>((ref, id) async {
  final api = ref.watch(apiClientProvider);
  final data = await api.get('/escalations/$id');
  return Escalation.fromJson(data);
});

final attendanceControllerProvider =
    StateNotifierProvider<AttendanceController, AsyncValue<AttendanceRecord?>>((ref) {
  return AttendanceController(ref);
});

class AttendanceController extends StateNotifier<AsyncValue<AttendanceRecord?>> {
  final Ref _ref;
  bool _busy = false;

  AttendanceController(this._ref) : super(const AsyncValue.loading()) {
    _loadToday();
  }

  /// `GET /attendance/today` returns `{status, records:[...]}`, newest first -
  /// not a bare record. "Punched in" means the newest record has no punchOut.
  Future<void> _loadToday() async {
    try {
      final api = _ref.read(apiClientProvider);
      final data = await api.get('/attendance/today');
      final records = data['records'] as List<dynamic>? ?? const [];
      Map<String, dynamic>? open;
      for (final row in records) {
        final r = row as Map<String, dynamic>;
        if (r['punchOut'] == null) {
          open = r;
          break;
        }
      }
      state = AsyncValue.data(open == null ? null : AttendanceRecord.fromJson(open));
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> refresh() => _loadToday();

  /// Punch in/out both reply `{attendance: {...}, duplicate: bool}`; the record
  /// is nested, so parsing the envelope itself threw
  /// "type 'Null' is not a subtype of type 'String'" and the button appeared dead.
  static AttendanceRecord? _recordFrom(Map<String, dynamic> body) {
    final record = body['attendance'] as Map<String, dynamic>? ?? body;
    if (record['id'] == null) return null;
    return AttendanceRecord.fromJson(record);
  }

  Future<void> punchIn() async {
    if (_busy) return; // idempotency guard against double-tap
    _busy = true;
    state = const AsyncValue.loading(); // disables the button so the tap visibly registers
    try {
      final api = _ref.read(apiClientProvider);
      final data = await api.post('/attendance/punch-in');
      state = AsyncValue.data(_recordFrom(data));
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    } finally {
      _busy = false;
    }
  }

  Future<void> punchOut() async {
    if (_busy) return;
    _busy = true;
    state = const AsyncValue.loading();
    try {
      final api = _ref.read(apiClientProvider);
      final data = await api.post('/attendance/punch-out');
      // A completed punch-out has punchOut set, which flips status to OFFLINE.
      state = AsyncValue.data(_recordFrom(data));
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    } finally {
      _busy = false;
    }
  }
}

final escalationActionsProvider = Provider((ref) => EscalationActions(ref));

class EscalationActions {
  final Ref _ref;
  EscalationActions(this._ref);

  Future<void> markContacted(String escalationId) async {
    await _ref.read(apiClientProvider).post('/escalations/$escalationId/contact');
  }

  Future<void> resolve({
    required String escalationId,
    required bool patientContacted,
    required String issueCategory,
    required String resolutionNotes,
    required bool followUpRequired,
    required bool escalateToDoctor,
    String? doctorNotes,
  }) async {
    await _ref.read(apiClientProvider).post('/escalations/$escalationId/resolve', data: {
      'patientContacted': patientContacted,
      'issueCategory': issueCategory,
      'resolution': resolutionNotes,
      'followUpRequired': followUpRequired,
      'escalateToDoctor': escalateToDoctor,
      // API field is `notes`; sending `doctorNotes` would be rejected outright by
      // ValidationPipe's forbidNonWhitelisted.
      'notes': doctorNotes,
    });
  }

  Future<void> escalateToDoctor(String escalationId) async {
    await _ref.read(apiClientProvider).post('/escalations/$escalationId/escalate-doctor');
  }
}
