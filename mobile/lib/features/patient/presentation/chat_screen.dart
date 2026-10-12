import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../models/chat_message.dart';
import '../../../widgets/brand.dart';
import '../../../widgets/loading_overlay.dart';
import '../patient_controller.dart';

const _assistantName = "Dr. Shekhar Srivastav's Assistant";

const _exampleQuestions = [
  'Can I walk after surgery?',
  'When can I exercise?',
  'I have a question about my recovery.',
];

class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key, this.sessionId});

  final String? sessionId;

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _inputController = TextEditingController();
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    if (widget.sessionId != null) {
      Future.microtask(() => ref.read(chatControllerProvider.notifier).loadSession(widget.sessionId!));
    }
  }

  @override
  void dispose() {
    _inputController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  /// The list is reversed (newest at offset 0), so "the bottom" is offset 0 -
  /// no waiting for layout to learn the new maxScrollExtent.
  void _scrollToBottom() {
    if (!_scrollController.hasClients || _scrollController.offset == 0) return;
    _scrollController.animateTo(0, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
  }

  Future<void> _send([String? text]) async {
    final message = text ?? _inputController.text;
    if (message.trim().isEmpty) return;
    _inputController.clear();
    await ref.read(chatControllerProvider.notifier).sendMessage(message);
  }

  Future<void> _requestDoctor(ChatMessage message) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      final id = await ref.read(chatControllerProvider.notifier).requestDoctor(message);
      messenger.showSnackBar(
        SnackBar(content: Text(id != null ? 'A doctor has been notified.' : 'Request sent.')),
      );
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('Could not reach the clinic team. $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final chatState = ref.watch(chatControllerProvider);

    // New message, or the typing indicator appearing/disappearing: keep the
    // newest content in view.
    ref.listen<ChatState>(chatControllerProvider, (previous, next) {
      if (previous?.messages.length != next.messages.length || previous?.sending != next.sending) {
        _scrollToBottom();
      }
    });

    final feedbackTargetId = feedbackTargetMessageId(chatState.messages);
    final showEmpty = chatState.messages.isEmpty && !chatState.sending;

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: MediaQuery.withClampedTextScaling(
          maxScaleFactor: 1.3,
          child: Row(
            children: [
              const BrandAvatar(size: 38),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      _assistantName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    Text(
                      'Prime Ortho',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: Theme.of(context).colorScheme.onSurfaceVariant,
                          ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
      // resizeToAvoidBottomInset defaults to true — keep it so the composer
      // rises above the keyboard rather than being covered by it.
      body: Column(
        children: [
          Expanded(
            child: showEmpty
                ? _EmptyChatPrompt(onExampleTap: _send)
                // Reversed, so it opens on - and stays anchored to - the newest
                // message: a long conversation shows the latest reply (and its
                // feedback prompt) first, and the keyboard opening or a reply
                // arriving never leaves the newest content hidden.
                : ListView.builder(
                    controller: _scrollController,
                    reverse: true,
                    padding: const EdgeInsets.fromLTRB(16, 20, 16, 12),
                    itemCount: chatState.messages.length + (chatState.sending ? 1 : 0),
                    itemBuilder: (context, i) {
                      if (chatState.sending && i == 0) return const _TypingIndicator();
                      final index = chatState.messages.length - 1 - (chatState.sending ? i - 1 : i);
                      final message = chatState.messages[index];
                      final previous = index > 0 ? chatState.messages[index - 1] : null;
                      return Padding(
                        // Tighter spacing within one speaker's run of messages.
                        padding: EdgeInsets.only(top: previous?.sender == message.sender ? 6 : 14),
                        child: message.sender == MessageSender.patient
                            ? _PatientBubble(message: message)
                            : _AssistantMessage(
                                message: message,
                                showFeedback: message.id == feedbackTargetId,
                                onHelpful: () => ref.read(chatControllerProvider.notifier).setHelpful(message.id, true),
                                onTalkToDoctor: () => _requestDoctor(message),
                              ),
                      );
                    },
                  ),
          ),
          if (chatState.error != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: InlineErrorBanner(message: chatState.error!),
            ),
          _Composer(
            controller: _inputController,
            sending: chatState.sending,
            onSend: _send,
          ),
        ],
      ),
    );
  }
}

class _PatientBubble extends StatelessWidget {
  const _PatientBubble({required this.message});

  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Align(
      alignment: Alignment.centerRight,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.78),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: scheme.primary,
            borderRadius: const BorderRadius.only(
              topLeft: Radius.circular(18),
              topRight: Radius.circular(18),
              bottomLeft: Radius.circular(18),
              bottomRight: Radius.circular(6),
            ),
          ),
          child: Text(
            message.text,
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(color: scheme.onPrimary),
          ),
        ),
      ),
    );
  }
}

