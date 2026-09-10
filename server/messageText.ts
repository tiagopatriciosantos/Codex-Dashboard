/** Display helpers only: never rewrite the original Codex session files. */
export function extractRawUserMessage(record: Record<string, unknown>): string | null {
  const p = record.payload;
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  const payload = p as Record<string, unknown>;
  return record.type === 'event_msg' && payload.type === 'user_message' && typeof payload.message === 'string'
    ? payload.message : null;
}
export function cleanDisplayText(value: string | null | undefined, maxLength = 1000): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, Math.max(0, maxLength)) || null : null;
}
export function cleanUserMessage(message: string, maxLength = 1000): string | null {
  let text = message.replace(/\r\n/g, '\n').trim();
  const marker = /##\s*My request for Codex:\s*/i.exec(text);
  if (marker) text = text.slice(marker.index + marker[0].length);
  const clean = cleanDisplayText(text, maxLength);
  if (clean && /^(the following is the codex agent (history|transcript)|continue the same review conversation)/i.test(clean)) return null;
  return clean;
}
