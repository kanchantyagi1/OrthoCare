import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../models/nurse_summary.dart';
import '../../../widgets/loading_overlay.dart';
import '../admin_controller.dart';

class ShiftManagementScreen extends ConsumerWidget {
  const ShiftManagementScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final shifts = ref.watch(shiftsProvider);
    final nurses = ref.watch(nursesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Shift Management')),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showShiftForm(context, ref, nurses.valueOrNull ?? []),
        child: const Icon(Icons.add),
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(shiftsProvider),
        child: shifts.when(
          loading: () => const LoadingOverlay(),
          error: (e, _) => ErrorRetryView(message: e.toString(), onRetry: () => ref.invalidate(shiftsProvider)),
          data: (items) {
            if (items.isEmpty) {
              return const EmptyStateView(message: 'No shifts scheduled.', icon: Icons.schedule_outlined);
            }
            return ListView.separated(
              padding: const EdgeInsets.all(12),
              itemCount: items.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (context, i) {
                final s = items[i];
                return ListTile(
                  leading: const Icon(Icons.schedule_outlined),
                  title: Text(s.nurseName),
                  subtitle: Text('${DateFormat.jm().format(s.startTime)} – ${DateFormat.jm().format(s.endTime)}'),
                  trailing: IconButton(
                    icon: const Icon(Icons.delete_outline),
                    onPressed: () async {
                      await ref.read(adminActionsProvider).deleteShift(s.id);
                      ref.invalidate(shiftsProvider);
                    },
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }

  void _showShiftForm(BuildContext context, WidgetRef ref, List<NurseSummary> nurses) {
    String? nurseId = nurses.isNotEmpty ? nurses.first.id : null;
    TimeOfDay start = const TimeOfDay(hour: 9, minute: 0);
    TimeOfDay end = const TimeOfDay(hour: 12, minute: 0);

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Add Shift'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              DropdownButtonFormField<String>(
                initialValue: nurseId,
                decoration: const InputDecoration(labelText: 'Nurse'),
                items: nurses.map((n) => DropdownMenuItem(value: n.id, child: Text(n.name))).toList(),
                onChanged: (v) => setState(() => nurseId = v),
              ),
              ListTile(
                title: const Text('Start time'),
                trailing: Text(start.format(context)),
                onTap: () async {
                  final picked = await showTimePicker(context: context, initialTime: start);
                  if (picked != null) setState(() => start = picked);
                },
              ),
              ListTile(
                title: const Text('End time'),
                trailing: Text(end.format(context)),
                onTap: () async {
                  final picked = await showTimePicker(context: context, initialTime: end);
                  if (picked != null) setState(() => end = picked);
                },
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
            FilledButton(
              onPressed: nurseId == null
                  ? null
                  : () async {
                      final now = DateTime.now();
                      final startDt = DateTime(now.year, now.month, now.day, start.hour, start.minute);
                      final endDt = DateTime(now.year, now.month, now.day, end.hour, end.minute);
                      await ref.read(adminActionsProvider).createShift(nurseId: nurseId!, start: startDt, end: endDt);
                      ref.invalidate(shiftsProvider);
                      if (context.mounted) Navigator.of(context).pop();
                    },
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
  }
}
