import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1735700000000 implements MigrationInterface {
  name = 'InitSchema1735700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);

    await queryRunner.query(
      `CREATE TYPE "users_role_enum" AS ENUM ('admin','doctor','nurse','patient')`,
    );
    await queryRunner.query(
      `CREATE TYPE "document_status_enum" AS ENUM ('UPLOADED','PROCESSING','READY_FOR_REVIEW','ACTIVE','FAILED','ARCHIVED','DEMO_REVIEW_REQUIRED','OCR_REQUIRED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "escalation_status_enum" AS ENUM ('WAITING_FOR_NURSE','ASSIGNED','CONTACTED','RESOLVED','ESCALATED_TO_DOCTOR')`,
    );
    await queryRunner.query(
      `CREATE TYPE "escalation_priority_enum" AS ENUM ('normal','high','urgent')`,
    );
    await queryRunner.query(
      `CREATE TYPE "ai_confidence_enum" AS ENUM ('supported','insufficient_context')`,
    );
    await queryRunner.query(
      `CREATE TYPE "audit_event_enum" AS ENUM ('LOGIN','LOGOUT','PUNCH_IN','PUNCH_OUT','DOCUMENT_UPLOADED','DOCUMENT_ACTIVATED','DOCUMENT_ARCHIVED','EMBEDDING_CREATED','AI_RESPONSE','ESCALATION_CREATED','ESCALATION_ASSIGNED','NURSE_CONTACTED','CASE_RESOLVED','DOCTOR_ESCALATION','RETENTION_CLEANUP')`,
    );

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "email" varchar NOT NULL UNIQUE,
        "password_hash" varchar NOT NULL,
        "role" users_role_enum NOT NULL,
        "full_name" varchar NOT NULL,
        "phone" varchar,
        "is_active" boolean NOT NULL DEFAULT true,
        "fcm_token" varchar
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "doctors" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "specialization" varchar,
        "license_number" varchar
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "nurses" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "employee_code" varchar,
        "is_active" boolean NOT NULL DEFAULT true
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "patients" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "surgery_type" varchar,
        "surgery_date" date,
        "doctor_id" uuid REFERENCES "doctors"("id") ON DELETE SET NULL,
        "preferred_language" varchar NOT NULL DEFAULT 'en'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "shifts" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "nurse_id" uuid NOT NULL REFERENCES "nurses"("id") ON DELETE CASCADE,
        "label" varchar,
        "start_time" varchar NOT NULL,
        "end_time" varchar NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "attendance" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "nurse_id" uuid NOT NULL REFERENCES "nurses"("id") ON DELETE CASCADE,
        "shift_id" uuid REFERENCES "shifts"("id") ON DELETE SET NULL,
        "punch_in" timestamptz NOT NULL,
        "punch_out" timestamptz,
        "device_id" varchar
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_attendance_open_punch" ON "attendance" ("nurse_id") WHERE "punch_out" IS NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "documents" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "title" varchar NOT NULL,
        "surgery_type" varchar,
        "category" varchar,
        "status" document_status_enum NOT NULL DEFAULT 'UPLOADED',
        "current_version_id" uuid,
        "uploaded_by_user_id" uuid NOT NULL REFERENCES "users"("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "document_versions" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
        "version_label" varchar NOT NULL,
        "file_name" varchar NOT NULL,
        "mime_type" varchar NOT NULL,
        "storage_key" varchar NOT NULL,
        "storage_backend" varchar NOT NULL DEFAULT 'local',
        "status" document_status_enum NOT NULL DEFAULT 'UPLOADED',
        "failure_reason" text,
        "chunk_count" integer NOT NULL DEFAULT 0,
        "processed_at" timestamptz
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_document_versions_document_id" ON "document_versions" ("document_id")`);

    await queryRunner.query(`
      CREATE TABLE "knowledge_chunks" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
        "document_version_id" uuid NOT NULL REFERENCES "document_versions"("id") ON DELETE CASCADE,
        "document_version" varchar NOT NULL,
        "file_name" varchar NOT NULL,
        "page_number" integer,
        "section_title" varchar,
        "chunk_index" integer NOT NULL,
        "chunk_text" text NOT NULL,
        "embedding" vector(1536),
        "status" document_status_enum NOT NULL DEFAULT 'UPLOADED',
        "surgery_type" varchar,
        "category" varchar,
        "recovery_phase" varchar,
        "language" varchar NOT NULL DEFAULT 'en'
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_knowledge_chunks_document_id" ON "knowledge_chunks" ("document_id")`);
    await queryRunner.query(`CREATE INDEX "idx_knowledge_chunks_status" ON "knowledge_chunks" ("status")`);
    // HNSW cosine-distance index for fast similarity search over ACTIVE chunks.
    await queryRunner.query(
      `CREATE INDEX "idx_knowledge_chunks_embedding_hnsw" ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops)`,
    );

    await queryRunner.query(`
      CREATE TABLE "chat_sessions" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "patient_id" uuid NOT NULL REFERENCES "patients"("id") ON DELETE CASCADE,
        "last_message_at" timestamptz,
        "status" varchar NOT NULL DEFAULT 'OPEN'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "chat_messages" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "session_id" uuid NOT NULL REFERENCES "chat_sessions"("id") ON DELETE CASCADE,
        "role" varchar NOT NULL,
        "message" text NOT NULL,
        "confidence" ai_confidence_enum,
        "needs_human" boolean NOT NULL DEFAULT false,
        "priority" escalation_priority_enum,
        "reason" text,
        "source_chunk_ids" jsonb,
        "similarity_scores" jsonb,
        "model" varchar,
        "helpful" boolean
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_chat_messages_session_id" ON "chat_messages" ("session_id")`);

    await queryRunner.query(`
      CREATE TABLE "escalations" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "patient_id" uuid NOT NULL REFERENCES "patients"("id") ON DELETE CASCADE,
        "chat_session_id" uuid REFERENCES "chat_sessions"("id") ON DELETE SET NULL,
        "chat_message_id" uuid REFERENCES "chat_messages"("id") ON DELETE SET NULL,
        "question" text NOT NULL,
        "ai_response" text,
        "reason" text NOT NULL,
        "priority" escalation_priority_enum NOT NULL DEFAULT 'normal',
        "assigned_nurse_id" uuid REFERENCES "nurses"("id") ON DELETE SET NULL,
        "status" escalation_status_enum NOT NULL DEFAULT 'WAITING_FOR_NURSE',
        "assigned_at" timestamptz,
        "contacted_at" timestamptz,
        "resolved_at" timestamptz
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_escalations_status" ON "escalations" ("status")`);
    await queryRunner.query(`CREATE INDEX "idx_escalations_assigned_nurse_id" ON "escalations" ("assigned_nurse_id")`);

    await queryRunner.query(`
      CREATE TABLE "nurse_case_notes" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "escalation_id" uuid NOT NULL REFERENCES "escalations"("id") ON DELETE CASCADE,
        "nurse_id" uuid REFERENCES "nurses"("id") ON DELETE SET NULL,
        "patient_contacted" boolean NOT NULL DEFAULT false,
        "contact_time" timestamptz,
        "issue_category" varchar,
        "resolution" text,
        "follow_up_required" boolean NOT NULL DEFAULT false,
        "escalate_to_doctor" boolean NOT NULL DEFAULT false,
        "notes" text
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "title" varchar NOT NULL,
        "body" text NOT NULL,
        "data" jsonb,
        "status" varchar NOT NULL DEFAULT 'PENDING',
        "related_escalation_id" uuid REFERENCES "escalations"("id") ON DELETE SET NULL,
        "failure_reason" text
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "event" audit_event_enum NOT NULL,
        "actor_user_id" uuid,
        "metadata" jsonb
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "red_flag_rules" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "name" varchar NOT NULL,
        "description" text,
        "keywords" jsonb NOT NULL DEFAULT '[]',
        "symptoms" jsonb NOT NULL DEFAULT '[]',
        "priority" escalation_priority_enum NOT NULL DEFAULT 'urgent',
        "doctor_id" uuid REFERENCES "doctors"("id") ON DELETE SET NULL,
        "status" varchar NOT NULL DEFAULT 'ACTIVE'
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "red_flag_rules"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "nurse_case_notes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "escalations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chat_messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chat_sessions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "knowledge_chunks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "document_versions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "documents"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "attendance"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "shifts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "patients"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "nurses"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "doctors"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "audit_event_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "ai_confidence_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "escalation_priority_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "escalation_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "document_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_role_enum"`);
  }
}
