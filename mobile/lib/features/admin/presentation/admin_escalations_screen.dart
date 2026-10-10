import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../models/escalation.dart';
import '../../../widgets/loading_overlay.dart';
import '../../../widgets/priority_chip.dart';
import '../../../widgets/status_badge.dart';
import '../admin_controller.dart';

/// Matches the predicates the admin dashboard's own stat cards use (see
/// dashboard.service.ts `overview()`), so a card's number and the list it
/// opens always agree - a mismatch there is worse than the card not
/// navigating anywhere at all.
enum EscalationDashboardFilter { today, pending, urgent }

bool _matchesFilter(Escalation e, EscalationDashboardFilter filter) {
  switch (filter) {
    case EscalationDashboardFilter.today:
      // "Human Escalations" is created-today, scoped to the clinic's own
      // timezone server-side. There is no clean client-side equivalent to
      // that exact boundary, so this approximates it with the device's own
      // calendar day - already .toLocal() on the way in - which matches the
      // server's definition whenever the device and clinic share a timezone.
      final now = DateTime.now();
      return e.createdAt.year == now.year && e.createdAt.month == now.month && e.createdAt.day == now.day;
    case EscalationDashboardFilter.pending:
      return e.status == EscalationStatus.waitingForDoctor || e.status == EscalationStatus.assigned;
    case EscalationDashboardFilter.urgent:
      return e.priority == EscalationPriority.urgent && e.status == EscalationStatus.assigned;
  }
}

String _filterLabel(EscalationDashboardFilter filter) {
  switch (filter) {
    case EscalationDashboardFilter.today:
      return 'Today';
    case EscalationDashboardFilter.pending:
      return 'Pending';
    case EscalationDashboardFilter.urgent:
      return 'Urgent';
  }
}

/// Admin view of escalations across all doctors (spec section 37). Tapping a
/// row reuses the doctor Escalation Detail screen at /doctor/escalations/:id,
/// which is authorization-gated server-side by role.
///
/// [filter] narrows the list to match whichever dashboard stat card was
/// tapped (see AdminDashboardScreen); omit it to see everything.
class AdminEscalationsScreen extends ConsumerWidget {
  final EscalationDashboardFilter? filter;
  const AdminEscalationsScreen({super.key, this.filter});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final escalations = ref.watch(allEscalationsProvider);
    final activeFilter = filter;
    return Scaffold(
      appBar: AppBar(title: Text(activeFilter == null ? 'Escalations' : 'Escalations — ${_filterLabel(activeFilter)}')),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(allEscalationsProvider),
        child: escalations.when(
          loading: () => const LoadingOverlay(),
          error: (e, _) => ErrorRetryView(message: e.toString(), onRetry: () => ref.invalidate(allEscalationsProvider)),
          data: (items) {
            final filtered = activeFilter == null ? items : items.where((e) => _matchesFilter(e, activeFilter)).toList();
            if (filtered.isEmpty) {
              return EmptyStateView(
                message: activeFilter == null ? 'No escalations recorded yet.' : 'No escalations match this filter.',
                icon: Icons.support_agent_outlined,
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.all(12),
              itemCount: filtered.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (context, i) {
                final e = filtered[i];
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
                  onTap: () => context.push('/doctor/escalations/${e.id}'),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
