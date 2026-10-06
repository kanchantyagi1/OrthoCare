import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

export interface FcmSendResult {
  success: boolean;
  mocked: boolean;
  error?: string;
}

@Injectable()
export class FcmProviderService {
  private readonly logger = new Logger(FcmProviderService.name);
  private readonly mockMode: boolean;
  private app: admin.app.App | null = null;

  constructor(private readonly config: ConfigService) {
    this.mockMode = this.config.get<boolean>('fcm.mockMode', true);
    if (!this.mockMode) {
      try {
        this.app = admin.initializeApp({
          credential: admin.credential.cert({
            projectId: this.config.get<string>('fcm.projectId'),
            clientEmail: this.config.get<string>('fcm.clientEmail'),
            privateKey: (this.config.get<string>('fcm.privateKey') || '').replace(/\\n/g, '\n'),
          }),
        });
      } catch (err) {
        this.logger.error(`Failed to init Firebase admin, falling back to mock mode: ${(err as Error).message}`);
        this.app = null;
      }
    }
  }

  async send(params: { deviceToken?: string; title: string; body: string; data?: Record<string, string> }): Promise<FcmSendResult> {
    if (this.mockMode || !this.app) {
      this.logger.log(`[MOCK FCM] -> token=${params.deviceToken ?? '(none)'} :: ${params.title} - ${params.body}`);
      return { success: true, mocked: true };
    }

    if (!params.deviceToken) {
      return { success: false, mocked: false, error: 'no_device_token' };
    }

    try {
      await admin.messaging(this.app).send({
        token: params.deviceToken,
        notification: { title: params.title, body: params.body },
        data: params.data || {},
      });
      return { success: true, mocked: false };
    } catch (err) {
      this.logger.error(`FCM send failed: ${(err as Error).message}`);
      return { success: false, mocked: false, error: (err as Error).message };
    }
  }
}
