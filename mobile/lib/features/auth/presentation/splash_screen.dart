import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../patient/patient_session_controller.dart';
import '../auth_controller.dart';

class SplashScreen extends ConsumerWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Routing decision happens in AppRouter's redirect, driven by
    // authControllerProvider. This screen just shows a brief loading state
    // while the session is being restored from secure storage.
    // Both sessions must finish restoring before the router can decide.
    ref.watch(authControllerProvider);
    ref.watch(patientSessionProvider);
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.health_and_safety_rounded, size: 64, color: scheme.primary),
            const SizedBox(height: 16),
            Text('Prime Ortho', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 4),
            Text(
              'Expert Care. Faster Recovery.',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.outline),
            ),
            const SizedBox(height: 32),
            const CircularProgressIndicator(),
          ],
        ),
      ),
    );
  }
}
