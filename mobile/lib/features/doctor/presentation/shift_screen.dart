import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../widgets/loading_overlay.dart';
import '../doctor_controller.dart';

class ShiftScreen extends ConsumerWidget {
  const ShiftScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dashboard = ref.watch(doctorDashboardProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('My Shift')),
      body: dashboard.when(
        loading: () => const LoadingOverlay(),
        error: (e, _) => ErrorRetryView(message: e.toString(), onRetry: () => ref.invalidate(doctorDashboardProvider)),
        data: (data) {
          final shift = data.todayShift;
          if (shift == null) {
            return const EmptyStateView(message: 'No shift scheduled today.', icon: Icons.event_busy_outlined);
          }
          return Padding(
            padding: const EdgeInsets.all(16),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ListTile(
                      leading: const Icon(Icons.schedule_outlined),
                      title: const Text('Shift window'),
                      subtitle: Text(
                        shift.rangeLabel,
                      ),
                    ),
                    ListTile(
                      leading: const Icon(Icons.check_circle_outline),
                      title: const Text('Currently active'),
                      subtitle: Text(shift.isActiveNow ? 'Yes' : 'No'),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
