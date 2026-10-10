import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/network/api_exception.dart';
import '../../../models/escalation.dart';
import '../../../widgets/loading_overlay.dart';
import '../../../widgets/priority_chip.dart';
import '../../../widgets/status_badge.dart';
import '../doctor_controller.dart';
import 'resolution_form_sheet.dart';

/// Who holds this case, which decides what the doctor is allowed to do with it.
enum _Ownership {
  /// Still on the waiting queue - claimable.
  unassigned,

  /// Assigned to the signed-in doctor - full actions.
  mine,

  /// Assigned to a different doctor - viewable, but not actionable.
  otherDoctor,

  /// Can't tell yet (the case list hasn't loaded). Working actions stay hidden
  /// rather than being offered and then rejected by the server.
  unknown,
}

class EscalationDetailScreen extends ConsumerWidget {
  final String escalationId;
  const EscalationDetailScreen({super.key, required this.escalationId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(escalationDetailProvider(escalationId));
    return Scaffold(
      appBar: AppBar(title: const Text('Case Detail')),
      body: detail.when(
        loading: () => const LoadingOverlay(),
        error: (e, _) => ErrorRetryView(
          message: e.toString(),
          onRetry: () => ref.invalidate(escalationDetailProvider(escalationId)),
        ),
        data: (e) => _EscalationDetailBody(escalation: e),
      ),
    );
  }
}

class _EscalationDetailBody extends ConsumerStatefulWidget {
  final Escalation escalation;
  const _EscalationDetailBody({required this.escalation});

  @override
  ConsumerState<_EscalationDetailBody> createState() => _EscalationDetailBodyState();
}

class _EscalationDetailBodyState extends ConsumerState<_EscalationDetailBody> {
  bool _busy = false;

  Escalation get escalation => widget.escalation;

  /// `GET /escalations` returns *only* this doctor's assigned cases plus the
  /// unassigned queue, so any assigned case in that list carries their own
  /// doctor id. The API never exposes the caller's doctor id directly and
  /// `GET /escalations/:id` is not scoped per-doctor, so this is how the screen
  /// tells "mine" from "somebody else's".
  _Ownership _ownership(AsyncValue<List<Escalation>> myCases) {
    if (escalation.assignedDoctorId == null) return _Ownership.unassigned;
    final cases = myCases.valueOrNull;
    if (cases == null) return _Ownership.unknown;
    for (final c in cases) {
      if (c.assignedDoctorId != null) {
        return c.assignedDoctorId == escalation.assignedDoctorId
            ? _Ownership.mine
            : _Ownership.otherDoctor;
      }
    }
    // They hold no cases at all, so an assigned case cannot be theirs.
    return _Ownership.otherDoctor;
  }

