import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_client.dart';
import '../../core/notifications/push_notification_service.dart';
import '../../core/storage/secure_storage_service.dart';
import '../../models/user.dart';

enum AuthStatus { unknown, authenticated, unauthenticated }

class AuthState {
  final AuthStatus status;
  final AppUser? user;
  final String? error;

  const AuthState({required this.status, this.user, this.error});

  const AuthState.unknown() : this(status: AuthStatus.unknown);

  AuthState copyWith({AuthStatus? status, AppUser? user, String? error}) =>
      AuthState(status: status ?? this.status, user: user ?? this.user, error: error);
}

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(onUnauthorized: () => ref.read(authControllerProvider.notifier).forceLogout());
});

final authControllerProvider = StateNotifierProvider<AuthController, AuthState>((ref) {
  return AuthController(ref);
});

class AuthController extends StateNotifier<AuthState> {
  final Ref _ref;
  AuthController(this._ref) : super(const AuthState.unknown()) {
    _restoreSession();
  }

  Future<void> _restoreSession() async {
    final hasSession = await SecureStorageService.instance.hasSession();
    if (!hasSession) {
      state = const AuthState(status: AuthStatus.unauthenticated);
      return;
    }
    final id = await SecureStorageService.instance.getUserId();
    final role = await SecureStorageService.instance.getUserRole();
    final name = await SecureStorageService.instance.getUserName();
    if (id == null || role == null) {
      state = const AuthState(status: AuthStatus.unauthenticated);
      return;
    }
    state = AuthState(
      status: AuthStatus.authenticated,
      user: AppUser(id: id, name: name ?? '', role: roleFromString(role)),
    );
  }

  Future<void> login({required String identifier, required String password}) async {
    final api = _ref.read(apiClientProvider);
    final deviceToken = await PushNotificationService.instance.getDeviceToken();
    try {
      final response = await api.post('/auth/login', data: {
        'identifier': identifier,
        'password': password,
        if (deviceToken != null) 'deviceToken': deviceToken,
      });
      final session = AuthSession.fromJson(response);
      await SecureStorageService.instance.saveSession(
        accessToken: session.accessToken,
        userId: session.user.id,
        role: session.user.role.name,
        name: session.user.name,
      );
      state = AuthState(status: AuthStatus.authenticated, user: session.user);
    } catch (e) {
      state = AuthState(status: AuthStatus.unauthenticated, error: e.toString());
      rethrow;
    }
  }

  /// Moves a doctor or admin off the temporary password. The server verifies
  /// [currentPassword] against the stored hash, so this is also the path for
  /// a normal password change. The session stays valid afterwards.
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    await _ref.read(apiClientProvider).post('/auth/change-password', data: {
      'currentPassword': currentPassword,
      'newPassword': newPassword,
    });
  }

  Future<void> logout() async {
    try {
      await _ref.read(apiClientProvider).post('/auth/logout');
    } catch (_) {
      // Best-effort: proceed with local logout even if the call fails.
    }
    await forceLogout();
  }

  Future<void> forceLogout() async {
    await SecureStorageService.instance.clear();
    state = const AuthState(status: AuthStatus.unauthenticated);
  }
}
