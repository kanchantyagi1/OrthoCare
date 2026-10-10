import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../models/doctor_summary.dart';
import '../../../widgets/loading_overlay.dart';
import '../admin_controller.dart';

class ShiftManagementScreen extends ConsumerWidget {
  const ShiftManagementScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final shifts = ref.watch(shiftsProvider);
    final doctors = ref.watch(doctorsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Shift Management')),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showShiftForm(context, ref, doctors.valueOrNull ?? []),
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
                  title: Text(s.doctorName),
                  subtitle: Text(s.rangeLabel),
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

  void _showShiftForm(BuildContext context, WidgetRef ref, List<DoctorSummary> doctors) {
    String? doctorId = doctors.isNotEmpty ? doctors.first.id : null;
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
                initialValue: doctorId,
                decoration: const InputDecoration(labelText: 'Doctor'),
                items: doctors.map((d) => DropdownMenuItem(value: d.id, child: Text(d.name))).toList(),
                onChanged: (v) => setState(() => doctorId = v),
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
              onPressed: doctorId == null
                  ? null
                  : () async {
                      await ref.read(adminActionsProvider).createShift(doctorId: doctorId!, start: start, end: end);
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
