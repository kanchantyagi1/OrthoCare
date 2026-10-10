import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../widgets/powered_by_practigo.dart';

/// Entry point. Patients continue without any account; only clinic staff
/// (doctor / admin) sign in.
class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.health_and_safety_rounded, size: 56, color: theme.colorScheme.primary),
                  const SizedBox(height: 16),
                  Text('Prime Ortho', style: theme.textTheme.headlineMedium, textAlign: TextAlign.center),
                  const SizedBox(height: 8),
                  Text(
                    'Expert Care. Faster Recovery.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: theme.colorScheme.outline),
                  ),
                  const SizedBox(height: 40),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: () => context.go('/patient/start'),
                      style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 16)),
                      child: const Text("I'm a patient"),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'No account needed — just your phone number',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                  ),
                  const SizedBox(height: 32),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: () => context.go('/login'),
                      style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 16)),
                      child: const Text('Clinic staff sign in'),
                    ),
                  ),
                  const SizedBox(height: 40),
                  const PoweredByPractiGo(),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
