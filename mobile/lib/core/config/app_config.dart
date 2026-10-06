/// Build-time configuration. Never hard-code secrets or environment-specific
/// hosts here — always pass via `--dart-define` so the same codebase works
/// across dev/staging/prod without code changes.
///
/// Example:
///   flutter run --dart-define=API_BASE_URL=https://api.orthocare.example.com
class AppConfig {
  AppConfig._();

  /// Backend REST API base URL. Defaults to a local dev backend.
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000', // Android emulator -> host loopback
  );

  /// Request timeout, in milliseconds.
  static const int requestTimeoutMs = 20000;

  /// Whether verbose network/debug logging is enabled.
  static const bool debugLogging = bool.fromEnvironment(
    'DEBUG_LOGGING',
    defaultValue: true,
  );
}
