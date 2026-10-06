enum DocumentStatus { uploaded, processing, readyForReview, active, failed, archived, demoReviewRequired }

DocumentStatus documentStatusFromString(String value) {
  switch (value.toUpperCase()) {
    case 'UPLOADED':
      return DocumentStatus.uploaded;
    case 'PROCESSING':
      return DocumentStatus.processing;
    case 'READY_FOR_REVIEW':
      return DocumentStatus.readyForReview;
    case 'ACTIVE':
      return DocumentStatus.active;
    case 'FAILED':
      return DocumentStatus.failed;
    case 'ARCHIVED':
      return DocumentStatus.archived;
    case 'DEMO_REVIEW_REQUIRED':
      return DocumentStatus.demoReviewRequired;
    default:
      return DocumentStatus.uploaded;
  }
}

class KnowledgeDocument {
  final String id;
  final String fileName;
  final String fileType;
  final String version;
  final DocumentStatus status;
  final String uploadedByName;
  final DateTime uploadedAt;
  final int chunkCount;
  final String? failureReason;

  const KnowledgeDocument({
    required this.id,
    required this.fileName,
    required this.fileType,
    required this.version,
    required this.status,
    required this.uploadedByName,
    required this.uploadedAt,
    required this.chunkCount,
    this.failureReason,
  });

  factory KnowledgeDocument.fromJson(Map<String, dynamic> json) => KnowledgeDocument(
        id: json['id'] as String,
        fileName: json['fileName'] as String? ?? '',
        fileType: json['fileType'] as String? ?? '',
        version: json['version'] as String? ?? '1',
        status: documentStatusFromString(json['status'] as String? ?? 'UPLOADED'),
        uploadedByName: json['uploadedByName'] as String? ?? '',
        uploadedAt: DateTime.parse(json['uploadedAt'] as String),
        chunkCount: json['chunkCount'] as int? ?? 0,
        failureReason: json['failureReason'] as String?,
      );
}
