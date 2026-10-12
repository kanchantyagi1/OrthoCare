import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_theme.dart';
import '../../../widgets/dashboard.dart';
import '../../../widgets/loading_overlay.dart';
import '../../auth/auth_controller.dart';
import '../doctor_controller.dart';

class DoctorDashboardScreen extends ConsumerWidget {
  const DoctorDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dashboard = ref.watch(doctorDashboardProvider);
    final attendance = ref.watch(attendanceControllerProvider);
    final user = ref.watch(authControllerProvider).user;

    // Without this, a failed punch-in updated no visible state and the button
    // just looked dead. Surface the failure instead of swallowing it.
    ref.listen(attendanceControllerProvider, (previous, next) {
      final error = next.hasError ? next.error : null;
      if (error == null) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Punch failed: $error'),
          action: SnackBarAction(
            label: 'Retry',
            onPressed: () => ref.read(attendanceControllerProvider.notifier).refresh(),
          ),
        ),
      );
    });

    return Scaffold(
      appBar: AppBar(
        // Guard on empty, not just null: an absent name arrives as '' and
        // rendered a bare "Hello ".
        title: Text('Hello ${(user?.name.isNotEmpty ?? false) ? user!.name : 'Doctor'}'),
        actions: [
          IconButton(
            icon: const Icon(Icons.person_outline),
            onPressed: () => context.push('/doctor/profile'),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(doctorDashboardProvider);
          await ref.read(attendanceControllerProvider.notifier).refresh();
        },
        child: dashboard.when(
          loading: () => const LoadingOverlay(),
          error: (e, _) =>
              ErrorRetryView(message: e.toString(), onRetry: () => ref.invalidate(doctorDashboardProvider)),
          data: (data) {
            final isActive = attendance.valueOrNull?.status.name == 'active';
            return ListView(
              padding: EdgeInsets.fromLTRB(16, 8, 16, 24 + MediaQuery.paddingOf(context).bottom),
              children: [
                _ShiftCard(
                  shiftLabel: data.todayShift == null ? 'No shift scheduled today' : data.todayShift!.rangeLabel,
                  isActive: isActive,
                  busy: attendance.isLoading,
                  onPunchIn: () => ref.read(attendanceControllerProvider.notifier).punchIn(),
                  onPunchOut: () => ref.read(attendanceControllerProvider.notifier).punchOut(),
                ),
                const SizedBox(height: 24),
                const SectionHeader('Your cases'),
                // All three open the one case list this doctor has (grouped
                // into "my cases" + the unassigned queue) - there is no
                // separate filtered view to send New/Pending/Resolved to.
                StatGrid(
                  children: [
                    StatTile(
                      label: 'New',
                      value: '${data.newCases}',
                      icon: Icons.notification_important_outlined,
                      color: AppTheme.urgent,
                      highlight: data.newCases > 0,
                      onTap: () => context.push('/doctor/escalations'),
                    ),
                    StatTile(
                      label: 'Pending',
                      value: '${data.pending}',
                      icon: Icons.hourglass_bottom_rounded,
                      color: AppTheme.high,
                      onTap: () => context.push('/doctor/escalations'),
                    ),
                    StatTile(
                      label: 'Resolved',
                      value: '${data.resolved}',
                      icon: Icons.check_circle_outline,
                      color: AppTheme.success,
                      onTap: () => context.push('/doctor/escalations'),
                    ),
                    StatTile(
                      label: 'Avg. response',
                      value: '${data.averageResponseMinutes.toStringAsFixed(0)} min',
                      icon: Icons.timer_outlined,
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                FilledButton.icon(
                  onPressed: () => context.push('/doctor/escalations'),
                  icon: const Icon(Icons.inbox_outlined),
                  label: const Text('View cases'),
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
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: scheme.primaryContainer,
                    borderRadius: BorderRadius.circular(AppTheme.radiusMd - 2),
                  ),
                  child: Icon(Icons.schedule_outlined, color: scheme.onPrimaryContainer),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text("Today's shift", style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
                      const SizedBox(height: 2),
                      Text(shiftLabel, style: theme.textTheme.titleMedium),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            // Wrap rather than Row + Spacer: at large text sizes the button
            // moves under the status instead of overflowing the card.
            SizedBox(
              width: double.infinity,
              child: Wrap(
                alignment: WrapAlignment.spaceBetween,
                crossAxisAlignment: WrapCrossAlignment.center,
                spacing: 12,
                runSpacing: 12,
                children: [
                  StatusPill(
                    label: isActive ? 'ACTIVE' : 'OFFLINE',
                    color: isActive ? AppTheme.success : scheme.outline,
                  ),
                  FilledButton(
                    onPressed: busy ? null : (isActive ? onPunchOut : onPunchIn),
                    style: FilledButton.styleFrom(
                      minimumSize: const Size(132, 46),
                      backgroundColor: isActive ? scheme.errorContainer : null,
                      foregroundColor: isActive ? scheme.onErrorContainer : null,
                    ),
                    child: Text(isActive ? 'Punch Out' : 'Punch In'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
