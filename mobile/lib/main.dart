import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/notifications/push_notification_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Guarded internally: runs fine in dev/mock mode with no Firebase project
  // configured (no google-services.json), just without push notifications.
  await PushNotificationService.instance.initialize();

  runApp(const ProviderScope(child: PrimeOrthoApp()));
}
