import { ENGLISH_GREETING, HINDI_GREETING, greetingReply } from './greeting';
import { AiConfidence, EscalationPriority } from '../../common/enums/escalation.enum';

describe('greetingReply', () => {
  it.each(['Hi', 'hello', 'HEY', '  Hi  ', 'Hello!!', 'hiii', 'Hey there', 'hello   doctor', 'Hi!'])(
    'answers "%s" with the English greeting',
    (message) => {
      expect(greetingReply(message)?.answer).toBe(ENGLISH_GREETING);
    },
  );

  it.each(['Namaste', 'namaste ji', '  NAMASTE  ', 'Namaste!', 'नमस्ते'])(
    'answers "%s" with the Hindi/Hinglish greeting',
    (message) => {
      expect(greetingReply(message)?.answer).toBe(HINDI_GREETING);
    },
  );

  it('returns the structured answer shape, supported and not escalated', () => {
    expect(greetingReply('Hi')).toEqual({
      answer: ENGLISH_GREETING,
      confidence: AiConfidence.SUPPORTED,
      needsHuman: false,
      priority: EscalationPriority.NORMAL,
      reason: 'greeting',
      sourceChunkIds: [],
    });
  });

  it.each([
    'Hi, can I walk after surgery?',
    'Hello my knee is swollen',
    'Namaste, dard bahut ho raha hai',
    'hey when can I shower',
    'high fever',
    'this',
    '',
    '   ',
    '!!!',
  ])('does not treat "%s" as a bare greeting', (message) => {
    expect(greetingReply(message)).toBeNull();
  });
});
