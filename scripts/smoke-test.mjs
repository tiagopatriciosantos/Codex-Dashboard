import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const temp = mkdtempSync(path.join(tmpdir(), 'codex-dashboard-smoke-'));
const port = 18787;
const child = spawn(process.execPath, ['dist-server/index.js'], { env: { ...process.env, DEMO_MODE: 'true', PORT: String(port), CODEX_HOME: path.join(temp, 'codex'), CODEX_DASHBOARD_DATA_DIR: path.join(temp, 'data') }, stdio: ['ignore','pipe','pipe'] });
let output = '';
child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; });
const exited = new Promise(resolve => child.once('exit', resolve));
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try { const res = await fetch(`http://127.0.0.1:${port}/api/health`); if (res.ok) { ready = true; break; } } catch {}
    if (child.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, output);
  const url = `http://127.0.0.1:${port}`;
  const overview = await (await fetch(`${url}/api/overview`)).json();
  assert.ok(overview.histories.sevenDay.length > 1);
  writeFileSync('demo-overview.json', JSON.stringify(overview));
  const html = await (await fetch(url)).text();
  assert.match(html, /<div id="root">/);
  for (const asset of html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)) assert.equal((await fetch(url + asset[1])).status, 200);
  assert.equal((await fetch(`${url}/api/refresh`, { method: 'POST', headers: { Origin: 'https://untrusted.example' } })).status, 403);
  assert.equal((await fetch(`${url}/api/overview`, { headers: { Host: 'rebinding.example' } })).status, 403);
  assert.equal((await fetch(`${url}/api/refresh`, { method: 'POST', headers: { Origin: url } })).status, 200);
  console.log('Demo smoke passed: health, overview, assets, same-origin refresh, CSRF/rebinding rejection.');
} finally { child.kill(); await exited; rmSync(temp, { recursive:true, force:true }); }
