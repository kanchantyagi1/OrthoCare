import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

/// Quiet "Powered by PractiGo" credit line.
///
/// Deliberately low-contrast and caption-sized: this is an attribution, not UI
/// a patient needs. It belongs only on entry/peripheral surfaces (welcome,
/// staff login, profile) — never in the chat, a case screen, or anywhere in the
/// escalation flow, where a post-operative patient is mid-task.
class PoweredByPractiGo extends StatelessWidget {
  const PoweredByPractiGo({super.key});

  static final Uri _url = Uri.parse('https://practigo.in');

  Future<void> _open() async {
    // A dead credit link must never surface an error to a patient, so this
    // fails silently rather than showing a snackbar.
    try {
      await launchUrl(_url, mode: LaunchMode.externalApplication);
    } catch (_) {
      // Intentionally ignored.
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurfaceVariant;
    final caption = theme.textTheme.bodySmall;

    return Semantics(
      link: true,
      label: 'Powered by PractiGo. Opens practigo.in',
      child: InkWell(
        onTap: _open,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          // Keeps the tap target comfortable without taking real layout space.
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Text.rich(
            TextSpan(
              style: caption?.copyWith(color: muted),
              children: [
                const TextSpan(text: 'Powered by '),
                TextSpan(
                  text: 'PractiGo',
                  style: caption?.copyWith(
                    color: theme.colorScheme.primary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
            textAlign: TextAlign.center,
          ),
        ),
      ),
    );
  }
}
