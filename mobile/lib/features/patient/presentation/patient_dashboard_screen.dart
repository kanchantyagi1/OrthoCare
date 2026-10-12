import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_theme.dart';
import '../../../widgets/brand.dart';
import '../../../widgets/dashboard.dart';
import '../patient_session_controller.dart';

class PatientDashboardScreen extends ConsumerWidget {
  const PatientDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(patientSessionProvider);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final name = (session.name?.isNotEmpty ?? false) ? session.name! : 'there';

    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            BrandAvatar(size: 34),
            SizedBox(width: 10),
            Text('Prime Ortho'),
          ],
        ),
        actions: [
          // Patients have no account to log out of; this just forgets the
          // phone number and chat session on this device.
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Finish',
            onPressed: () async {
              await ref.read(patientSessionProvider.notifier).end();
              if (context.mounted) context.go('/welcome');
            },
          ),
        ],
      ),
      body: ListView(
        padding: EdgeInsets.fromLTRB(20, 8, 20, 24 + MediaQuery.paddingOf(context).bottom),
        children: [
          Text('Hi $name 👋', style: theme.textTheme.headlineSmall),
          const SizedBox(height: 4),
          Text('Expert Care. Faster Recovery.',
              style: theme.textTheme.bodyLarge?.copyWith(color: scheme.onSurfaceVariant)),
          const SizedBox(height: 20),
          _AskCard(onTap: () => context.push('/patient/chat')),
          const SizedBox(height: 28),
          const SectionHeader('Your care'),
          ActionTile(
            icon: Icons.history,
            title: 'Chat history',
            subtitle: 'Review your previous conversations',
            onTap: () => context.push('/patient/history'),
          ),
          const SizedBox(height: 12),
          ActionTile(
            icon: Icons.support_agent_outlined,
            title: 'My requests to a doctor',
            subtitle: 'Track status of escalated questions',
            onTap: () => context.push('/patient/escalations'),
          ),
          const SizedBox(height: 28),
          const _EmergencyNote(),
        ],
      ),
    );
  }
}

/// The main thing a patient opens the app to do, so it leads the screen.
class _AskCard extends StatelessWidget {
  const _AskCard({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: AppTheme.navy,
      borderRadius: BorderRadius.circular(AppTheme.radiusLg),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const BrandAvatar(size: 44),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          "Dr. Shekhar Srivastav's Assistant",
                          style: theme.textTheme.titleMedium?.copyWith(color: Colors.white),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Get answers from your clinic about your recovery.',
                          style: theme.textTheme.bodyMedium?.copyWith(color: Colors.white.withValues(alpha: 0.82)),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              FilledButton.icon(
                onPressed: onTap,
                style: FilledButton.styleFrom(backgroundColor: Colors.white, foregroundColor: AppTheme.navy),
                icon: const Icon(Icons.chat_bubble_outline),
                label: const Text('Ask a question'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EmergencyNote extends StatelessWidget {
  const _EmergencyNote();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: scheme.errorContainer.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(AppTheme.radiusMd),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.local_hospital_outlined, size: 20, color: scheme.onErrorContainer),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'In a life-threatening emergency, go to the nearest ER or Shanti Mukand Hospital Casualty.',
              style: theme.textTheme.bodySmall?.copyWith(color: scheme.onErrorContainer),
            ),
          ),
        ],
      ),
    );
  }
}
