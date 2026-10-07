import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_theme.dart';
import '../../../widgets/loading_overlay.dart';
import '../../auth/auth_controller.dart';
import '../nurse_controller.dart';

class NurseDashboardScreen extends ConsumerWidget {
  const NurseDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dashboard = ref.watch(nurseDashboardProvider);
    final attendance = ref.watch(attendanceControllerProvider);
    final user = ref.watch(authControllerProvider).user;

    return Scaffold(
      appBar: AppBar(
        title: Text('Hello ${user?.name ?? 'Nurse'}'),
        actions: [
          IconButton(
            icon: const Icon(Icons.person_outline),
            onPressed: () => context.push('/nurse/profile'),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(nurseDashboardProvider);
          await ref.read(attendanceControllerProvider.notifier).refresh();
        },
        child: dashboard.when(
          loading: () => const LoadingOverlay(),
          error: (e, _) => ErrorRetryView(message: e.toString(), onRetry: () => ref.invalidate(nurseDashboardProvider)),
          data: (data) {
            final isActive = attendance.valueOrNull?.status.name == 'active';
            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _ShiftCard(
                  shiftLabel: data.todayShift == null
                      ? 'No shift scheduled today'
                      : data.todayShift!.rangeLabel,
                  isActive: isActive,
                  busy: attendance.isLoading,
                  onPunchIn: () => ref.read(attendanceControllerProvider.notifier).punchIn(),
                  onPunchOut: () => ref.read(attendanceControllerProvider.notifier).punchOut(),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(child: _StatCard(label: 'New', value: data.newCases, color: AppTheme.urgent)),
                    const SizedBox(width: 12),
                    Expanded(child: _StatCard(label: 'Pending', value: data.pending, color: AppTheme.high)),
                    const SizedBox(width: 12),
                    Expanded(child: _StatCard(label: 'Resolved', value: data.resolved, color: Colors.green)),
                  ],
                ),
                const SizedBox(height: 16),
                Card(
                  child: ListTile(
                    leading: const Icon(Icons.timer_outlined),
                    title: const Text('Average response'),
                    trailing: Text('${data.averageResponseMinutes.toStringAsFixed(0)} min'),
                  ),
                ),
                const SizedBox(height: 24),
                FilledButton.icon(
                  onPressed: () => context.push('/nurse/escalations'),
                  icon: const Icon(Icons.inbox_outlined),
                  label: const Text('View Cases'),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _ShiftCard extends StatelessWidget {
  final String shiftLabel;
  final bool isActive;
  final bool busy;
  final VoidCallback onPunchIn;
  final VoidCallback onPunchOut;

  const _ShiftCard({
    required this.shiftLabel,
    required this.isActive,
    required this.busy,
    required this.onPunchIn,
    required this.onPunchOut,
  });

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Today\'s Shift', style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 4),
            Text(shiftLabel, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            Row(
              children: [
                Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: isActive ? Colors.green : scheme.outline,
                  ),
                ),
                const SizedBox(width: 8),
                Text(isActive ? 'ACTIVE' : 'OFFLINE', style: const TextStyle(fontWeight: FontWeight.bold)),
                const Spacer(),
                FilledButton(
                  onPressed: busy ? null : (isActive ? onPunchOut : onPunchIn),
                  style: FilledButton.styleFrom(
                    backgroundColor: isActive ? scheme.errorContainer : null,
                    foregroundColor: isActive ? scheme.onErrorContainer : null,
                  ),
                  child: Text(isActive ? 'Punch Out' : 'Punch In'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final int value;
  final Color color;
  const _StatCard({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Column(
          children: [
            Text('$value', style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: color)),
            const SizedBox(height: 4),
            Text(label, style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ),
    );
  }
}
