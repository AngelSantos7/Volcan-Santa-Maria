import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../supabase/functions/invite-staff/index.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } }).outputText;

function backend({ role = 'admin', status = 'pending', revoked = null, available = true } = {}) {
  const events = [];
  let handler;
  const caller = { rpc: async (name, input) => {
    events.push({ name, input });
    if (name === 'get_admin_session') return { data: { user_id: 'admin-id', role }, error: null };
    return { data: null, error: status === 'pending' ? null : new Error('Only pending invitations can be removed') };
  } };
  const admin = {
    rpc: async () => ({ data: available, error: null }),
    from(table) {
      const chain = {
        select() { return chain; }, eq() { return chain; },
        single: async () => ({ data: { invitation_status: status, invitation_revoked_at: revoked }, error: null }),
        insert: async (values) => { events.push({ table, operation: 'insert', values }); return { error: null }; },
        update(values) { events.push({ table, operation: 'update', values }); return { eq: async () => ({ error: null }) }; },
      };
      return chain;
    },
    auth: { admin: {
      getUserById: async () => ({ data: { user: { id: 'staff-id', email: 'staff@example.com' } }, error: null }),
      inviteUserByEmail: async (email, options) => { events.push({ operation: 'invite', email, options }); return { data: { user: { id: 'staff-id' } }, error: null }; },
      deleteUser: async () => { throw new Error('Auth identities must never be deleted'); },
    } },
  };
  vm.runInNewContext(compiled, {
    exports: {}, Request, Response,
    require: () => ({ createClient: (_url, key) => key === 'server-test-key' ? admin : caller }),
    Deno: { env: { get: (key) => key === 'SUPABASE_SERVICE_ROLE_KEY' ? 'server-test-key' : 'local-test-value' }, serve: (value) => { handler = value; } },
  });
  return { events, call: (body) => handler(new Request('http://localhost/invite-staff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })) };
}

test('non-administrator cannot invite, resend or remove staff', async () => {
  for (const action of ['invite', 'resend', 'delete']) {
    const server = backend({ role: 'visitor_manager' });
    assert.equal((await server.call({ action, email: 'staff@example.com' })).status, 403);
    assert.equal(server.events.some((event) => event.operation === 'invite'), false);
  }
});
test('invitation asks only administrative data and creates pending permissions', async () => {
  const server = backend();
  assert.equal((await server.call({ action: 'invite', firstName: 'Ana María', lastName: 'López Pérez', email: 'staff@example.com', phone: '+50255550000', permissions: { can_manage_visits: true } })).status, 200);
  const invitation = server.events.find((event) => event.operation === 'invite');
  assert.equal(invitation.options.data.first_name, 'Ana María');
  assert.equal(invitation.options.data.last_name, 'López Pérez');
  assert.equal('password' in invitation.options, false);
  assert.equal('date_of_birth' in invitation.options.data, false);
  const permissions = server.events.find((event) => event.table === 'staff_permissions');
  assert.equal(permissions.values.invitation_status, 'pending');
  assert.equal(permissions.values.is_active, false);
  assert.equal(permissions.values.can_manage_visits, true);
  assert.equal(server.events.find((event) => event.table === 'profiles').values.phone, '+50255550000');
});
test('existing identities are never converted or overwritten by an invitation', async () => {
  const server = backend({ available: false });
  assert.equal((await server.call({ action: 'invite', firstName: 'Ana María', lastName: 'López Pérez', email: 'staff@example.com', phone: '+50255550000' })).status, 500);
  assert.equal(server.events.some((event) => event.operation === 'invite'), false);
});
test('resend works only for pending, unrevoked invitations and the original email', async () => {
  const pending = backend();
  assert.equal((await pending.call({ action: 'resend', userId: 'staff-id', email: 'staff@example.com' })).status, 200);
  assert.equal(pending.events.filter((event) => event.operation === 'invite').length, 1);
  for (const options of [{ status: 'active' }, { revoked: '2026-10-22' }, {}]) {
    const server = backend(options);
    assert.equal((await server.call({ action: 'resend', userId: 'staff-id', email: Object.keys(options).length ? 'staff@example.com' : 'wrong@example.com' })).status, 500);
    assert.equal(server.events.some((event) => event.operation === 'invite'), false);
  }
});
test('removing pending invitation delegates to protected cancellation without Auth deletion', async () => {
  const server = backend();
  assert.equal((await server.call({ action: 'delete', userId: 'staff-id' })).status, 200);
  assert.equal(server.events.some((event) => event.name === 'cancel_pending_staff_invitation'), true);
  const active = backend({ status: 'active' });
  assert.equal((await active.call({ action: 'delete', userId: 'staff-id' })).status, 500);
});


test('invitation rejects missing names and invalid Guatemala phone before sending email', async () => {
  for (const input of [{ firstName: '' }, { lastName: '' }, { phone: '+15125551234' }, { phone: '+5025551234' }, { phone: '+50212345678' }]) {
    const server = backend();
    const response = await server.call({ action: 'invite', firstName: 'Ana', lastName: 'López', email: 'staff@example.com', phone: '+50255551234', ...input });
    assert.equal(response.status, 500);
    assert.equal(server.events.some((event) => event.operation === 'invite'), false);
  }
});
