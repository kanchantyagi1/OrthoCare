import 'package:flutter/material.dart';

class LoadingOverlay extends StatelessWidget {
  const LoadingOverlay({super.key});

  @override
  Widget build(BuildContext context) => const Center(child: CircularProgressIndicator());
}

/// Full-area error state. Lives inside the screens' RefreshIndicator, so it is
/// scrollable - pull-to-refresh keeps working from an error, not just Retry.
class ErrorRetryView extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const ErrorRetryView({super.key, required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return _CenteredScrollable(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _StateIcon(icon: Icons.wifi_off_rounded, color: scheme.error, background: scheme.errorContainer),
          const SizedBox(height: 16),
          Text('Something went wrong', style: theme.textTheme.titleMedium, textAlign: TextAlign.center),
          const SizedBox(height: 6),
          Text(
            message,
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 20),
          FilledButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh), label: const Text('Try again')),
        ],
      ),
    );
  }
}

class EmptyStateView extends StatelessWidget {
  final String message;
  final IconData icon;
  const EmptyStateView({super.key, required this.message, this.icon = Icons.inbox_outlined});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return _CenteredScrollable(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _StateIcon(icon: icon, color: scheme.primary, background: scheme.primaryContainer),
          const SizedBox(height: 16),
          Text(
            message,
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyLarge?.copyWith(color: scheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}

/// A compact error message shown inline next to the control it relates to
/// (a form, the chat composer) rather than replacing the whole screen.
class InlineErrorBanner extends StatelessWidget {
  const InlineErrorBanner({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(color: scheme.errorContainer, borderRadius: BorderRadius.circular(12)),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.error_outline, size: 20, color: scheme.onErrorContainer),
            const SizedBox(width: 10),
            Expanded(child: Text(message, style: TextStyle(color: scheme.onErrorContainer))),
          ],
        ),
      ),
    );
  }
}

class _StateIcon extends StatelessWidget {
  const _StateIcon({required this.icon, required this.color, required this.background});

  final IconData icon;
  final Color color;
  final Color background;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 64,
      height: 64,
      decoration: BoxDecoration(color: background, shape: BoxShape.circle),
      child: Icon(icon, size: 30, color: color),
    );
  }
}

class _CenteredScrollable extends StatelessWidget {
  const _CenteredScrollable({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: constraints.maxHeight),
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 420), child: child),
            ),
          ),
        ),
      ),
    );
  }
}
