import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/notifications/push_notification_service.dart';
import 'core/routing/app_router.dart';
import 'core/theme/app_theme.dart';

class PrimeOrthoApp extends ConsumerWidget {
  const PrimeOrthoApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);

    // A tapped push notification (e.g. "New Patient Query") deep-links
    // straight to that case's detail screen.
    PushNotificationService.instance.onEscalationTapped = (escalationId) {
      router.push('/doctor/escalations/$escalationId');
    };

    return MaterialApp.router(
      title: 'Prime Ortho',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ThemeMode.system,
      routerConfig: router,
    );
  }
}
