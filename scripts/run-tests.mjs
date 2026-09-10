import { readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
function tests(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory()
    ? tests(path.join(dir, e.name)) : /\.test\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []);
}
const root = mkdtempSync(path.join(tmpdir(), 'codex-dashboard-tests-'));
try {
  const files = [...tests('server'), ...tests('src')].sort();
  if (!files.length) throw new Error('No tests discovered');
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=1', ...files], {
    stdio: 'inherit', env: { ...process.env, CODEX_HOME: path.join(root, 'codex'), CODEX_DASHBOARD_DATA_DIR: path.join(root, 'data') }
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally { rmSync(root, { recursive: true, force: true }); }
