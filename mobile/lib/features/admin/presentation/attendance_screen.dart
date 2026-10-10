import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../widgets/loading_overlay.dart';
import '../admin_controller.dart';

class AttendanceScreen extends ConsumerWidget {
  const AttendanceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rows = ref.watch(attendanceReportProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Attendance')),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(attendanceReportProvider),
        child: rows.when(
          loading: () => const LoadingOverlay(),
          error: (e, _) => ErrorRetryView(message: e.toString(), onRetry: () => ref.invalidate(attendanceReportProvider)),
          data: (items) {
            if (items.isEmpty) {
              return const EmptyStateView(message: 'No attendance records yet.', icon: Icons.fingerprint);
            }
            return SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: DataTable(
                columns: const [
                  DataColumn(label: Text('Doctor')),
                  DataColumn(label: Text('Punch In')),
                  DataColumn(label: Text('Punch Out')),
                ],
                rows: items
                    .map((r) => DataRow(cells: [
                          DataCell(Text(r.doctorName)),
                          DataCell(Text(DateFormat.yMMMd().add_jm().format(r.punchIn))),
                          DataCell(Text(r.punchOut != null ? DateFormat.yMMMd().add_jm().format(r.punchOut!) : '—')),
                        ]))
                    .toList(),
              ),
            );
          },
        ),
      ),
    );
  }
}
