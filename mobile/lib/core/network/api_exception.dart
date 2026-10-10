/// A normalized error surfaced from the API client to the UI layer.
/// UI code should show [message] directly; it is always safe/user-facing.
class ApiException implements Exception {
  final String message;
  final int? statusCode;
  final bool isNetworkError;

  const ApiException({
    required this.message,
    this.statusCode,
    this.isNetworkError = false,
  });

  factory ApiException.network() => const ApiException(
        message:
            'We couldn\'t reach the Prime Ortho server. Please check your connection and try again.',
        isNetworkError: true,
      );

  factory ApiException.unauthorized() => const ApiException(
        message: 'Your session has expired. Please log in again.',
        statusCode: 401,
      );

  factory ApiException.server() => const ApiException(
        message:
            'We\'re temporarily unable to process this request. Please try again shortly.',
        statusCode: 500,
      );

  @override
  String toString() => message;
}