class _AssistantMessage extends StatelessWidget {
  const _AssistantMessage({
    required this.message,
    required this.showFeedback,
    required this.onHelpful,
    required this.onTalkToDoctor,
  });

  final ChatMessage message;
  final bool showFeedback;
  final VoidCallback onHelpful;
  final VoidCallback onTalkToDoctor;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final escalated = message.needsHumanFollowUp || message.helpful == false;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.only(top: 2),
          child: BrandAvatar(size: 30),
        ),
        const SizedBox(width: 8),
        // The column takes all remaining width so the feedback panel and its
        // buttons get the full row to wrap in; only the bubble itself is
        // capped to a readable measure.
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ConstrainedBox(
                constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.80),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                  decoration: BoxDecoration(
                    color: scheme.surface,
                    border: Border.all(color: scheme.outlineVariant),
                    borderRadius: const BorderRadius.only(
                      topLeft: Radius.circular(6),
                      topRight: Radius.circular(18),
                      bottomLeft: Radius.circular(18),
                      bottomRight: Radius.circular(18),
                    ),
                  ),
                  child: _FormattedText(text: message.text),
                ),
              ),
              if (escalated) ...[
                const SizedBox(height: 6),
                const _EscalatedNote(),
              ],
              if (showFeedback) ...[
                const SizedBox(height: 10),
                _FeedbackPanel(onHelpful: onHelpful, onTalkToDoctor: onTalkToDoctor),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

/// Renders the assistant's plain-text replies with readable structure: blank
/// lines become paragraph gaps, and "- " / "• " / "1." lines become proper
/// list items with a hanging indent, instead of one undifferentiated block.
class _FormattedText extends StatelessWidget {
  const _FormattedText({required this.text});

  final String text;

  static final _bullet = RegExp(r'^\s*[-•*]\s+');
  static final _numbered = RegExp(r'^\s*(\d+)[.)]\s+');

  @override
  Widget build(BuildContext context) {
    final style = Theme.of(context).textTheme.bodyLarge;
    final lines = text.trim().split('\n');
    final children = <Widget>[];
    for (final raw in lines) {
      final line = raw.trimRight();
      if (line.trim().isEmpty) {
        if (children.isNotEmpty) children.add(const SizedBox(height: 8));
        continue;
      }
      final bullet = _bullet.firstMatch(line);
      final numbered = _numbered.firstMatch(line);
      if (bullet != null || numbered != null) {
        final marker = bullet != null ? '•' : '${numbered!.group(1)}.';
        final body = line.substring((bullet ?? numbered)!.end);
        children.add(Padding(
          padding: const EdgeInsets.only(top: 2),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(width: 20, child: Text(marker, style: style)),
              Expanded(child: Text(body, style: style)),
            ],
          ),
        ));
      } else {
        children.add(Text(line, style: style));
      }
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: children);
  }
}

class _EscalatedNote extends StatelessWidget {
  const _EscalatedNote();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Row(
      children: [
        Icon(Icons.support_agent_outlined, size: 16, color: scheme.primary),
        const SizedBox(width: 6),
        Flexible(
          child: Text(
            'Shared with the clinic team',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
          ),
        ),
      ],
    );
  }
}

/// "Was this helpful?" with its two actions.
///
/// The actions sit in a Wrap, not a Row: on a narrow phone or with large system
/// text, "No, talk to a doctor" drops onto its own line (and its label can wrap
/// inside the button) instead of being pushed off the edge and clipped, which
/// is what the old single Row inside the bubble's 80% width did.
class _FeedbackPanel extends StatelessWidget {
  const _FeedbackPanel({required this.onHelpful, required this.onTalkToDoctor});

