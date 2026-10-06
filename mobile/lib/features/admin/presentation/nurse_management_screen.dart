import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../models/nurse_summary.dart';
import '../../../widgets/loading_overlay.dart';
import '../admin_controller.dart';

class NurseManagementScreen extends ConsumerWidget {
  const NurseManagementScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final nurses = ref.watch(nursesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Nurse Management')),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showNurseForm(context, ref),
        child: const Icon(Icons.add),
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(nursesProvider),
        child: nurses.when(
          loading: () => const LoadingOverlay(),
          error: (e, _) => ErrorRetryView(message: e.toString(), onRetry: () => ref.invalidate(nursesProvider)),
          data: (items) {
            if (items.isEmpty) {
              return const EmptyStateView(message: 'No nurses yet. Tap + to add one.', icon: Icons.people_outline);
            }
            return ListView.separated(
              padding: const EdgeInsets.all(12),
              itemCount: items.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (context, i) {
                final n = items[i];
                return ListTile(
                  leading: CircleAvatar(child: Text(n.name.isNotEmpty ? n.name[0].toUpperCase() : '?')),
                  title: Text(n.name),
                  subtitle: Text(n.phone),
                  trailing: Chip(
                    label: Text(n.active ? 'Active' : 'Inactive'),
                    backgroundColor: n.active ? Colors.green.withOpacity(0.15) : null,
                  ),
                  onTap: () => _showNurseForm(context, ref, existing: n),
                );
              },
            );
          },
        ),
      ),
    );
  }

  void _showNurseForm(BuildContext context, WidgetRef ref, {NurseSummary? existing}) {
    final nameController = TextEditingController(text: existing?.name);
    final phoneController = TextEditingController(text: existing?.phone);
    final passwordController = TextEditingController();
    bool active = existing?.active ?? true;

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: Text(existing == null ? 'Add Nurse' : 'Edit Nurse'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: nameController, decoration: const InputDecoration(labelText: 'Name')),
              TextField(controller: phoneController, decoration: const InputDecoration(labelText: 'Phone')),
              if (existing == null)
                TextField(
                  controller: passwordController,
                  decoration: const InputDecoration(labelText: 'Temporary password'),
                  obscureText: true,
                ),
              if (existing != null)
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Active'),
                  value: active,
                  onChanged: (v) => setState(() => active = v),
                ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
            FilledButton(
              onPressed: () async {
                final actions = ref.read(adminActionsProvider);
                if (existing == null) {
                  await actions.createNurse(
                    name: nameController.text.trim(),
                    phone: phoneController.text.trim(),
                    password: passwordController.text,
                  );
                } else {
                  await actions.updateNurse(existing.id, name: nameController.text.trim(), phone: phoneController.text.trim(), active: active);
                }
                ref.invalidate(nursesProvider);
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
