import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../config/app_config.dart';
import '../storage/secure_storage_service.dart';
import 'api_exception.dart';

/// Callback invoked when the server reports the session is no longer valid
/// (401). The app router listens for this to force a return to Login.
typedef OnUnauthorized = void Function();

/// Thin wrapper around Dio implementing the REST contract in docs/API.md.
/// All endpoints match the backend 1:1 — see section 54 of the product spec.
class ApiClient {
  ApiClient({OnUnauthorized? onUnauthorized}) : _onUnauthorized = onUnauthorized {
    _dio = Dio(
      BaseOptions(
        baseUrl: AppConfig.apiBaseUrl,
        connectTimeout: const Duration(milliseconds: AppConfig.requestTimeoutMs),
        receiveTimeout: const Duration(milliseconds: AppConfig.requestTimeoutMs),
        contentType: 'application/json',
      ),
    );

    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await SecureStorageService.instance.getAccessToken();
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onError: (error, handler) {
          if (error.response?.statusCode == 401) {
            _onUnauthorized?.call();
          }
          handler.next(error);
        },
      ),
    );

    if (AppConfig.debugLogging && !kReleaseMode) {
      _dio.interceptors.add(
        LogInterceptor(requestBody: true, responseBody: true, error: true),
      );
    }
  }

  late final Dio _dio;
  final OnUnauthorized? _onUnauthorized;

  Future<Map<String, dynamic>> get(String path, {Map<String, dynamic>? query}) =>
      _request(() => _dio.get(path, queryParameters: query));

  Future<Map<String, dynamic>> post(String path, {Object? data}) =>
      _request(() => _dio.post(path, data: data));

  Future<Map<String, dynamic>> put(String path, {Object? data}) =>
      _request(() => _dio.put(path, data: data));

  Future<Map<String, dynamic>> delete(String path) => _request(() => _dio.delete(path));

  Future<Map<String, dynamic>> uploadFile(
    String path, {
    required String filePath,
    required String fileName,
    Map<String, dynamic>? fields,
  }) {
    return _request(() async {
      final formData = FormData.fromMap({
        ...?fields,
        'file': await MultipartFile.fromFile(filePath, filename: fileName),
      });
      return _dio.post(path, data: formData);
    });
  }

  Future<Map<String, dynamic>> _request(
    Future<Response<dynamic>> Function() call,
  ) async {
    try {
      final response = await call();
      final data = response.data;
      if (data is Map<String, dynamic>) return data;
      // Some endpoints (lists) return a bare JSON array; wrap for a uniform
      // return type and let callers read `data['items']`.
      return {'items': data};
    } on DioException catch (e) {
      if (e.type == DioExceptionType.connectionError ||
          e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.receiveTimeout) {
        throw ApiException.network();
      }
      final status = e.response?.statusCode;
      if (status == 401) throw ApiException.unauthorized();
      final serverMessage = _extractMessage(e.response?.data);
      if (status != null && status >= 500) {
        throw ApiException.server();
      }
      throw ApiException(message: serverMessage ?? 'Something went wrong. Please try again.', statusCode: status);
    }
  }

  String? _extractMessage(dynamic data) {
    if (data is Map && data['message'] != null) {
      final m = data['message'];
      if (m is String) return m;
      if (m is List && m.isNotEmpty) return m.first.toString();
    }
    return null;
  }
}
