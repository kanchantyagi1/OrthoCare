import { ConfigService } from '@nestjs/config';
import { FcmProviderService } from './fcm-provider.service';

function mockConfig(overrides: Record<string, any> = {}) {
  const values: Record<string, any> = { 'fcm.mockMode': true, ...overrides };
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('FcmProviderService', () => {
  it('mock mode: never throws and reports success without a real push', async () => {
    const fcm = new FcmProviderService(mockConfig());
    const result = await fcm.send({ deviceToken: 'tok', title: 'Hi', body: 'There' });
    expect(result.success).toBe(true);
    expect(result.mocked).toBe(true);
  });

  it('mock mode: still succeeds even with no device token (never crashes the escalation flow)', async () => {
    const fcm = new FcmProviderService(mockConfig());
    const result = await fcm.send({ title: 'Hi', body: 'There' });
    expect(result.success).toBe(true);
  });
});
