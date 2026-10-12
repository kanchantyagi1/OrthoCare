import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../widgets/brand.dart';
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
    // White, like the Android launch screen before it, so the hand-over from
    // the system splash to Flutter has no flash.
    return const EntryScaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            BrandHero(heightFraction: 0.34, minHeight: 160, maxHeight: 320),
            SizedBox(height: 32),
            SizedBox(width: 28, height: 28, child: CircularProgressIndicator(strokeWidth: 2.6)),
          ],
        ),
      ),
    );
  }
}
