import { ChatSession } from './entities/chat-session.entity';
import { ChatMessage } from './entities/chat-message.entity';

const PREVIEW_MAX = 80;

export interface ChatSessionListItem {
  id: string;
  createdAt: string;
  lastMessagePreview: string | null;
}

export function toChatSessionListItem(
  session: ChatSession,
  lastMessage?: ChatMessage | null,
): ChatSessionListItem {
  const text = lastMessage?.message?.trim() || null;
  return {
    id: session.id,
    createdAt: session.createdAt.toISOString(),
    lastMessagePreview:
      text && text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX - 1)}…` : text,
  };
}
