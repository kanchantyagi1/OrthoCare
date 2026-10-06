export enum DocumentStatus {
  UPLOADED = 'UPLOADED',
  PROCESSING = 'PROCESSING',
  READY_FOR_REVIEW = 'READY_FOR_REVIEW',
  ACTIVE = 'ACTIVE',
  FAILED = 'FAILED',
  ARCHIVED = 'ARCHIVED',
  // Seed/demo-only status - must never be served to the chatbot.
  DEMO_REVIEW_REQUIRED = 'DEMO_REVIEW_REQUIRED',
  OCR_REQUIRED = 'OCR_REQUIRED',
}

export const CHATBOT_RETRIEVABLE_STATUSES = [DocumentStatus.ACTIVE];
