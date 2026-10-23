import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const cases = JSON.parse(readFileSync(new URL('./fixtures/push-endpoints.json', import.meta.url), 'utf8'));
cases.push(['oversized', `https://fcm.googleapis.com/wp/${'a'.repeat(2048)}`, false]);
const notificationId = 'fa660000-0000-4000-8000-000000000001';
const original = process.argv.includes('--baseline');

function harness({ endpoint = cases[0][1], allowed = true, status = 201, lookupError = false, webPushEnabled = 'true' } = {}) {
  const calls = { transport: [], generated: 0, oldTransport: 0, deletes: [], filters: [] };
  let handler;
  const caller = { rpc: async (name, args) => {
    assert.equal(name, 'has_staff_permission'); assert.equal(args.permission_name, 'can_manage_notifications');
    return { data: allowed, error: null };
  } };
  const admin = { from(table) {
    const chain = {
      select() { return chain; },
      eq(key, value) { calls.filters.push([table, key, value]); return chain; },
      single: async () => ({ data: { id: notificationId, title_es: 'Title', body_es: 'Body', priority: 'info', destination_url: '/', status: 'published' }, error: null }),
      in: async () => ({ data: [{ id: 'synthetic-subscription', endpoint, p256dh: 'synthetic-key', auth: 'synthetic-auth' }], error: lookupError ? new Error('sensitive internal details') : null }),
      delete() { calls.deletes.push(table); return chain; },
      then(resolve, reject) { return Promise.resolve({ data: table === 'notification_recipients' ? [{ user_id: 'synthetic-recipient' }] : [{ id: 'synthetic-subscription' }], error: null }).then(resolve, reject); },
    };
    return chain;
  } };
  const webpush = {
    setVapidDetails() {},
    sendNotification: async () => { calls.oldTransport++; },
    generateRequestDetails: (subscription, payload, options) => {
      calls.generated++; assert.equal(options.TTL, 3600);
      const message = JSON.parse(payload); assert.equal(message.title, 'Title'); assert.equal(message.body, 'Body');
      return { endpoint: subscription.endpoint, method: 'POST', headers: { TTL: 3600 }, body: new Uint8Array([1, 2, 3]) };
    },
  };
  const transport = async (url, options) => {
    calls.transport.push({ url, options });
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit');
    return new Response(null, { status, headers: status >= 300 && status < 400 ? { Location: 'http://127.0.0.1/private' } : {} });
  };
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename);
    const source = original && filename.endsWith(`${process.platform === 'win32' ? '\\' : '/'}send-push-notification${process.platform === 'win32' ? '\\' : '/'}index.ts`)
      ? execFileSync('git', ['show', 'd91d6c2:supabase/functions/send-push-notification/index.ts'], { cwd: root, encoding: 'utf8' })
      : readFileSync(filename, 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023, esModuleInterop: true } }).outputText;
    const exports = {};
    vm.runInNewContext(compiled, { exports, URL, Request, Response, Uint8Array, AbortSignal, fetch: transport,
      require(specifier) {
        if (specifier.startsWith('.')) return load(resolve(dirname(filename), specifier));
        if (specifier === 'npm:web-push@3.6.7') return webpush;
        if (specifier.startsWith('npm:@supabase/supabase-js@')) return { createClient: (_, key) => key === 'synthetic-service' ? admin : caller };
        throw new Error('Unexpected module: network is forbidden in this test');
      },
      Deno: { env: { get: key => key === 'WEB_PUSH_ENABLED' ? webPushEnabled : key === 'SUPABASE_SERVICE_ROLE_KEY' ? 'synthetic-service' : 'synthetic-config' }, serve(value) { handler = value; } },
    });
    cache.set(filename, exports); return exports;
  }
  const policy = load(resolve(root, 'supabase/functions/_shared/push-endpoint.ts'));
  load(resolve(root, 'supabase/functions/send-push-notification/index.ts'));
  return { calls, policy, invoke: (body = { notification_id: notificationId }, method = 'POST') => handler(new Request('http://localhost/mock-only', { method, headers: { 'Content-Type': 'application/json' }, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) })) };
}

if (original) {
  test('original SEC-006 forwards loopback to an intercepted transport, no network', async () => {
    const server = harness({ endpoint: 'https://127.0.0.1:65500/sec-canary' });
    assert.equal((await server.invoke()).status, 200);
    assert.equal(server.calls.oldTransport, 1);
    assert.equal(server.calls.transport.length, 0);
  });
} else {
  test('disabled backend rejects delivery before database or transport access', async () => {
    const server = harness({ webPushEnabled: null });
    const response = await server.invoke();
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'Web Push is disabled');
    assert.equal(server.calls.filters.length, 0);
    assert.equal(server.calls.generated, 0);
    assert.equal(server.calls.transport.length, 0);
  });
  for (const [label, endpoint, expected] of cases) test(`endpoint policy and Edge transport: ${label}`, async () => {
    const server = harness({ endpoint });
    assert.equal(server.policy.isAllowedPushEndpoint(endpoint), expected);
    const response = await server.invoke();
    assert.equal(response.status, 200);
    assert.equal((await response.json()).sent, expected ? 1 : 0);
    assert.equal(server.calls.generated, expected ? 1 : 0);
    assert.equal(server.calls.transport.length, expected ? 1 : 0);
    assert.equal(server.calls.oldTransport, 0);
    assert.ok(server.calls.filters.some(([table, key, value]) => table === 'notifications' && key === 'status' && value === 'published'));
  });
  for (const status of [301, 302, 303, 307, 308]) test(`redirect ${status} to internal URL is never followed`, async () => {
    const server = harness({ status });
    assert.equal((await (await server.invoke()).json()).sent, 0);
    assert.equal(server.calls.transport.length, 1);
    assert.equal(server.calls.transport[0].url, cases[0][1]);
    assert.equal(server.calls.deletes.length, 0);
  });
  for (const status of [404, 410]) test(`expired subscription ${status} removal preserves concurrent renewal`, async () => {
    const server = harness({ status });
    const body = await (await server.invoke()).json();
    assert.equal(body.sent, 0); assert.equal(body.expired_subscriptions_removed, 1);
    assert.equal(server.calls.deletes.length, 1);
    for (const key of ['id', 'endpoint', 'p256dh', 'auth']) assert.ok(server.calls.filters.some(([table, column]) => table === 'push_subscriptions' && column === key));
  });
  test('unauthorized caller never accesses transport', async () => {
    const server = harness({ allowed: false });
    assert.equal((await server.invoke()).status, 403);
    assert.equal(server.calls.generated, 0); assert.equal(server.calls.transport.length, 0);
  });
  test('method and parameter validation', async () => {
    const server = harness();
    assert.equal((await server.invoke({}, 'GET')).status, 405);
    for (const notification_id of [null, {}, 5, 'invalid']) assert.equal((await server.invoke({ notification_id })).status, 400);
    assert.equal(server.calls.generated, 0);
  });
  test('lookup errors fail closed without leaking error details', async () => {
    const server = harness({ lookupError: true });
    const response = await server.invoke(); assert.equal(response.status, 500);
    assert.equal((await response.json()).error, 'Push failed');
    assert.equal(server.calls.transport.length, 0);
  });
}
