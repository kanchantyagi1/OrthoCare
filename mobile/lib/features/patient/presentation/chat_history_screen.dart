import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../widgets/dashboard.dart';
import '../../../widgets/loading_overlay.dart';
import '../patient_controller.dart';

class ChatHistoryScreen extends ConsumerWidget {
  const ChatHistoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final history = ref.watch(chatHistoryProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Chat History')),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(chatHistoryProvider),
        child: history.when(
          loading: () => const LoadingOverlay(),
          error: (e, _) => ErrorRetryView(message: e.toString(), onRetry: () => ref.invalidate(chatHistoryProvider)),
          data: (sessions) {
            if (sessions.isEmpty) {
              return const EmptyStateView(message: 'No conversations yet.', icon: Icons.chat_bubble_outline);
            }
            return ListView.separated(
              padding: EdgeInsets.fromLTRB(16, 8, 16, 24 + MediaQuery.paddingOf(context).bottom),
              itemCount: sessions.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (context, i) {
                final s = sessions[i];
                return ActionTile(
                  icon: Icons.chat_bubble_outline,
                  title: s.lastMessagePreview ?? 'Conversation',
                  subtitle: DateFormat.yMMMd().add_jm().format(s.createdAt),
                  onTap: () => context.push('/patient/chat?sessionId=${s.id}'),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
