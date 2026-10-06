import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../models/escalation.dart';
import '../../../widgets/loading_overlay.dart';
import '../../../widgets/priority_chip.dart';
import '../../../widgets/status_badge.dart';
import '../nurse_controller.dart';
import 'resolution_form_sheet.dart';

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
        error: (e, _) =>
            ErrorRetryView(message: e.toString(), onRetry: () => ref.invalidate(escalationDetailProvider(escalationId))),
        data: (e) => _EscalationDetailBody(escalation: e),
      ),
    );
  }
}

class _EscalationDetailBody extends ConsumerWidget {
  final Escalation escalation;
  const _EscalationDetailBody({required this.escalation});

  Future<void> _callPatient(BuildContext context, String phone) async {
    final uri = Uri(scheme: 'tel', path: phone);
    if (!await launchUrl(uri)) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not start a call on this device.')));
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final actions = ref.read(escalationActionsProvider);

    Future<void> refresh() async => ref.invalidate(escalationDetailProvider(escalation.id));

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            PriorityChip(priority: escalation.priority),
            const SizedBox(width: 8),
            StatusBadge(status: escalation.status),
            const Spacer(),
            Text(DateFormat.yMMMd().add_jm().format(escalation.createdAt), style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(escalation.patientName, style: Theme.of(context).textTheme.titleMedium),
                if (escalation.surgeryType != null) Text('Surgery: ${escalation.surgeryType}'),
                if (escalation.surgeryDate != null) Text('Surgery date: ${escalation.surgeryDate}'),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        _SectionCard(title: 'Patient question', child: Text(escalation.question)),
        const SizedBox(height: 12),
        _SectionCard(title: 'AI response', child: Text(escalation.aiResponse)),
        if (escalation.reason != null) ...[
          const SizedBox(height: 12),
          _SectionCard(title: 'Escalation reason', child: Text(escalation.reason!)),
        ],
        if (escalation.sources.isNotEmpty) ...[
          const SizedBox(height: 12),
          _SectionCard(
            title: 'Source documents',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: escalation.sources
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
        const SizedBox(height: 24),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            if (escalation.patientPhone != null)
              OutlinedButton.icon(
                onPressed: () => _callPatient(context, escalation.patientPhone!),
                icon: const Icon(Icons.call_outlined),
                label: const Text('Call Patient'),
              ),
            if (escalation.status != EscalationStatus.resolved)
              OutlinedButton.icon(
                onPressed: () async {
                  await actions.markContacted(escalation.id);
                  await refresh();
                },
                icon: const Icon(Icons.check_circle_outline),
                label: const Text('Mark Contacted'),
              ),
            if (escalation.status != EscalationStatus.resolved)
              FilledButton.icon(
                onPressed: () async {
                  final result = await showResolutionForm(context);
                  if (result == null) return;
                  await actions.resolve(
                    escalationId: escalation.id,
                    patientContacted: result.patientContacted,
                    issueCategory: result.issueCategory,
                    resolutionNotes: result.resolutionNotes,
                    followUpRequired: result.followUpRequired,
                    escalateToDoctor: result.escalateToDoctor,
                    nurseNotes: result.nurseNotes,
                  );
                  await refresh();
                },
                icon: const Icon(Icons.task_alt_outlined),
                label: const Text('Resolve'),
              ),
            if (escalation.status != EscalationStatus.resolved)
              OutlinedButton.icon(
                onPressed: () async {
                  await actions.escalateToDoctor(escalation.id);
                  await refresh();
                },
                icon: const Icon(Icons.local_hospital_outlined),
                label: const Text('Escalate to Doctor'),
              ),
          ],
        ),
      ],
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
