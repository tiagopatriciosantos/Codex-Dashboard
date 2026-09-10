import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanDisplayText, cleanUserMessage, extractRawUserMessage } from './messageText.js';
test('message text preserves Unicode and extracts IDE request without background context', () => {
  assert.equal(cleanUserMessage('Context\n## My request for Codex:\nCorrigir ação\n agora'), 'Corrigir ação agora');
  assert.equal(cleanUserMessage('The following is the codex agent transcript ...'), null);
  assert.equal(cleanDisplayText(null), null);
  assert.equal(cleanDisplayText(' a  b ', 2), 'a ');
  assert.equal(extractRawUserMessage({ type:'event_msg', payload:{type:'user_message',message:'teste'} }), 'teste');
  assert.equal(extractRawUserMessage({ type:'event_msg', payload:[] }), null);
});
