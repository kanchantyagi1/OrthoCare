import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/network/api_exception.dart';
import '../../../models/escalation.dart';
import '../../../widgets/loading_overlay.dart';
import '../../../widgets/priority_chip.dart';
import '../../../widgets/status_badge.dart';
import '../doctor_controller.dart';

const Map<EscalationPriority, int> _priorityOrder = {
  EscalationPriority.urgent: 0,
  EscalationPriority.high: 1,
  EscalationPriority.normal: 2,
};

/// A case is up for grabs when it is still waiting and nobody holds it.
bool _isUnclaimed(Escalation e) =>
    e.status == EscalationStatus.waitingForDoctor && e.assignedDoctorId == null;

/// Doctor case list.
///
/// The API returns this doctor's own cases *and* cases still waiting for any
/// doctor. Those two are shown separately: an unassigned case used to be
/// invisible to every doctor, so questions asked outside shift hours sat
/// unanswered while the patient's own screen showed them as pending.
class EscalationsListScreen extends ConsumerStatefulWidget {
  const EscalationsListScreen({super.key});

  @override
  ConsumerState<EscalationsListScreen> createState() => _EscalationsListScreenState();
}

class _EscalationsListScreenState extends ConsumerState<EscalationsListScreen> {
  /// Case currently being claimed, so only that row spins and a second tap
  /// cannot fire the same claim twice.
  String? _claimingId;

  Future<void> _claim(Escalation escalation) async {
    if (_claimingId != null) return;
    setState(() => _claimingId = escalation.id);
    try {
      await ref.read(escalationActionsProvider).claimEscalation(escalation.id);
      ref.invalidate(doctorEscalationsProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Case claimed. ${escalation.patientName} is now yours.')),
        );
      }
    } catch (e) {
      // Another doctor may have taken it moments earlier. The backend rejects
      // rather than reassigning, so refresh to show who actually holds it now.
      final alreadyTaken = e is ApiException &&
          (e.statusCode == 409 || e.statusCode == 400 || e.statusCode == 404);
      ref.invalidate(doctorEscalationsProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              alreadyTaken ? 'Already claimed by another doctor.' : e.toString(),
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _claimingId = null);
    }
  }

  static int _byPriority(Escalation a, Escalation b) =>
      _priorityOrder[a.priority]!.compareTo(_priorityOrder[b.priority]!);

  @override
  Widget build(BuildContext context) {
    final escalations = ref.watch(doctorEscalationsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Cases')),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(doctorEscalationsProvider),
        child: escalations.when(
          loading: () => const LoadingOverlay(),
          error: (e, _) => ErrorRetryView(
            message: e.toString(),
            onRetry: () => ref.invalidate(doctorEscalationsProvider),
          ),
          data: (items) {
            final unclaimed = items.where(_isUnclaimed).toList()..sort(_byPriority);
            final mine = items.where((e) => !_isUnclaimed(e)).toList()..sort(_byPriority);

            if (unclaimed.isEmpty && mine.isEmpty) {
              return const EmptyStateView(
                message: 'No cases right now.',
                icon: Icons.check_circle_outline,
              );
            }

            return ListView(
              padding: const EdgeInsets.all(12),
              children: [
                if (unclaimed.isNotEmpty) ...[
                  _SectionHeader(
                    label: 'Waiting for a doctor',
                    count: unclaimed.length,
                    subtitle: 'Not assigned to anyone yet. Claim one to take it on.',
                  ),
                  for (final e in unclaimed)
                    _CaseCard(
                      escalation: e,
                      claimable: true,
                      claiming: _claimingId == e.id,
                      onClaim: () => _claim(e),
                    ),
                  const SizedBox(height: 20),
                ],
                _SectionHeader(label: 'My cases', count: mine.length),
                // No `else` needed: when `mine` is empty the loop below yields
                // nothing anyway, which keeps this a plain sequence of elements.
                if (mine.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    child: Text(
                      'Nothing assigned to you yet.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Theme.of(context).colorScheme.outline),
                    ),
                  ),
                for (final e in mine) _CaseCard(escalation: e),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String label;
  final int count;
  final String? subtitle;

  const _SectionHeader({required this.label, required this.count, this.subtitle});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: 4, bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '$label ($count)',
            style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
          if (subtitle != null)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(
                subtitle!,
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
              ),
            ),
        ],
      ),
    );
  }
}

class _CaseCard extends StatelessWidget {
  final Escalation escalation;
  final bool claimable;
  final bool claiming;
  final VoidCallback? onClaim;

  const _CaseCard({
    required this.escalation,
    this.claimable = false,
    this.claiming = false,
    this.onClaim,
  });

  @override
  Widget build(BuildContext context) {
    final e = escalation;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Column(
        children: [
          ListTile(
            onTap: () => context.push('/doctor/escalations/${e.id}'),
            leading: StatusBadge(status: e.status),
            title: Text(e.patientName, style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(e.question, maxLines: 2, overflow: TextOverflow.ellipsis),
            ),
            trailing: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              mainAxisSize: MainAxisSize.min,
              children: [
                PriorityChip(priority: e.priority),
                const SizedBox(height: 6),
                Text(
                  DateFormat.jm().format(e.createdAt),
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
            isThreeLine: true,
          ),
          if (claimable)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  FilledButton.icon(
                    onPressed: claiming ? null : onClaim,
                    icon: claiming
                        ? const SizedBox(
                            height: 16,
                            width: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.how_to_reg_outlined, size: 18),
                    label: Text(claiming ? 'Claiming...' : 'Claim'),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
