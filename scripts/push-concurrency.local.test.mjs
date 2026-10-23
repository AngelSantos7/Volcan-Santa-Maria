// Two local PostgreSQL connections only. No HTTP, DNS or Web Push transport.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAllowedPushEndpoint } from '../supabase/functions/_shared/push-endpoint.ts';

const container = 'supabase_db_volcan-santa-maria-pwa';
const socket = execFileSync('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], { encoding: 'utf8' }).trim();
assert.ok(/^(npipe|unix):\/\//u.test(socket) && !/^tcp:/u.test(process.env.DOCKER_HOST ?? ''), 'Local Docker only');
const args = ['exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
const quote = value => value === null ? 'null' : `'${String(value).replaceAll("'", "''")}'`;
const sql = input => execFileSync('docker', args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const actorA = randomUUID(); const actorB = randomUUID();
const workers = [];
function worker() {
  const child = spawn('docker', args, { windowsHide: true, stdio: 'pipe' });
  workers.push(child);
  let output = ''; let error = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { error += data; });
  const finished = new Promise((resolve, reject) => {
    child.on('error', reject); child.on('close', code => resolve({ code, output, error }));
  });
  return { child, finished, output: () => output };
}
const pause = () => new Promise(resolve => setTimeout(resolve, 75));
async function until(condition) {
  for (let count = 0; count < 100; count++) { if (await condition()) return; await pause(); }
  throw new Error('Local synchronization timed out');
}
function transaction(actor, endpoint, key, application) {
  return `begin; set local statement_timeout='15s'; set local application_name=${quote(application)};
    select set_config('request.jwt.claims',${quote(JSON.stringify({ sub: actor, role: 'authenticated' }))},true);
    set local role authenticated;
    select public.register_push_subscription(${quote(endpoint)},${quote(key)},${quote(key)});\n`;
}
try {
  const cases = JSON.parse(readFileSync(new URL('./fixtures/push-endpoints.json', import.meta.url), 'utf8'));
  cases.push(['oversized', `https://fcm.googleapis.com/wp/${'a'.repeat(2048)}`, false]);
  const result = sql(`select public.is_allowed_push_endpoint(value) from (values ${cases.map(([, value], i) => `(${i},${quote(value)}::text)`).join(',')}) as inputs(position,value) order by position;`).split(/\r?\n/u);
  cases.forEach(([label, value, expected], i) => {
    assert.equal(isAllowedPushEndpoint(value), expected, `TypeScript policy: ${label}`);
    assert.equal(result[i], expected ? 't' : 'f', `PostgreSQL parity: ${label}`);
  });
  console.log(`SQL/TypeScript endpoint parity: ${cases.length} PASS`);
  sql(`insert into auth.users(id,email,raw_user_meta_data) values
    (${quote(actorA)},${quote(`${actorA}@example.invalid`)},'{"date_of_birth":"1990-01-01"}'),
    (${quote(actorB)},${quote(`${actorB}@example.invalid`)},'{"date_of_birth":"1990-01-01"}');`);
  for (const [label, firstActor, secondActor, expectConflict] of [
    ['A wins against B', actorA, actorB, true],
    ['B wins against A', actorB, actorA, true],
    ['same-owner concurrent renewal', actorA, actorA, false],
  ]) {
    const endpoint = `https://fcm.googleapis.com/fcm/send/synthetic-${randomUUID()}`;
    const application = `push-regression-${randomUUID()}`;
    const first = worker();
    first.child.stdin.write(`${transaction(firstActor, endpoint, 'first-synthetic-key', `${application}-first`)}select 'READY';\n`);
    await until(() => first.output().includes('READY'));
    const second = worker();
    second.child.stdin.end(`${transaction(secondActor, endpoint, 'second-synthetic-key', application)}commit;\n`);
    // Prove an actual lock conflict before releasing the first transaction.
    await until(() => sql(`select exists(select 1 from pg_stat_activity where application_name=${quote(application)} and wait_event_type='Lock');`) === 't');
    first.child.stdin.end('commit;\n');
    const [one, two] = await Promise.all([first.finished, second.finished]);
    assert.equal(one.code, 0, 'First transaction failed');
    assert.equal(two.code === 0, !expectConflict, 'Unexpected concurrent outcome');
    if (expectConflict) assert.ok(two.error.includes('Unable to register push subscription.'), 'Collision must fail with generic error');
    const state = sql(`select user_id::text||'|'||p256dh||'|'||auth from public.push_subscriptions where endpoint=${quote(endpoint)};`);
    const winningKey = expectConflict ? 'first-synthetic-key' : 'second-synthetic-key';
    assert.equal(state, `${firstActor}|${winningKey}|${winningKey}`, 'Owner or keys changed unexpectedly');
    console.log(`Concurrent ${label}: PASS (database lock observed)`);
  }
} catch {
  console.error('Local push concurrency/parity check FAILED (details withheld)');
  process.exitCode = 1;
} finally {
  // Kill only workers created here; session closure rolls back unfinished work.
  for (const child of workers) if (child.exitCode === null) child.kill();
  try { sql(`delete from auth.users where id in (${quote(actorA)},${quote(actorB)});`); }
  catch { console.error('Synthetic cleanup failed'); process.exitCode = 1; }
}
