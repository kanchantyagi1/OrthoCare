import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../models/escalation.dart';
import '../../../widgets/loading_overlay.dart';
import '../../../widgets/priority_chip.dart';
import '../../../widgets/status_badge.dart';
import '../doctor_controller.dart';

class EscalationsListScreen extends ConsumerWidget {
  const EscalationsListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final escalations = ref.watch(doctorEscalationsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Cases')),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(doctorEscalationsProvider),
        child: escalations.when(
          loading: () => const LoadingOverlay(),
          error: (e, _) => ErrorRetryView(message: e.toString(), onRetry: () => ref.invalidate(doctorEscalationsProvider)),
          data: (items) {
            if (items.isEmpty) {
              return const EmptyStateView(message: 'No cases right now.', icon: Icons.check_circle_outline);
            }
            final sorted = [...items]..sort((a, b) {
                const order = {
                  EscalationPriority.urgent: 0,
                  EscalationPriority.high: 1,
                  EscalationPriority.normal: 2,
                };
                return order[a.priority]!.compareTo(order[b.priority]!);
              });
            return ListView.separated(
              padding: const EdgeInsets.all(12),
              itemCount: sorted.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, i) {
                final e = sorted[i];
                return Card(
                  child: ListTile(
                    onTap: () => context.push('/doctor/escalations/${e.id}'),
                    title: Text(e.patientName, style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(e.question, maxLines: 2, overflow: TextOverflow.ellipsis),
                    ),
                    trailing: Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        PriorityChip(priority: e.priority),
                        const SizedBox(height: 6),
                        Text(DateFormat.jm().format(e.createdAt), style: Theme.of(context).textTheme.bodySmall),
                      ],
                    ),
                    isThreeLine: true,
                    leading: StatusBadge(status: e.status),
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
