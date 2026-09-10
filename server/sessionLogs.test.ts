import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseSessionFile } from './sessionLogs.js';
test('repeated prompts in separate turns survive indexing and open turns stay open', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rollout-test-'));
  const file=path.join(dir,'session.jsonl');
  const lines = [
    {type:'session_meta',timestamp:1000,payload:{id:'test-thread',model:'gpt-6-astra'}},
    {type:'event_msg',timestamp:1001,payload:{type:'task_started',turn_id:'a'}},
    {type:'event_msg',timestamp:1002,payload:{type:'user_message',message:'continue'}},
    {type:'event_msg',timestamp:1003,payload:{type:'task_complete'}},
    {type:'event_msg',timestamp:1004,payload:{type:'task_started',turn_id:'b'}},
    {type:'event_msg',timestamp:1005,payload:{type:'user_message',message:'continue'}}
  ];
  fs.writeFileSync(file,lines.map(v=>JSON.stringify(v)).join('\n'));
  try { const parsed=await parseSessionFile(file); assert.equal(parsed?.prompts.length,2); assert.equal(parsed?.prompts[1].completedAt,null); }
  finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
