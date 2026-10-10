import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../models/chat_message.dart';
import '../patient_controller.dart';

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

  void _scrollToBottom() {
    Future.delayed(const Duration(milliseconds: 80), () {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _send([String? text]) async {
    final message = text ?? _inputController.text;
    if (message.trim().isEmpty) return;
    _inputController.clear();
    await ref.read(chatControllerProvider.notifier).sendMessage(message);
    _scrollToBottom();
  }

  @override
  Widget build(BuildContext context) {
    final chatState = ref.watch(chatControllerProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Ask a Question')),
      // resizeToAvoidBottomInset defaults to true — keep it so the input bar
      // rises above the keyboard rather than being covered by it.
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: chatState.messages.isEmpty
                  ? _EmptyChatPrompt(onExampleTap: (q) => _send(q))
                  : ListView.builder(
                      controller: _scrollController,
                      padding: const EdgeInsets.all(16),
                      itemCount: chatState.messages.length,
                      itemBuilder: (context, i) {
                        final message = chatState.messages[i];
                        return _ChatBubble(message: message);
                      },
                    ),
            ),
            if (chatState.error != null)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Text(chatState.error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ),
            if (chatState.sending)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 8),
                child: SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2)),
              ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _inputController,
                        minLines: 1,
                        maxLines: 4,
                        textInputAction: TextInputAction.send,
                        onSubmitted: (_) => _send(),
                        decoration: const InputDecoration(hintText: 'Type your question...'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton.filled(
                      onPressed: chatState.sending ? null : () => _send(),
                      icon: const Icon(Icons.send),
                    ),
                  ],
                ),
              ),
            ),
          ],
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
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.health_and_safety_outlined, size: 48, color: Theme.of(context).colorScheme.primary),
            const SizedBox(height: 12),
            Text('How can I help you today?', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              alignment: WrapAlignment.center,
              children: _exampleQuestions
                  .map((q) => ActionChip(label: Text(q), onPressed: () => onExampleTap(q)))
                  .toList(),
            ),
          ],
        ),
      ),
    );
  }
}

class _ChatBubble extends ConsumerWidget {
  final ChatMessage message;
  const _ChatBubble({required this.message});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isPatient = message.sender == MessageSender.patient;
    final scheme = Theme.of(context).colorScheme;

    return Align(
      alignment: isPatient ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.8),
        child: Column(
          crossAxisAlignment: isPatient ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            Container(
              margin: const EdgeInsets.symmetric(vertical: 4),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: isPatient ? scheme.primary : scheme.surfaceContainerHigh,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Text(
                message.text,
                style: TextStyle(color: isPatient ? scheme.onPrimary : scheme.onSurface),
              ),
            ),
            if (message.sender == MessageSender.assistant && message.helpful == null)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('Was this helpful?', style: Theme.of(context).textTheme.bodySmall),
                    const SizedBox(width: 8),
                    TextButton.icon(
                      onPressed: () => ref.read(chatControllerProvider.notifier).setHelpful(message.id, true),
                      icon: const Icon(Icons.thumb_up_outlined, size: 16),
                      label: const Text('Yes'),
                    ),
                    TextButton.icon(
                      onPressed: () async {
                        final id = await ref.read(chatControllerProvider.notifier).requestDoctor(message);
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text(id != null ? 'A doctor has been notified.' : 'Request sent.')),
                          );
                        }
                      },
                      icon: const Icon(Icons.thumb_down_outlined, size: 16),
                      label: const Text('No, talk to a doctor'),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