  Future<void> _callPatient(String phone) async {
    final uri = Uri(scheme: 'tel', path: phone);
    try {
      if (await launchUrl(uri)) return;
    } catch (_) {
      // Fall through to the same message as a refused launch.
    }
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not start a call on this device.')),
      );
    }
  }

  void _notify(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _refreshDetail() async {
    ref.invalidate(escalationDetailProvider(escalation.id));
  }

  /// Runs a case action with a single in-flight guard, refreshing afterwards.
  /// Previously these were awaited bare, so a server rejection produced an
  /// unhandled error and the button silently did nothing.
  Future<void> _run(Future<void> Function() action, {required String failurePrefix}) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
      await _refreshDetail();
    } on ApiException catch (e) {
      _notify('$failurePrefix ${e.message}');
    } catch (e) {
      _notify('$failurePrefix $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _claim() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await ref.read(escalationActionsProvider).claimEscalation(escalation.id);
      // Refresh both: the detail so the actions below unlock without the doctor
      // backing out, and the list so ownership resolves to "mine".
      ref.invalidate(doctorEscalationsProvider);
      await _refreshDetail();
      _notify('Case claimed. ${escalation.patientName} is now yours.');
    } catch (e) {
      final alreadyTaken = e is ApiException &&
          (e.statusCode == 409 || e.statusCode == 400 || e.statusCode == 404);
      ref.invalidate(doctorEscalationsProvider);
      await _refreshDetail();
      _notify(alreadyTaken ? 'Already claimed by another doctor.' : e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final e = escalation;
    final ownership = _ownership(ref.watch(doctorEscalationsProvider));

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            PriorityChip(priority: e.priority),
            const SizedBox(width: 8),
            StatusBadge(status: e.status),
            const Spacer(),
            Text(
              DateFormat.yMMMd().add_jm().format(e.createdAt),
              style: theme.textTheme.bodySmall,
            ),
          ],
        ),
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(e.patientName, style: theme.textTheme.titleMedium),
                // Shown in every ownership state: a doctor deciding whether to
                // take a case on needs the number in front of them.
                if (e.patientPhone != null) Text('Phone: ${e.patientPhone}'),
                if (e.surgeryType != null) Text('Surgery: ${e.surgeryType}'),
                if (e.surgeryDate != null) Text('Surgery date: ${e.surgeryDate}'),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        _SectionCard(title: 'Patient question', child: Text(e.question)),
        const SizedBox(height: 12),
        _SectionCard(title: 'Assistant response', child: Text(e.aiResponse)),
        if (e.reason != null) ...[
          const SizedBox(height: 12),
          _SectionCard(title: 'Escalation reason', child: Text(e.reason!)),
        ],
        if (e.sources.isNotEmpty) ...[
          const SizedBox(height: 12),
          _SectionCard(
            title: 'Source documents',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: e.sources
                  .map((s) => Padding(
                        padding: const EdgeInsets.only(bottom: 4),
                        child: Text(
                          '• ${s.fileName}${s.pageNumber != null ? ' (p. ${s.pageNumber})' : ''}${s.sectionTitle != null ? ' — ${s.sectionTitle}' : ''}',
                        ),
                      ))
                  .toList(),
            ),
          ),
        ],
        if (ownership == _Ownership.otherDoctor) ...[
          const SizedBox(height: 16),
          _Notice(
            icon: Icons.lock_outline,
            text: e.assignedDoctorName != null
                ? '${e.assignedDoctorName} is handling this case. You can view it, but only they can update it.'
                : 'Another doctor is handling this case. You can view it, but only they can update it.',
          ),
        ],
        if (ownership == _Ownership.unknown) ...[
          const SizedBox(height: 16),
          const _Notice(
            icon: Icons.sync_outlined,
            text: 'Checking who this case is assigned to...',
          ),
        ],
        const SizedBox(height: 24),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: _actionsFor(ownership),
        ),
      ],
    );
  }

  List<Widget> _actionsFor(_Ownership ownership) {
    final e = escalation;
    final isOpen = e.status != EscalationStatus.resolved;

    return [
      if (e.patientPhone != null)
        OutlinedButton.icon(
          onPressed: () => _callPatient(e.patientPhone!),
          icon: const Icon(Icons.call_outlined),
          label: const Text('Call Patient'),
        ),
      if (ownership == _Ownership.unassigned)
        FilledButton.icon(
          onPressed: _busy ? null : _claim,
          icon: _busy
              ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.how_to_reg_outlined),
          label: Text(_busy ? 'Claiming...' : 'Claim case'),
        ),
      if (ownership == _Ownership.mine && isOpen) ...[
        OutlinedButton.icon(
          onPressed: _busy
              ? null
              : () => _run(
                    () => ref.read(escalationActionsProvider).markContacted(e.id),
                    failurePrefix: 'Could not mark as contacted.',
                  ),
          icon: const Icon(Icons.check_circle_outline),
          label: const Text('Mark Contacted'),
        ),
        FilledButton.icon(
          onPressed: _busy ? null : _resolve,
          icon: const Icon(Icons.task_alt_outlined),
          label: const Text('Resolve'),
        ),
        OutlinedButton.icon(
          onPressed: _busy
              ? null
              : () => _run(
                    () => ref.read(escalationActionsProvider).escalateToDoctor(e.id),
                    failurePrefix: 'Could not escalate.',
                  ),
          icon: const Icon(Icons.local_hospital_outlined),
          label: const Text('Escalate to Senior'),
        ),
      ],
    ];
  }

  Future<void> _resolve() async {
    final result = await showResolutionForm(context);
    if (result == null) return;
    await _run(
      () => ref.read(escalationActionsProvider).resolve(
            escalationId: escalation.id,
            patientContacted: result.patientContacted,
            issueCategory: result.issueCategory,
            resolutionNotes: result.resolutionNotes,
            followUpRequired: result.followUpRequired,
            escalateToDoctor: result.escalateToDoctor,
            doctorNotes: result.doctorNotes,
          ),
      failurePrefix: 'Could not resolve the case.',
    );
  }
}

class _Notice extends StatelessWidget {
  final IconData icon;
  final String text;
  const _Notice({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurfaceVariant;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Icon(icon, size: 20, color: muted),
            const SizedBox(width: 10),
            Expanded(
              child: Text(text, style: theme.textTheme.bodySmall?.copyWith(color: muted)),
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  final String title;
  final Widget child;
  const _SectionCard({required this.title, required this.child});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 8),
            child,
          ],
        ),
      ),
    );
  }
}