  final VoidCallback onHelpful;
  final VoidCallback onTalkToDoctor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    const compact = Size(0, 44);
    const padding = EdgeInsets.symmetric(horizontal: 14, vertical: 10);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
      decoration: BoxDecoration(
        color: scheme.surfaceContainer,
        borderRadius: BorderRadius.circular(AppTheme.radiusMd),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Was this helpful?', style: theme.textTheme.titleSmall),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton.icon(
                onPressed: onHelpful,
                style: OutlinedButton.styleFrom(minimumSize: compact, padding: padding),
                icon: const Icon(Icons.thumb_up_outlined, size: 18),
                label: const Text('Yes, thanks'),
              ),
              FilledButton.tonalIcon(
                onPressed: onTalkToDoctor,
                style: FilledButton.styleFrom(minimumSize: compact, padding: padding),
                icon: const Icon(Icons.support_agent_outlined, size: 18),
                label: const Text('No, talk to a doctor'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _TypingIndicator extends StatefulWidget {
  const _TypingIndicator();

  @override
  State<_TypingIndicator> createState() => _TypingIndicatorState();
}

class _TypingIndicatorState extends State<_TypingIndicator> with SingleTickerProviderStateMixin {
  late final AnimationController _controller =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1100))..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(top: 14),
      child: Semantics(
        label: '$_assistantName is typing',
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const BrandAvatar(size: 30),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              decoration: BoxDecoration(
                color: scheme.surface,
                border: Border.all(color: scheme.outlineVariant),
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(6),
                  topRight: Radius.circular(18),
                  bottomLeft: Radius.circular(18),
                  bottomRight: Radius.circular(18),
                ),
              ),
              child: AnimatedBuilder(
                animation: _controller,
                builder: (context, _) => Row(
                  mainAxisSize: MainAxisSize.min,
                  children: List.generate(3, (i) {
                    // Each dot pulses in turn.
                    final phase = (_controller.value - i * 0.18) % 1.0;
                    final t = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
                    return Container(
                      margin: EdgeInsets.only(left: i == 0 ? 0 : 5),
                      width: 7,
                      height: 7,
                      decoration: BoxDecoration(
                        color: scheme.primary.withValues(alpha: 0.30 + 0.55 * t),
                        shape: BoxShape.circle,
                      ),
                    );
                  }),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  const _Composer({required this.controller, required this.sending, required this.onSend});

  final TextEditingController controller;
  final bool sending;
  final Future<void> Function([String? text]) onSend;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: scheme.surface,
        border: Border(top: BorderSide(color: scheme.outlineVariant)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: TextField(
                  controller: controller,
                  minLines: 1,
                  maxLines: 5,
                  textCapitalization: TextCapitalization.sentences,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => onSend(),
                  decoration: InputDecoration(
                    hintText: 'Type your question…',
                    isDense: true,
                    fillColor: scheme.surfaceContainerLow,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 13),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide.none),
                    enabledBorder:
                        OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide.none),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(24),
                      borderSide: BorderSide(color: scheme.primary, width: 1.4),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 6),
              // Enabled only when there is something to send and no reply is
              // pending - the button's state shows whether a tap will do anything.
              ValueListenableBuilder<TextEditingValue>(
                valueListenable: controller,
                builder: (context, value, _) {
                  final canSend = !sending && value.text.trim().isNotEmpty;
                  return IconButton.filled(
                    onPressed: canSend ? () => onSend() : null,
                    tooltip: 'Send',
                    iconSize: 22,
                    style: IconButton.styleFrom(minimumSize: const Size(48, 48)),
                    icon: const Icon(Icons.send_rounded),
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EmptyChatPrompt extends StatelessWidget {
  final ValueChanged<String> onExampleTap;
  const _EmptyChatPrompt({required this.onExampleTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: constraints.maxHeight),
          child: Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const BrandAvatar(size: 72),
                  const SizedBox(height: 16),
                  Text(
                    "Hi! I'm $_assistantName",
                    textAlign: TextAlign.center,
                    style: theme.textTheme.titleLarge,
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'How can I help you today?',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodyLarge?.copyWith(color: scheme.onSurfaceVariant),
                  ),
                  const SizedBox(height: 20),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    alignment: WrapAlignment.center,
                    children: _exampleQuestions
                        .map((q) => ActionChip(label: Text(q), onPressed: () => onExampleTap(q)))
                        .toList(),
                  ),
                  const SizedBox(height: 28),
                  Text(
                    'In a life-threatening emergency, go to the nearest ER or '
                    'Shanti Mukand Hospital Casualty.',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
