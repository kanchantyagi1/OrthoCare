import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../models/doctor_summary.dart';
import '../../../widgets/loading_overlay.dart';
import '../admin_controller.dart';

class DoctorManagementScreen extends ConsumerStatefulWidget {
  const DoctorManagementScreen({super.key});

  @override
  ConsumerState<DoctorManagementScreen> createState() => _DoctorManagementScreenState();
}

class _DoctorManagementScreenState extends ConsumerState<DoctorManagementScreen> {
  // Removed doctors are deactivated, not erased (see _confirmRemove), but are
  // hidden from the list by default - this is the "show removed" escape
  // hatch so an admin can find and restore one.
  bool _showRemoved = false;

  @override
  Widget build(BuildContext context) {
    final doctors = ref.watch(doctorsProvider(_showRemoved));
    return Scaffold(
      appBar: AppBar(
        title: const Text('Doctor Management'),
        actions: [
          IconButton(
            icon: Icon(_showRemoved ? Icons.visibility_off_outlined : Icons.visibility_outlined),
            tooltip: _showRemoved ? 'Hide removed doctors' : 'Show removed doctors',
            onPressed: () => setState(() => _showRemoved = !_showRemoved),
          ),
        ],
      ),
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
              return EmptyStateView(
                message: _showRemoved ? 'No removed doctors.' : 'No doctors yet. Tap + to add one.',
                icon: Icons.people_outline,
              );
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
                  // Status sits here rather than in `trailing` so the actions menu
                  // has room without risking an overflow on a narrow phone.
                  subtitle: Text(
                    '${d.phone}  •  ${d.active ? 'Active' : 'Removed'}',
                    style: d.active ? null : TextStyle(color: Theme.of(context).colorScheme.outline),
                  ),
                  trailing: PopupMenuButton<String>(
                    tooltip: 'Doctor actions',
                    onSelected: (value) {
                      if (value == 'edit') {
                        _showDoctorForm(context, ref, existing: d);
                      } else if (value == 'remove') {
                        _confirmRemove(context, ref, d);
                      } else if (value == 'restore') {
                        _restore(context, ref, d);
                      }
                    },
                    itemBuilder: (_) => [
                      const PopupMenuItem(value: 'edit', child: Text('Edit')),
                      if (d.active)
                        const PopupMenuItem(value: 'remove', child: Text('Remove doctor'))
                      else
                        const PopupMenuItem(value: 'restore', child: Text('Restore doctor')),
                    ],
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

  /// Removing a doctor *deactivates* them rather than deleting the record:
  /// attendance rows, case assignments and case notes reference the doctor and
  /// must survive for audit. The wording below says so plainly instead of
  /// implying the data is erased.
  Future<void> _confirmRemove(BuildContext context, WidgetRef ref, DoctorSummary doctor) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text('Remove ${doctor.name}?'),
        content: const Text(
          'They will be deactivated: no new cases will be assigned to them and '
          'they will no longer be able to sign in. Their shifts are removed from '
          'the schedule too.\n\n'
          'Their attendance history and past cases are kept for the record, and '
          'you can restore them later from "Show removed doctors".',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          // Closing the dialog before the request runs means the button is gone
          // by then, so a double-tap cannot fire two removals.
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    try {
      await ref.read(adminActionsProvider).deleteDoctor(doctor.id);
      // The backend deactivates the doctor's shifts in the same transaction,
      // so Shift Management must refresh too, not just this list.
      ref.invalidate(doctorsProvider);
      ref.invalidate(shiftsProvider);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${doctor.name} removed.')),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not remove ${doctor.name}. $e')),
        );
      }
    }
  }

  /// Reactivates a removed doctor. Their old shifts are NOT resurrected - the
  /// backend deliberately leaves shift recreation to the admin, since the
  /// schedule may have moved on while they were gone.
  Future<void> _restore(BuildContext context, WidgetRef ref, DoctorSummary doctor) async {
    try {
      await ref.read(adminActionsProvider).updateDoctor(
            doctor.id,
            fullName: doctor.name,
            phone: doctor.phone,
            isActive: true,
          );
      ref.invalidate(doctorsProvider);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${doctor.name} restored. Recreate their shifts if needed.')),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not restore ${doctor.name}. $e')),
        );
      }
    }
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
