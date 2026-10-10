import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../widgets/loading_overlay.dart';
import '../../auth/auth_controller.dart';
import '../admin_controller.dart';

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
                  _StatCard(label: 'Active Doctors', value: s.activeDoctors),
                  _StatCard(label: 'Patient Chats', value: s.patientChats),
                  _StatCard(label: 'Resolved Instantly', value: s.resolvedByAssistant),
                  _StatCard(label: 'Human Escalations', value: s.humanEscalations),
                  _StatCard(label: 'Pending', value: s.pending),
                  _StatCard(label: 'Urgent', value: s.urgent, highlight: true),
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
  const _StatCard({required this.label, required this.value, this.highlight = false});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      color: highlight ? scheme.errorContainer : null,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('$value', style: Theme.of(context).textTheme.headlineMedium),
            Text(label, style: Theme.of(context).textTheme.bodySmall),
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
          ],
        ),
      ),
    );
  }
}
