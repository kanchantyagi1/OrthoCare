import 'package:flutter/material.dart';

import '../models/escalation.dart';

class StatusBadge extends StatelessWidget {
  final EscalationStatus status;
  const StatusBadge({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (color, label) = switch (status) {
      EscalationStatus.waitingForDoctor => (scheme.error, 'Waiting for doctor'),
      EscalationStatus.assigned => (scheme.tertiary, 'Assigned'),
      EscalationStatus.contacted => (scheme.primary, 'Contacted'),
      EscalationStatus.resolved => (Colors.green, 'Resolved'),
      EscalationStatus.escalatedToDoctor => (scheme.secondary, 'Escalated to senior'),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
      child: Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w600, fontSize: 12)),
    );
  }
}
