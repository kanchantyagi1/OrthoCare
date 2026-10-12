import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_theme.dart';
import '../../../models/dashboard_stats.dart';
import '../../../widgets/brand.dart';
import '../../../widgets/dashboard.dart';
import '../../../widgets/loading_overlay.dart';
import '../../auth/auth_controller.dart';
import '../admin_controller.dart';
import 'admin_escalations_screen.dart' show EscalationDashboardFilter;

class AdminDashboardScreen extends ConsumerWidget {
  const AdminDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final stats = ref.watch(adminDashboardProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Admin Dashboard'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Log out',
            onPressed: () => ref.read(authControllerProvider.notifier).logout(),
          ),
        ],
      ),
      drawer: const _AdminDrawer(),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(adminDashboardProvider),
        child: stats.when(
          loading: () => const LoadingOverlay(),
          error: (e, _) => ErrorRetryView(message: e.toString(), onRetry: () => ref.invalidate(adminDashboardProvider)),
          data: (s) => ListView(
            padding: EdgeInsets.fromLTRB(16, 8, 16, 24 + MediaQuery.paddingOf(context).bottom),
            children: [
              const SectionHeader('Overview'),
              StatGrid(
                children: [
                  // "Active Doctors" literally counts currently-open attendance
                  // rows (dashboard.service.ts), so Attendance is the screen
                  // that number actually comes from - not Doctor Management,
                  // whose "active" means "not removed", a different concept.
                  StatTile(
                    label: 'Active doctors',
                    value: '${s.activeDoctors}',
                    icon: Icons.badge_outlined,
                    onTap: () => context.push('/admin/attendance'),
                  ),
                  // No admin chat-browser screen exists for these two, and
                  // routing to something that doesn't show this data would be
                  // misleading - left inert rather than guessing a destination.
                  StatTile(
                    label: 'Patient chats',
                    value: '${s.patientChats}',
                    icon: Icons.forum_outlined,
                  ),
                  StatTile(
                    label: 'Resolved instantly',
                    value: '${s.resolvedByAssistant}',
                    icon: Icons.task_alt,
                    color: AppTheme.success,
                  ),
                  StatTile(
                    label: 'Human escalations',
                    value: '${s.humanEscalations}',
                    icon: Icons.support_agent_outlined,
                    color: AppTheme.normal,
                    onTap: () => context.push('/admin/escalations', extra: EscalationDashboardFilter.today),
                  ),
                  StatTile(
                    label: 'Pending',
                    value: '${s.pending}',
                    icon: Icons.hourglass_bottom_rounded,
                    color: AppTheme.high,
                    onTap: () => context.push('/admin/escalations', extra: EscalationDashboardFilter.pending),
                  ),
                  StatTile(
                    label: 'Urgent',
                    value: '${s.urgent}',
                    icon: Icons.priority_high_rounded,
                    color: AppTheme.urgent,
                    highlight: s.urgent > 0,
                    onTap: () => context.push('/admin/escalations', extra: EscalationDashboardFilter.urgent),
                  ),
                ],
              ),
              const SizedBox(height: 28),
              const SectionHeader('Doctor performance'),
              if (s.doctorPerformance.isEmpty)
                Card(
                  margin: EdgeInsets.zero,
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Text(
                      'No doctor activity yet.',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: Theme.of(context).colorScheme.onSurfaceVariant,
                          ),
                    ),
                  ),
                )
              else
                for (final d in s.doctorPerformance) ...[
                  _DoctorPerformanceCard(performance: d),
                  const SizedBox(height: 10),
                ],
            ],
          ),
        ),
      ),
    );
  }
}

/// One doctor's numbers as a compact card - a phone-width alternative to a
/// six-column table that had to be scrolled sideways.
class _DoctorPerformanceCard extends StatelessWidget {
  const _DoctorPerformanceCard({required this.performance});

  final DoctorPerformance performance;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final d = performance;

    Widget metric(String value, String label, {Color? color}) => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(value, style: theme.textTheme.titleMedium?.copyWith(color: color, fontWeight: FontWeight.w700)),
            Text(label, style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
          ],
        );

    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(d.doctorName, style: theme.textTheme.titleMedium),
            const SizedBox(height: 12),
            Wrap(
              spacing: 22,
              runSpacing: 12,
              children: [
                metric('${d.assigned}', 'Assigned'),
                metric('${d.resolved}', 'Resolved', color: AppTheme.success),
                metric('${d.pending}', 'Pending', color: d.pending > 0 ? AppTheme.high : null),
                metric('${d.averageResponseMinutes.toStringAsFixed(0)} min', 'Avg response'),
                metric('${d.slaBreaches}', 'SLA breaches', color: d.slaBreaches > 0 ? AppTheme.urgent : null),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _AdminDrawer extends StatelessWidget {
  const _AdminDrawer();

  @override
  Widget build(BuildContext context) {
    Widget item(IconData icon, String label, String route) => ListTile(
          leading: Icon(icon),
          title: Text(label),
          onTap: () {
            Navigator.of(context).pop();
            context.push(route);
          },
        );

    return Drawer(
      child: SafeArea(
        child: ListView(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
              child: Row(
                children: [
                  const BrandAvatar(size: 44),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Prime Ortho', style: Theme.of(context).textTheme.titleMedium),
                        Text(
                          'Admin',
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                color: Theme.of(context).colorScheme.onSurfaceVariant,
                              ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const Divider(height: 16),
            item(Icons.dashboard_outlined, 'Dashboard', '/admin/dashboard'),
            item(Icons.people_outline, 'Doctor Management', '/admin/doctors'),
            item(Icons.schedule_outlined, 'Shift Management', '/admin/shifts'),
            item(Icons.fingerprint, 'Attendance', '/admin/attendance'),
            item(Icons.support_agent_outlined, 'Escalations', '/admin/escalations'),
            item(Icons.menu_book_outlined, 'Knowledge Base', '/admin/knowledge'),
            const Divider(height: 24),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Text(
                'ACCOUNT',
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: Theme.of(context).colorScheme.outline,
                      fontWeight: FontWeight.w700,
                    ),
              ),
            ),
            // Admins never see the doctor Profile screen, which was previously
            // the only route to this - so a new admin on the temporary password
            // had no way to change it in-app.
            item(Icons.lock_reset_outlined, 'Change password', '/change-password'),
          ],
        ),
      ),
    );
  }
}
