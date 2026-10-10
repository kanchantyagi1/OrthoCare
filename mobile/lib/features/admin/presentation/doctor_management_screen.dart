import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../models/doctor_summary.dart';
import '../../../widgets/loading_overlay.dart';
import '../admin_controller.dart';

class DoctorManagementScreen extends ConsumerWidget {
  const DoctorManagementScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final doctors = ref.watch(doctorsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Doctor Management')),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showDoctorForm(context, ref),
        child: const Icon(Icons.add),
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(doctorsProvider),
        child: doctors.when(
          loading: () => const LoadingOverlay(),
          error: (e, _) => ErrorRetryView(message: e.toString(), onRetry: () => ref.invalidate(doctorsProvider)),
          data: (items) {
            if (items.isEmpty) {
              return const EmptyStateView(message: 'No doctors yet. Tap + to add one.', icon: Icons.people_outline);
            }
            return ListView.separated(
              padding: const EdgeInsets.all(12),
              itemCount: items.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (context, i) {
                final d = items[i];
                return ListTile(
                  leading: CircleAvatar(child: Text(d.name.isNotEmpty ? d.name[0].toUpperCase() : '?')),
                  title: Text(d.name),
                  subtitle: Text(d.phone),
                  trailing: Chip(
                    label: Text(d.active ? 'Active' : 'Inactive'),
                    backgroundColor: d.active ? Colors.green.withValues(alpha: 0.15) : null,
                  ),
                  onTap: () => _showDoctorForm(context, ref, existing: d),
                );
              },
            );
          },
        ),
      ),
    );
  }

  void _showDoctorForm(BuildContext context, WidgetRef ref, {DoctorSummary? existing}) {
    final nameController = TextEditingController(text: existing?.name);
    final phoneController = TextEditingController(text: existing?.phone);
    final emailController = TextEditingController();
    final passwordController = TextEditingController();
    bool active = existing?.active ?? true;

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: Text(existing == null ? 'Add Doctor' : 'Edit Doctor'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: nameController, decoration: const InputDecoration(labelText: 'Name')),
              TextField(controller: phoneController, decoration: const InputDecoration(labelText: 'Phone')),
              // Email is the doctor's account identity on the backend; they can
              // sign in with either this or their phone number.
              if (existing == null)
                TextField(
                  controller: emailController,
                  decoration: const InputDecoration(labelText: 'Email'),
                  keyboardType: TextInputType.emailAddress,
                ),
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
                  await actions.createDoctor(
                    email: emailController.text.trim(),
                    fullName: nameController.text.trim(),
                    phone: phoneController.text.trim(),
                    password: passwordController.text,
                  );
                } else {
                  await actions.updateDoctor(
                    existing.id,
                    fullName: nameController.text.trim(),
                    phone: phoneController.text.trim(),
                    isActive: active,
                  );
                }
                ref.invalidate(doctorsProvider);
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
