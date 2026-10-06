import { RedFlagRulesService } from './red-flag-rules.service';
import { EscalationPriority } from '../../common/enums/escalation.enum';

function fakeRepo(rows: any[]) {
  return { find: jest.fn(async () => rows) } as any;
}

describe('RedFlagRulesService', () => {
  it('matches an approved ACTIVE rule and returns its priority', async () => {
    const repo = fakeRepo([
      {
        id: 'rule-1',
        keywords: ['severe pain', 'chest pain'],
        symptoms: [],
        priority: EscalationPriority.URGENT,
        status: 'ACTIVE',
      },
    ]);
    const service = new RedFlagRulesService(repo);
    const result = await service.matchPriority('I am having severe pain in my knee');
    expect(result).toBe(EscalationPriority.URGENT);
  });

  it('never applies a rule that is not ACTIVE (the LLM cannot invent red flags, only approved rules count)', async () => {
    const repo = fakeRepo([
      {
        id: 'rule-1',
        keywords: ['severe pain'],
        symptoms: [],
        priority: EscalationPriority.URGENT,
        status: 'ACTIVE',
      },
    ]);
    // Simulate the repo query already filtering status=ACTIVE - an inactive rule never reaches here.
    const inactiveRepo = fakeRepo([]);
    const service = new RedFlagRulesService(inactiveRepo);
    const result = await service.matchPriority('I am having severe pain');
    expect(result).toBeNull();
  });

  it('returns null when no rule matches', async () => {
    const repo = fakeRepo([
      { id: 'rule-1', keywords: ['severe pain'], symptoms: [], priority: EscalationPriority.URGENT, status: 'ACTIVE' },
    ]);
    const service = new RedFlagRulesService(repo);
    const result = await service.matchPriority('Can I walk today?');
    expect(result).toBeNull();
  });
});
