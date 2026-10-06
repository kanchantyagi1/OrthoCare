import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../widgets/loading_overlay.dart';
import '../../../widgets/priority_chip.dart';
import '../../../widgets/status_badge.dart';
import '../admin_controller.dart';

/// Admin/doctor view of every escalation across all nurses (spec section 37).
/// Tapping a row reuses the nurse Escalation Detail screen at
/// /nurse/escalations/:id, which already exposes the doctor-escalation
/// action and is authorization-gated server-side by role.
class AdminEscalationsScreen extends ConsumerWidget {
  const AdminEscalationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final escalations = ref.watch(allEscalationsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Escalations')),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(allEscalationsProvider),
        child: escalations.when(
          loading: () => const LoadingOverlay(),
          error: (e, _) => ErrorRetryView(message: e.toString(), onRetry: () => ref.invalidate(allEscalationsProvider)),
          data: (items) {
            if (items.isEmpty) {
              return const EmptyStateView(message: 'No escalations recorded yet.', icon: Icons.support_agent_outlined);
            }
            return ListView.separated(
              padding: const EdgeInsets.all(12),
              itemCount: items.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (context, i) {
                final e = items[i];
                return ListTile(
                  title: Text(e.patientName),
                  subtitle: Text(e.question, maxLines: 1, overflow: TextOverflow.ellipsis),
                  leading: PriorityChip(priority: e.priority),
                  trailing: Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      StatusBadge(status: e.status),
                      const SizedBox(height: 4),
                      Text(DateFormat.MMMd().add_jm().format(e.createdAt), style: Theme.of(context).textTheme.bodySmall),
                    ],
                  ),
                  onTap: () => context.push('/nurse/escalations/${e.id}'),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
