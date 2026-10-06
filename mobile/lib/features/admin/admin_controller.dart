import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_client.dart';
import '../../models/dashboard_stats.dart';
import '../../models/document.dart';
import '../../models/escalation.dart';
import '../../models/nurse_summary.dart';
import '../../models/shift.dart';

final adminDashboardProvider = FutureProvider.autoDispose<AdminDashboardStats>((ref) async {
  final api = ref.watch(apiClientProvider);
  final data = await api.get('/dashboard');
  return AdminDashboardStats.fromJson(data);
});

final nursesProvider = FutureProvider.autoDispose<List<NurseSummary>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final data = await api.get('/nurses');
  final items = data['items'] as List<dynamic>? ?? (data['data'] as List<dynamic>? ?? []);
  return items.map((e) => NurseSummary.fromJson(e as Map<String, dynamic>)).toList();
});

final shiftsProvider = FutureProvider.autoDispose<List<Shift>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final data = await api.get('/shifts');
  final items = data['items'] as List<dynamic>? ?? (data['data'] as List<dynamic>? ?? []);
  return items.map((e) => Shift.fromJson(e as Map<String, dynamic>)).toList();
});

final attendanceReportProvider = FutureProvider.autoDispose<List<AttendanceRow>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final data = await api.get('/reports/attendance');
  final items = data['items'] as List<dynamic>? ?? (data['data'] as List<dynamic>? ?? []);
  return items.map((e) => AttendanceRow.fromJson(e as Map<String, dynamic>)).toList();
});

final allEscalationsProvider = FutureProvider.autoDispose<List<Escalation>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final data = await api.get('/escalations', query: {'scope': 'all'});
  final items = data['items'] as List<dynamic>? ?? (data['data'] as List<dynamic>? ?? []);
  return items.map((e) => Escalation.fromJson(e as Map<String, dynamic>)).toList();
});

final knowledgeDocumentsProvider = FutureProvider.autoDispose<List<KnowledgeDocument>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final data = await api.get('/knowledge/documents');
  final items = data['items'] as List<dynamic>? ?? (data['data'] as List<dynamic>? ?? []);
  return items.map((e) => KnowledgeDocument.fromJson(e as Map<String, dynamic>)).toList();
});

final adminActionsProvider = Provider((ref) => AdminActions(ref));

class AdminActions {
  final Ref _ref;
  AdminActions(this._ref);
  ApiClient get _api => _ref.read(apiClientProvider);

  Future<void> createNurse({required String name, required String phone, required String password}) =>
      _api.post('/nurses', data: {'name': name, 'phone': phone, 'password': password});

  Future<void> updateNurse(String id, {required String name, required String phone, required bool active}) =>
      _api.put('/nurses/$id', data: {'name': name, 'phone': phone, 'active': active});

  Future<void> deleteNurse(String id) => _api.delete('/nurses/$id');

  Future<void> createShift({required String nurseId, required DateTime start, required DateTime end}) =>
      _api.post('/shifts', data: {
        'nurseId': nurseId,
        'startTime': start.toIso8601String(),
        'endTime': end.toIso8601String(),
      });

  Future<void> updateShift(String id, {required DateTime start, required DateTime end}) => _api.put('/shifts/$id', data: {
        'startTime': start.toIso8601String(),
        'endTime': end.toIso8601String(),
      });

  Future<void> deleteShift(String id) => _api.delete('/shifts/$id');

  Future<void> uploadDocument({required String filePath, required String fileName}) =>
      _api.uploadFile('/knowledge/documents', filePath: filePath, fileName: fileName);

  Future<void> activateDocument(String id) => _api.post('/knowledge/documents/$id/activate');
  Future<void> archiveDocument(String id) => _api.post('/knowledge/documents/$id/archive');
  Future<void> reprocessDocument(String id) => _api.post('/knowledge/documents/$id/reprocess');
  Future<void> deleteDocument(String id) => _api.delete('/knowledge/documents/$id');
}
