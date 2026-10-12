import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../widgets/brand.dart';
import '../../../widgets/powered_by_practigo.dart';

/// Entry point. Patients continue without any account; only clinic staff
/// (doctor / admin) sign in.
class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return EntryScaffold(
      body: SafeArea(
        child: CustomScrollView(
          slivers: [
            SliverFillRemaining(
              hasScrollBody: false,
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 440),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: Builder(builder: _buildContent),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContent(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurfaceVariant;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Spacer(),
        const SizedBox(height: 16),
        const BrandHero(heightFraction: 0.40, minHeight: 170, maxHeight: 360),
        const SizedBox(height: 24),
        Text('Welcome to Prime Ortho', style: theme.textTheme.headlineSmall, textAlign: TextAlign.center),
        const SizedBox(height: 6),
        Text(
          'Expert Care. Faster Recovery.',
          textAlign: TextAlign.center,
          style: theme.textTheme.bodyLarge?.copyWith(color: muted),
        ),
        const Spacer(),
        const SizedBox(height: 32),
        FilledButton.icon(
          onPressed: () => context.go('/patient/start'),
          icon: const Icon(Icons.chat_bubble_outline),
          label: const Text("I'm a patient"),
        ),
        const SizedBox(height: 8),
        Text(
          'No account needed — just your phone number',
          textAlign: TextAlign.center,
          style: theme.textTheme.bodySmall?.copyWith(color: muted),
        ),
        const SizedBox(height: 20),
        OutlinedButton(
          onPressed: () => context.go('/login'),
          child: const Text('Clinic staff sign in'),
        ),
        const SizedBox(height: 20),
        const Center(child: PoweredByPractiGo()),
        const SizedBox(height: 8),
      ],
    );
  }
}
