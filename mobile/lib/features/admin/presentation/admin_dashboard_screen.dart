import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

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
          IconButton(icon: const Icon(Icons.logout), onPressed: () => ref.read(authControllerProvider.notifier).logout()),
        ],
      ),
      drawer: const _AdminDrawer(),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(adminDashboardProvider),
        child: stats.when(
          loading: () => const LoadingOverlay(),
          error: (e, _) => ErrorRetryView(message: e.toString(), onRetry: () => ref.invalidate(adminDashboardProvider)),
          data: (s) => ListView(
            padding: const EdgeInsets.all(16),
            children: [
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 1.6,
                children: [
                  // "Active Doctors" literally counts currently-open attendance
                  // rows (dashboard.service.ts), so Attendance is the screen
                  // that number actually comes from - not Doctor Management,
                  // whose "active" means "not removed", a different concept.
                  _StatCard(
                    label: 'Active Doctors',
                    value: s.activeDoctors,
                    onTap: () => context.push('/admin/attendance'),
                  ),
                  // No admin chat-browser screen exists for these two, and
                  // routing to something that doesn't show this data would be
                  // misleading - left inert rather than guessing a destination.
                  _StatCard(label: 'Patient Chats', value: s.patientChats),
                  _StatCard(label: 'Resolved Instantly', value: s.resolvedByAssistant),
                  _StatCard(
                    label: 'Human Escalations',
                    value: s.humanEscalations,
                    onTap: () => context.push('/admin/escalations', extra: EscalationDashboardFilter.today),
                  ),
                  _StatCard(
                    label: 'Pending',
                    value: s.pending,
                    onTap: () => context.push('/admin/escalations', extra: EscalationDashboardFilter.pending),
                  ),
                  _StatCard(
                    label: 'Urgent',
                    value: s.urgent,
                    highlight: true,
                    onTap: () => context.push('/admin/escalations', extra: EscalationDashboardFilter.urgent),
                  ),
                ],
              ),
              const SizedBox(height: 24),
              Text('Doctor Performance', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              Card(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: DataTable(
                    columns: const [
                      DataColumn(label: Text('Doctor')),
                      DataColumn(label: Text('Assigned')),
                      DataColumn(label: Text('Resolved')),
                      DataColumn(label: Text('Pending')),
                      DataColumn(label: Text('Avg Response')),
                      DataColumn(label: Text('SLA Breaches')),
                    ],
                    rows: s.doctorPerformance
                        .map((d) => DataRow(cells: [
                              DataCell(Text(d.doctorName)),
                              DataCell(Text('${d.assigned}')),
                              DataCell(Text('${d.resolved}')),
                              DataCell(Text('${d.pending}')),
                              DataCell(Text('${d.averageResponseMinutes.toStringAsFixed(0)} min')),
                              DataCell(Text('${d.slaBreaches}')),
                            ]))
                        .toList(),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final int value;
  final bool highlight;
  final VoidCallback? onTap;
  const _StatCard({required this.label, required this.value, this.highlight = false, this.onTap});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final content = Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('$value', style: Theme.of(context).textTheme.headlineMedium),
              // The only visual cue that a card is tappable - an inert card
              // must not look interactive, so this is omitted when onTap is null.
              if (onTap != null) Icon(Icons.chevron_right, size: 18, color: scheme.outline),
            ],
          ),
          Text(label, style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
    return Card(
      color: highlight ? scheme.errorContainer : null,
      clipBehavior: Clip.antiAlias,
      child: onTap == null ? content : InkWell(onTap: onTap, child: content),
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
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text('Prime Ortho — Admin', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
            ),
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
