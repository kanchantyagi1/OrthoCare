export enum EscalationStatus {
  WAITING_FOR_DOCTOR = 'WAITING_FOR_DOCTOR',
  ASSIGNED = 'ASSIGNED',
  CONTACTED = 'CONTACTED',
  RESOLVED = 'RESOLVED',
  ESCALATED_TO_DOCTOR = 'ESCALATED_TO_DOCTOR',
}

export enum EscalationPriority {
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum AiConfidence {
  SUPPORTED = 'supported',
  INSUFFICIENT_CONTEXT = 'insufficient_context',
}
