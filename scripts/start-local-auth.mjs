// Reproducible local Auth startup. An optional local port base comes from the
// process environment; machine-specific ports never enter the tracked config.
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const root = new URL('../', import.meta.url);
const config = new URL('supabase/config.toml', root);
const original = await readFile(config, 'utf8');
if (!original.includes('project_id = "volcan-santa-maria-pwa"')) throw new Error('Unexpected local project');
const portBase = process.env.SUPABASE_LOCAL_PORT_BASE ? Number(process.env.SUPABASE_LOCAL_PORT_BASE) : null;
if (portBase !== null && (!Number.isInteger(portBase) || portBase < 1100 || portBase > 65400 || portBase % 100 !== 0)) throw new Error('Invalid local port base');
function run(command) {
  return new Promise((resolve, reject) => {
    const child = process.platform === 'win32'
      ? spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', command], { cwd: root, windowsHide: true, stdio: 'ignore' })
      : spawn('/bin/sh', ['-c', command], { cwd: root, stdio: 'ignore' });
    child.on('error', () => reject(new Error('Local Auth startup command failed')));
    child.on('exit', code => code === 0 ? resolve() : reject(new Error('Local Auth startup failed; raw output withheld to protect credentials')));
  });
}
try {
  const local = portBase === null ? original : original.replace(/^(\s*(?:port|shadow_port)\s*=\s*)543(\d{2})\s*$/gm, (_, prefix, suffix) => `${prefix}${portBase + Number(suffix)}`);
  await writeFile(config, local);
  await run('npx --no-install supabase stop');
  console.log('Local Supabase stopped with data volumes preserved');
  await run('npx --no-install supabase start');
  await import('./configure-local-auth.mjs');
} finally {
  await writeFile(config, original);
}
