import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../models/escalation.dart';
import '../../../widgets/loading_overlay.dart';
import '../../../widgets/status_badge.dart';
import '../patient_controller.dart';

class EscalationStatusScreen extends ConsumerWidget {
  const EscalationStatusScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final escalations = ref.watch(patientEscalationsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('My Requests to Nurse')),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(patientEscalationsProvider),
        child: escalations.when(
          loading: () => const LoadingOverlay(),
          error: (e, _) =>
              ErrorRetryView(message: e.toString(), onRetry: () => ref.invalidate(patientEscalationsProvider)),
          data: (items) {
            if (items.isEmpty) {
              return const EmptyStateView(message: 'No pending requests to the clinic team.', icon: Icons.support_agent_outlined);
            }
            return ListView.separated(
              padding: const EdgeInsets.all(12),
              itemCount: items.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, i) {
                final e = items[i];
                return Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(e.question, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            StatusBadge(status: e.status),
                            const Spacer(),
                            Text(DateFormat.yMMMd().add_jm().format(e.createdAt), style: Theme.of(context).textTheme.bodySmall),
                          ],
                        ),
                        if (e.status == EscalationStatus.resolved) ...[
                          const SizedBox(height: 8),
                          const Text('A nurse has reviewed and resolved this request.'),
                        ] else ...[
                          const SizedBox(height: 8),
                          const Text('The clinic team will contact you shortly.'),
                        ],
                      ],
                    ),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
