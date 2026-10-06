import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

/// Wraps Firebase Cloud Messaging. Every call is guarded so the app keeps
/// working in dev/mock mode when no Firebase project (google-services.json)
/// is configured — we log and no-op instead of crashing.
class PushNotificationService {
  PushNotificationService._internal();
  static final PushNotificationService instance = PushNotificationService._internal();

  bool _initialized = false;
  void Function(String escalationId)? onEscalationTapped;

  Future<void> initialize() async {
    try {
      await Firebase.initializeApp();
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission(alert: true, badge: true, sound: true);

      FirebaseMessaging.onMessageOpenedApp.listen(_handleMessageTap);

      final initialMessage = await messaging.getInitialMessage();
      if (initialMessage != null) _handleMessageTap(initialMessage);

      _initialized = true;
    } catch (e) {
      // No Firebase project configured for this build, or platform channel
      // unavailable in this environment — push notifications are disabled,
      // the rest of the app continues to work normally.
      debugPrint('[PushNotificationService] Firebase unavailable, continuing without push: $e');
    }
  }

  Future<String?> getDeviceToken() async {
    if (!_initialized) return null;
    try {
      return await FirebaseMessaging.instance.getToken();
    } catch (e) {
      debugPrint('[PushNotificationService] could not read FCM token: $e');
      return null;
    }
  }

  void _handleMessageTap(RemoteMessage message) {
    final escalationId = message.data['escalationId'] as String?;
    if (escalationId != null) onEscalationTapped?.call(escalationId);
  }
}
