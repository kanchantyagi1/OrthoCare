import 'package:flutter/material.dart';

import '../core/theme/app_theme.dart';

/// Shared building blocks for the patient, doctor and admin dashboards, so the
/// three read as one product: same card, same stat tile, same spacing.

class SectionHeader extends StatelessWidget {
  const SectionHeader(this.title, {super.key, this.trailing});

  final String title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 4, right: 4, bottom: 10),
      child: Row(
        children: [
          Expanded(child: Text(title, style: Theme.of(context).textTheme.titleMedium)),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

/// A single figure with its label. Tappable only when [onTap] is given - an
/// inert tile shows no chevron, so it never looks interactive when it isn't.
class StatTile extends StatelessWidget {
  const StatTile({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    this.color,
    this.highlight = false,
    this.onTap,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color? color;
  final bool highlight;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final accent = color ?? scheme.primary;
    final content = Padding(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                ),
                child: Icon(icon, size: 19, color: accent),
              ),
              const Spacer(),
              if (onTap != null) Icon(Icons.chevron_right, size: 20, color: scheme.outline),
            ],
          ),
          const SizedBox(height: 12),
          // Scales down rather than wrapping ("14 / min") at large font sizes.
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              value,
              maxLines: 1,
              style: theme.textTheme.headlineSmall?.copyWith(
                color: highlight ? accent : scheme.onSurface,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(height: 2),
          Text(label, style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
        ],
      ),
    );
    return Card(
      margin: EdgeInsets.zero,
      color: highlight ? accent.withValues(alpha: 0.06) : null,
      shape: highlight
          ? RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(AppTheme.radiusLg - 4),
              side: BorderSide(color: accent.withValues(alpha: 0.35)),
            )
          : null,
      clipBehavior: Clip.antiAlias,
      child: onTap == null ? content : InkWell(onTap: onTap, child: content),
    );
  }
}

/// Lays tiles out in rows of equal-height cells. Each row is as tall as its
/// tallest tile, so large system font sizes grow the row instead of
/// overflowing a fixed aspect ratio (which GridView.count would do).
class StatGrid extends StatelessWidget {
  const StatGrid({super.key, required this.children, this.spacing = 12});

  final List<Widget> children;
  final double spacing;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, constraints) {
      final columns = constraints.maxWidth >= 840 ? 4 : (constraints.maxWidth >= 560 ? 3 : 2);
      final rows = <Widget>[];
      for (var i = 0; i < children.length; i += columns) {
        final cells = <Widget>[];
        for (var c = 0; c < columns; c++) {
          if (c > 0) cells.add(SizedBox(width: spacing));
          final index = i + c;
          cells.add(Expanded(child: index < children.length ? children[index] : const SizedBox.shrink()));
        }
        if (rows.isNotEmpty) rows.add(SizedBox(height: spacing));
        rows.add(IntrinsicHeight(
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: cells),
        ));
      }
      return Column(children: rows);
    });
  }
}

/// A navigation row: icon, title, supporting line, chevron.
class ActionTile extends StatelessWidget {
  const ActionTile({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Card(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: scheme.primaryContainer,
                  borderRadius: BorderRadius.circular(AppTheme.radiusMd - 2),
                ),
                child: Icon(icon, color: scheme.onPrimaryContainer),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: theme.textTheme.titleMedium),
                    const SizedBox(height: 2),
                    Text(subtitle, style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Icon(Icons.chevron_right, color: scheme.outline),
            ],
          ),
        ),
      ),
    );
  }
}

/// Small coloured status label ("ACTIVE", "OFFLINE", ...).
class StatusPill extends StatelessWidget {
  const StatusPill({super.key, required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
          const SizedBox(width: 6),
          Text(
            label,
            style: Theme.of(context).textTheme.labelMedium?.copyWith(color: color, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}
