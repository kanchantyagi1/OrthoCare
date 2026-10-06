import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../app.module';
import { UsersService } from '../modules/users/users.service';
import { DoctorsService } from '../modules/doctors/doctors.service';
import { NursesService } from '../modules/nurses/nurses.service';
import { PatientsService } from '../modules/patients/patients.service';
import { ShiftsService } from '../modules/shifts/shifts.service';
import { KnowledgeService } from '../modules/knowledge/knowledge.service';
import { AuthService } from '../modules/auth/auth.service';
import { ClinicDocument } from '../modules/documents/entities/document.entity';
import { DocumentVersion } from '../modules/documents/entities/document-version.entity';
import { DocumentStatus } from '../common/enums/document-status.enum';
import { Role } from '../common/enums/role.enum';

interface DemoRecord {
  title: string;
  surgeryType: string;
  category: string;
  sectionTitle: string;
  knowledgeText: string;
}

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });

  const users = app.get(UsersService);
  const doctors = app.get(DoctorsService);
  const nurses = app.get(NursesService);
  const patients = app.get(PatientsService);
  const shifts = app.get(ShiftsService);
  const knowledge = app.get(KnowledgeService);
  const documentRepo = app.get<Repository<ClinicDocument>>(getRepositoryToken(ClinicDocument));
  const versionRepo = app.get<Repository<DocumentVersion>>(getRepositoryToken(DocumentVersion));

  console.log('--- Seeding demo accounts ---');

  let admin = await users.findByEmail('admin@orthocare.demo');
  if (!admin) {
    admin = await users.create({
      email: 'admin@orthocare.demo',
      passwordHash: await AuthService.hashPassword('Password123!'),
      fullName: 'Clinic Admin',
      role: Role.ADMIN,
    });
  }

  let doctor = await doctors.findAll().then((d) => d.find((x) => x.user?.email === 'doctor@orthocare.demo'));
  if (!doctor) {
    doctor = await doctors.create({
      email: 'doctor@orthocare.demo',
      password: 'Password123!',
      fullName: 'Dr. Asha Mehta',
      specialization: 'Orthopedic Surgery',
    });
  }

  let nurse = await nurses.findAll().then((n) => n.find((x) => x.user?.email === 'nurse@orthocare.demo'));
  if (!nurse) {
    nurse = await nurses.create({
      email: 'nurse@orthocare.demo',
      password: 'Password123!',
      fullName: 'Priya Nair',
      employeeCode: 'N-001',
    });
    // Wide-open demo shift so the seeded nurse is always "on shift" for manual/E2E testing.
    await shifts.create({
      nurseId: nurse.id,
      label: 'Demo All-Day Shift',
      startTime: '00:00',
      endTime: '23:59',
    });
  }

  let patient = await patients.findAll().then((p) => p.find((x) => x.user?.email === 'patient@orthocare.demo'));
  if (!patient) {
    patient = await patients.create({
      email: 'patient@orthocare.demo',
      password: 'Password123!',
      fullName: 'Rahul Sharma',
      surgeryType: 'Knee Replacement',
      surgeryDate: '2026-09-20',
      doctorId: doctor.id,
    });
  }

  console.log('Demo accounts ready:');
  console.log('  admin@orthocare.demo / Password123!');
  console.log('  doctor@orthocare.demo / Password123!');
  console.log('  nurse@orthocare.demo / Password123! (shift 00:00-23:59, not punched in yet)');
  console.log('  patient@orthocare.demo / Password123!');

  console.log('--- Seeding demo knowledge pack (DEMO_REVIEW_REQUIRED, not ACTIVE) ---');

  const packPath = path.join(__dirname, '..', '..', '..', 'knowledge', 'demo', 'demo-knowledge-pack.json');
  const records: DemoRecord[] = JSON.parse(fs.readFileSync(packPath, 'utf-8'));

  for (const record of records) {
    let document = await documentRepo.findOne({ where: { title: record.title } });
    if (document) {
      console.log(`  skip (already seeded): ${record.title}`);
      continue;
    }

    document = await documentRepo.save(
      documentRepo.create({
        title: record.title,
        surgeryType: record.surgeryType,
        category: record.category,
        status: DocumentStatus.DEMO_REVIEW_REQUIRED,
        uploadedByUserId: admin.id,
      }),
    );

    const version = await versionRepo.save(
      versionRepo.create({
        documentId: document.id,
        versionLabel: 'v1',
        fileName: `${record.title}.seed.json`,
        mimeType: 'application/json',
        storageKey: '(seed-data, no file on disk)',
        storageBackend: 'local',
        status: DocumentStatus.DEMO_REVIEW_REQUIRED,
        chunkCount: 1,
        processedAt: new Date(),
      }),
    );

    await knowledge.insertChunks({
      documentId: document.id,
      documentVersionId: version.id,
      documentVersion: version.versionLabel,
      fileName: version.fileName,
      surgeryType: record.surgeryType,
      category: record.category,
      status: DocumentStatus.DEMO_REVIEW_REQUIRED,
      chunks: [{ sectionTitle: record.sectionTitle, chunkText: record.knowledgeText }],
    });

    console.log(`  seeded: ${record.title}`);
  }

  console.log('--- Done. Demo knowledge is DEMO_REVIEW_REQUIRED - a doctor/admin must explicitly ---');
  console.log('--- review and activate each document before the chatbot can use it.            ---');

  await app.close();
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
