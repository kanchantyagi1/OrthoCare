import 'package:flutter/material.dart';

import '../core/theme/app_theme.dart';
import '../models/escalation.dart';

class PriorityChip extends StatelessWidget {
  final EscalationPriority priority;
  const PriorityChip({super.key, required this.priority});

  @override
  Widget build(BuildContext context) {
    final (color, label) = switch (priority) {
      EscalationPriority.urgent => (AppTheme.urgent, 'URGENT'),
      EscalationPriority.high => (AppTheme.high, 'HIGH'),
      EscalationPriority.normal => (AppTheme.normal, 'NORMAL'),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Text(
        label,
        style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 11, letterSpacing: 0.5),
      ),
    );
  }
}
