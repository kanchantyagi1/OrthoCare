import { Escalation } from './entities/escalation.entity';
import { Patient } from '../patients/entities/patient.entity';

export interface EscalationSource {
  documentId: string;
  fileName: string;
  pageNumber: number | null;
  sectionTitle: string | null;
  similarityScore: number | null;
}

export interface EscalationView {
  id: string;
  patientId: string;
  patientName: string;
  patientPhone: string | null;
  surgeryType: string | null;
  surgeryDate: string | null;
  chatSessionId: string | null;
  question: string;
  aiResponse: string | null;
  reason: string | null;
  priority: string;
  status: string;
  assignedDoctorId: string | null;
  assignedDoctorName: string | null;
  sources: EscalationSource[];
  createdAt: string;
  assignedAt: string | null;
  contactedAt: string | null;
  resolvedAt: string | null;
}

/**
 * The doctor case screen needs a name and a *callable phone number* - that is the
 * whole point of account-less patients. Phone/name come from the patient row, with
 * a fallback to the linked user account for patients that predate the change.
 */
export function toEscalationView(
  escalation: Escalation,
  patient?: Patient | null,
  assignedDoctorName?: string | null,
  sources: EscalationSource[] = [],
): EscalationView {
  return {
    id: escalation.id,
    patientId: escalation.patientId,
    patientName: patient?.fullName || patient?.user?.fullName || 'Patient',
    patientPhone: patient?.phone || patient?.user?.phone || null,
    surgeryType: patient?.surgeryType ?? null,
    surgeryDate: patient?.surgeryDate ?? null,
    chatSessionId: escalation.chatSessionId ?? null,
    question: escalation.question,
    aiResponse: escalation.aiResponse ?? null,
    reason: escalation.reason ?? null,
    priority: escalation.priority,
    status: escalation.status,
    assignedDoctorId: escalation.assignedDoctorId ?? null,
    assignedDoctorName: assignedDoctorName ?? null,
    sources,
    createdAt: escalation.createdAt.toISOString(),
    assignedAt: escalation.assignedAt?.toISOString() ?? null,
    contactedAt: escalation.contactedAt?.toISOString() ?? null,
    resolvedAt: escalation.resolvedAt?.toISOString() ?? null,
  };
}
