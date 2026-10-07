import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Wraps secure, encrypted-at-rest storage for the auth session.
/// Never store the JWT (or any credential) in SharedPreferences/plain files.
class SecureStorageService {
  SecureStorageService._internal();
  static final SecureStorageService instance = SecureStorageService._internal();

  // flutter_secure_storage 11+ always encrypts on Android (AES-GCM data cipher with
  // RSA-OAEP key wrapping, backed by the Android KeyStore) - the old
  // `encryptedSharedPreferences: true` flag no longer exists because it is the default.
  final FlutterSecureStorage _storage = const FlutterSecureStorage(
    aOptions: AndroidOptions(),
  );

  // Staff (nurse/admin/doctor) session - JWT based.
  static const _kAccessToken = 'orthocare_access_token';
  static const _kUserId = 'orthocare_user_id';
  static const _kUserRole = 'orthocare_user_role';
  static const _kUserName = 'orthocare_user_name';

  // Patient session. Patients have no account and never log in: they give a
  // phone number once, and the returned chat session id is their only
  // credential, so it is held here rather than in plain storage.
  static const _kPatientSessionId = 'orthocare_patient_session_id';
  static const _kPatientPhone = 'orthocare_patient_phone';
  static const _kPatientName = 'orthocare_patient_name';

  Future<void> saveSession({
    required String accessToken,
    required String userId,
    required String role,
    required String name,
  }) async {
    await Future.wait([
      _storage.write(key: _kAccessToken, value: accessToken),
      _storage.write(key: _kUserId, value: userId),
      _storage.write(key: _kUserRole, value: role),
      _storage.write(key: _kUserName, value: name),
    ]);
  }

  Future<String?> getAccessToken() => _storage.read(key: _kAccessToken);
  Future<String?> getUserId() => _storage.read(key: _kUserId);
  Future<String?> getUserRole() => _storage.read(key: _kUserRole);
  Future<String?> getUserName() => _storage.read(key: _kUserName);

  Future<bool> hasSession() async {
    final token = await getAccessToken();
    return token != null && token.isNotEmpty;
  }

  Future<void> savePatientSession({
    required String sessionId,
    required String phone,
    String? name,
  }) async {
    await Future.wait([
      _storage.write(key: _kPatientSessionId, value: sessionId),
      _storage.write(key: _kPatientPhone, value: phone),
      if (name != null && name.isNotEmpty) _storage.write(key: _kPatientName, value: name),
    ]);
  }

  Future<String?> getPatientSessionId() => _storage.read(key: _kPatientSessionId);
  Future<String?> getPatientPhone() => _storage.read(key: _kPatientPhone);
  Future<String?> getPatientName() => _storage.read(key: _kPatientName);

  Future<bool> hasPatientSession() async {
    final id = await getPatientSessionId();
    return id != null && id.isNotEmpty;
  }

  Future<void> clearPatientSession() => Future.wait([
        _storage.delete(key: _kPatientSessionId),
        _storage.delete(key: _kPatientPhone),
        _storage.delete(key: _kPatientName),
      ]);

  Future<void> clear() => _storage.deleteAll();
}
