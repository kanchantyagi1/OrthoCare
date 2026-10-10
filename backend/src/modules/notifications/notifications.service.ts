import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { FcmProviderService } from './fcm-provider.service';
import { User } from '../users/entities/user.entity';
import { EscalationPriority } from '../../common/enums/escalation.enum';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
    private readonly fcm: FcmProviderService,
  ) {}

  async notifyEscalationAssigned(params: {
    doctorUser: User;
    patientName: string;
    priority: EscalationPriority;
    escalationId: string;
  }) {
    const isUrgent = params.priority === EscalationPriority.URGENT;
    const title = isUrgent ? 'URGENT PATIENT QUERY' : 'New Patient Query';
    const body = isUrgent
      ? `Immediate attention required for ${params.patientName}.`
      : `Patient: ${params.patientName}\nPriority: ${params.priority}\nPlease respond.`;

    const notification = this.notifications.create({
      userId: params.doctorUser.id,
      title,
      body,
      data: { escalationId: params.escalationId, priority: params.priority },
      relatedEscalationId: params.escalationId,
      status: 'PENDING',
    });
    await this.notifications.save(notification);

    const result = await this.fcm.send({
      deviceToken: params.doctorUser.fcmToken,
      title,
      body,
      data: { escalationId: params.escalationId },
    });

    notification.status = result.success ? (result.mocked ? 'MOCKED' : 'SENT') : 'FAILED';
    notification.failureReason = result.error;
    await this.notifications.save(notification);

    if (!result.success) {
      this.logger.warn(`FCM delivery failed for escalation ${params.escalationId}: ${result.error}`);
    }

    return notification;
  }

  async notifyAdminsNoDoctorAvailable(adminUsers: User[], escalationId: string) {
    for (const admin of adminUsers) {
      const notification = this.notifications.create({
        userId: admin.id,
        title: 'No doctor currently available',
        body: `Escalation ${escalationId} is waiting for a doctor to come online.`,
        data: { escalationId },
        relatedEscalationId: escalationId,
        status: 'PENDING',
      });
      await this.notifications.save(notification);
      const result = await this.fcm.send({
        deviceToken: admin.fcmToken,
        title: notification.title,
        body: notification.body,
      });
      notification.status = result.success ? (result.mocked ? 'MOCKED' : 'SENT') : 'FAILED';
      notification.failureReason = result.error;
      await this.notifications.save(notification);
    }
  }
}
