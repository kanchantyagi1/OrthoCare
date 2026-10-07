import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/storage/secure_storage_service.dart';
import '../auth/auth_controller.dart';

enum PatientSessionStatus { unknown, none, active }

/// Patients do not have accounts and never log in (product decision): they
/// enter a phone number once, which both starts their chat session and gives
/// the nurse a number to call back on if the question gets escalated.
///
/// The server-issued `sessionId` is the patient's only credential, so it is
/// kept in secure storage and sent explicitly on every patient request.
class PatientSession {
  final PatientSessionStatus status;
  final String? sessionId;
  final String? phone;
  final String? name;
  final String? error;

  const PatientSession({
    required this.status,
    this.sessionId,
    this.phone,
    this.name,
    this.error,
  });

  const PatientSession.unknown() : this(status: PatientSessionStatus.unknown);
}

final patientSessionProvider =
    StateNotifierProvider<PatientSessionController, PatientSession>((ref) {
  return PatientSessionController(ref);
});

class PatientSessionController extends StateNotifier<PatientSession> {
  final Ref _ref;
  PatientSessionController(this._ref) : super(const PatientSession.unknown()) {
    _restore();
  }

  Future<void> _restore() async {
    final storage = SecureStorageService.instance;
    final sessionId = await storage.getPatientSessionId();
    if (sessionId == null || sessionId.isEmpty) {
      state = const PatientSession(status: PatientSessionStatus.none);
      return;
    }
    state = PatientSession(
      status: PatientSessionStatus.active,
      sessionId: sessionId,
      phone: await storage.getPatientPhone(),
      name: await storage.getPatientName(),
    );
  }

  /// Starts (or resumes) a chat session for this phone number. No password,
  /// no account - the backend finds-or-creates the patient by phone.
  Future<void> start({required String phone, String? name}) async {
    final api = _ref.read(apiClientProvider);
    try {
      final response = await api.post('/chat/session', data: {
        'phone': phone,
        if (name != null && name.isNotEmpty) 'name': name,
      });
      final sessionId = (response['sessionId'] ?? response['id']) as String?;
      if (sessionId == null || sessionId.isEmpty) {
        throw Exception('Server did not return a chat session id');
      }
      await SecureStorageService.instance
          .savePatientSession(sessionId: sessionId, phone: phone, name: name);
      state = PatientSession(
        status: PatientSessionStatus.active,
        sessionId: sessionId,
        phone: phone,
        name: name,
      );
    } catch (e) {
      state = PatientSession(status: PatientSessionStatus.none, error: e.toString());
      rethrow;
    }
  }

  Future<void> end() async {
    await SecureStorageService.instance.clearPatientSession();
    state = const PatientSession(status: PatientSessionStatus.none);
  }
}
