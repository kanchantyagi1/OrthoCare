import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../models/document.dart';
import '../../../widgets/loading_overlay.dart';
import '../admin_controller.dart';

class KnowledgeBaseScreen extends ConsumerStatefulWidget {
  const KnowledgeBaseScreen({super.key});

  @override
  ConsumerState<KnowledgeBaseScreen> createState() => _KnowledgeBaseScreenState();
}

class _KnowledgeBaseScreenState extends ConsumerState<KnowledgeBaseScreen> {
  bool _uploading = false;

  Future<void> _pickAndUpload() async {
    final file = await FilePicker.pickFile(
      type: FileType.custom,
      allowedExtensions: ['pdf', 'docx'],
    );
    if (file?.path == null) return;

    setState(() => _uploading = true);
    try {
      await ref.read(adminActionsProvider).uploadDocument(filePath: file!.path!, fileName: file.name);
      ref.invalidate(knowledgeDocumentsProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Upload failed: $e')));
      }
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final documents = ref.watch(knowledgeDocumentsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Knowledge Base')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _uploading ? null : _pickAndUpload,
        icon: _uploading
            ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2))
            : const Icon(Icons.upload_file_outlined),
        label: const Text('Upload Document'),
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(knowledgeDocumentsProvider),
        child: documents.when(
          loading: () => const LoadingOverlay(),
          error: (e, _) => ErrorRetryView(message: e.toString(), onRetry: () => ref.invalidate(knowledgeDocumentsProvider)),
          data: (items) {
            if (items.isEmpty) {
              return const EmptyStateView(
                message: 'No documents yet. Upload a PDF or DOCX to build the RAG knowledge base.',
                icon: Icons.menu_book_outlined,
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.all(12),
              itemCount: items.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (context, i) => _DocumentRow(document: items[i]),
            );
          },
        ),
      ),
    );
  }
}

class _DocumentRow extends ConsumerWidget {
  final KnowledgeDocument document;
  const _DocumentRow({required this.document});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final actions = ref.read(adminActionsProvider);
    void refresh() => ref.invalidate(knowledgeDocumentsProvider);

    return ListTile(
      leading: Icon(_iconFor(document.status)),
      title: Text(document.fileName),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('v${document.version} • ${document.chunkCount} chunks • by ${document.uploadedByName}'),
          Text(DateFormat.yMMMd().add_jm().format(document.uploadedAt), style: Theme.of(context).textTheme.bodySmall),
          _StatusLine(status: document.status, failureReason: document.failureReason),
        ],
      ),
      isThreeLine: true,
      trailing: PopupMenuButton<String>(
        onSelected: (action) async {
          switch (action) {
            case 'activate':
              await actions.activateDocument(document.id);
              break;
            case 'archive':
              await actions.archiveDocument(document.id);
              break;
            case 'reprocess':
              await actions.reprocessDocument(document.id);
              break;
            case 'delete':
              await actions.deleteDocument(document.id);
              break;
          }
          refresh();
        },
        itemBuilder: (context) => [
          if (document.status != DocumentStatus.active)
            const PopupMenuItem(value: 'activate', child: Text('Activate')),
          if (document.status == DocumentStatus.active)
            const PopupMenuItem(value: 'archive', child: Text('Archive')),
          const PopupMenuItem(value: 'reprocess', child: Text('Reprocess')),
          const PopupMenuItem(value: 'delete', child: Text('Delete')),
        ],
      ),
    );
  }

  IconData _iconFor(DocumentStatus status) {
    switch (status) {
      case DocumentStatus.active:
        return Icons.check_circle_outline;
      case DocumentStatus.failed:
        return Icons.error_outline;
      case DocumentStatus.processing:
        return Icons.hourglass_empty;
      case DocumentStatus.archived:
        return Icons.archive_outlined;
      default:
        return Icons.description_outlined;
    }
  }
}

class _StatusLine extends StatelessWidget {
  final DocumentStatus status;
  final String? failureReason;
  const _StatusLine({required this.status, this.failureReason});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (color, label) = switch (status) {
      DocumentStatus.uploaded => (scheme.outline, 'Uploading...'),
      DocumentStatus.processing => (scheme.tertiary, 'Processing: extracting, chunking, embedding, indexing...'),
      DocumentStatus.readyForReview => (scheme.secondary, 'Ready for review'),
      DocumentStatus.demoReviewRequired => (scheme.secondary, 'Demo — review required before activation'),
      DocumentStatus.active => (Colors.green, 'Active'),
      DocumentStatus.failed => (scheme.error, 'Processing failed${failureReason != null ? ': $failureReason' : ''}'),
      DocumentStatus.archived => (scheme.outline, 'Archived'),
    };
    return Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w500));
  }
}
