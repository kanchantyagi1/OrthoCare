import 'package:flutter/material.dart' show TimeOfDay;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_client.dart';
import '../../models/dashboard_stats.dart';
import '../../models/document.dart';
import '../../models/escalation.dart';
import '../../models/nurse_summary.dart';
import '../../models/shift.dart';
import '../auth/auth_controller.dart';

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

  // Field names below must match the backend DTOs exactly: NestJS runs its
  // ValidationPipe with forbidNonWhitelisted, so an unexpected key is rejected
  // outright with "property <name> should not exist".
  Future<void> createNurse({
    required String email,
    required String fullName,
    required String phone,
    required String password,
  }) =>
      _api.post('/nurses', data: {
        'email': email,
        'fullName': fullName,
        'phone': phone,
        'password': password,
      });

  Future<void> updateNurse(String id, {required String fullName, required String phone, required bool isActive}) =>
      _api.put('/nurses/$id', data: {'fullName': fullName, 'phone': phone, 'isActive': isActive});

  Future<void> deleteNurse(String id) => _api.delete('/nurses/$id');

  // Shifts are daily "HH:mm" windows, not datetimes - see models/shift.dart.
  Future<void> createShift({
    required String nurseId,
    required TimeOfDay start,
    required TimeOfDay end,
    String? label,
  }) =>
      _api.post('/shifts', data: {
        'nurseId': nurseId,
        if (label != null && label.isNotEmpty) 'label': label,
        'startTime': Shift.toHhMm(start.hour, start.minute),
        'endTime': Shift.toHhMm(end.hour, end.minute),
      });

  Future<void> updateShift(String id, {required TimeOfDay start, required TimeOfDay end}) =>
      _api.put('/shifts/$id', data: {
        'startTime': Shift.toHhMm(start.hour, start.minute),
        'endTime': Shift.toHhMm(end.hour, end.minute),
      });

  Future<void> deleteShift(String id) => _api.delete('/shifts/$id');

  /// `title` is required by the API and is also the key documents are versioned
  /// by, so it is derived from the file name: re-uploading "Knee_Protocol.pdf"
  /// becomes v2 of that document rather than a second unrelated one.
  Future<void> uploadDocument({required String filePath, required String fileName}) {
    final title = fileName.contains('.')
        ? fileName.substring(0, fileName.lastIndexOf('.'))
        : fileName;
    return _api.uploadFile(
      '/knowledge/documents',
      filePath: filePath,
      fileName: fileName,
      fields: {'title': title},
    );
  }

  Future<void> activateDocument(String id) => _api.post('/knowledge/documents/$id/activate');
  Future<void> archiveDocument(String id) => _api.post('/knowledge/documents/$id/archive');
  Future<void> reprocessDocument(String id) => _api.post('/knowledge/documents/$id/reprocess');
  Future<void> deleteDocument(String id) => _api.delete('/knowledge/documents/$id');
}
