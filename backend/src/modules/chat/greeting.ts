import { AiConfidence, EscalationPriority } from '../../common/enums/escalation.enum';
import { StructuredAiAnswer } from '../ai/interfaces/ai-response.interface';

export const ENGLISH_GREETING =
  "Hi! I'm Dr. Shekhar Srivastav's Assistant. Hope you're feeling well. How can I help you today?";

export const HINDI_GREETING =
  'Namaste! Main Dr. Shekhar Srivastav ka Assistant hoon. Aasha hai aap achha mehsoos kar rahe hain. Bataiye, main aapki kya madad kar sakta hoon?';

// Elongations ("hiii", "heyyy") are common in chat, so each word allows a repeated tail.
const ENGLISH_GREETING_WORD = /^(hi+|hello+|hey+|helo+)$/;
const HINDI_GREETING_WORD = /^(namaste+|namaskar|namaskaar|नमस्ते|नमस्कार)$/;
// Polite fillers that may accompany a greeting without making it a question.
const FILLER_WORD = /^(there|ji|sir|madam|maam|doctor|dr|doc|everyone|all)$/;

/**
 * A canned reply for a message that is *only* a greeting ("Hi", " HELLO!! ",
 * "Namaste ji"), in the same structured shape the model returns. Anything with
 * more content - "Hi, can I walk after surgery?" - returns null so it goes
 * through the normal retrieval + safety pipeline untouched.
 */
export function greetingReply(message: string): StructuredAiAnswer | null {
  const words = message
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return null;

  let english = false;
  let hindi = false;
  for (const word of words) {
    if (ENGLISH_GREETING_WORD.test(word)) english = true;
    else if (HINDI_GREETING_WORD.test(word)) hindi = true;
    else if (!FILLER_WORD.test(word)) return null;
  }
  if (!english && !hindi) return null;

  return {
    answer: hindi ? HINDI_GREETING : ENGLISH_GREETING,
    confidence: AiConfidence.SUPPORTED,
    needsHuman: false,
    priority: EscalationPriority.NORMAL,
    reason: 'greeting',
    sourceChunkIds: [],
  };
}
