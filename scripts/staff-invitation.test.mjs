import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../supabase/functions/invite-staff/index.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } }).outputText;

function backend({
  role = 'admin', status = 'pending', revoked = null, available = true,
  recoverableUserId = null, finalizeFailures = 0, resendAuditFailures = 0,
  authInviteFailures = 0,
} = {}) {
  const events = [];
  const state = { recoverableUserId, finalized: false };
  let handler;
  const caller = {
    async rpc(name, input) {
      events.push({ operation: 'caller_rpc', name, input });
      if (name === 'get_admin_session') return { data: { user_id: 'admin-id', role }, error: null };
      if (name === 'admin_find_recoverable_staff_invitation')
        return { data: state.recoverableUserId, error: null };
      if (name === 'admin_finalize_staff_invitation') {
        state.recoverableUserId = input.p_user_id;
        if (finalizeFailures > 0) {
          finalizeFailures -= 1;
          return { data: null, error: new Error('synthetic audit failure') };
        }
        const alreadyFinalized = state.finalized;
        state.finalized = true;
        return { data: { user_id: input.p_user_id, already_finalized: alreadyFinalized }, error: null };
      }
      if (name === 'admin_record_staff_invitation_resend_request') {
        if (resendAuditFailures > 0) {
          resendAuditFailures -= 1;
          return { data: null, error: new Error('synthetic audit failure') };
        }
        return { data: 101, error: null };
      }
      if (name === 'cancel_pending_staff_invitation')
        return { data: null, error: status === 'pending' ? null : new Error('Only pending invitations can be removed') };
      throw new Error(`Unexpected caller RPC: ${name}`);
    },
  };
  const admin = {
    rpc: async (name) => {
      events.push({ operation: 'admin_rpc', name });
      return { data: available, error: null };
    },
    from(table) {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        single: async () => ({ data: { invitation_status: status, invitation_revoked_at: revoked }, error: null }),
        insert: async () => { throw new Error(`Unexpected direct insert into ${table}`); },
        update() { throw new Error(`Unexpected direct update of ${table}`); },
      };
      return chain;
    },
    auth: { admin: {
      getUserById: async () => ({ data: { user: { id: 'staff-id', email: 'staff@example.com' } }, error: null }),
      inviteUserByEmail: async (email, options) => {
        events.push({ operation: 'invite', email, options });
        if (authInviteFailures > 0) {
          authInviteFailures -= 1;
          return { data: { user: null }, error: new Error('synthetic Auth failure') };
        }
        state.recoverableUserId = 'staff-id';
        return { data: { user: { id: 'staff-id' } }, error: null };
      },
      deleteUser: async () => { throw new Error('Auth identities must never be deleted'); },
    } },
  };
  vm.runInNewContext(compiled, {
    exports: {}, Request, Response,
    require: () => ({ createClient: (_url, key) => key === 'server-test-key' ? admin : caller }),
    Deno: { env: { get: (key) => key === 'SUPABASE_SERVICE_ROLE_KEY' ? 'server-test-key' : 'local-test-value' }, serve: (value) => { handler = value; } },
  });
  return {
    events,
    state,
    call: (body) => handler(new Request('http://localhost/invite-staff', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })),
  };
}

const invitation = {
  action: 'invite', firstName: 'Ana María', lastName: 'López Pérez',
  email: 'staff@example.com', phone: '+50255550000',
  permissions: { can_manage_visits: true },
};

test('non-administrator cannot invite, resend or remove staff', async () => {
  for (const action of ['invite', 'resend', 'delete']) {
    const server = backend({ role: 'visitor_manager' });
    assert.equal((await server.call({ action, email: 'staff@example.com' })).status, 403);
    assert.equal(server.events.some((event) => event.operation === 'invite'), false);
  }
});

test('invitation sends only administrative metadata and finalizes through the audited RPC', async () => {
  const server = backend();
  const response = await server.call(invitation);
  assert.equal(response.status, 200);
  const sent = server.events.find((event) => event.operation === 'invite');
  assert.equal(sent.options.data.first_name, 'Ana María');
  assert.equal(sent.options.data.last_name, 'López Pérez');
  assert.equal('password' in sent.options, false);
  assert.equal('date_of_birth' in sent.options.data, false);
  const finalized = server.events.find((event) => event.name === 'admin_finalize_staff_invitation');
  assert.equal(finalized.input.p_phone, '+50255550000');
  assert.equal(finalized.input.p_permissions.can_manage_visits, true);
  assert.equal(finalized.input.p_permissions.can_view_visitors, false);
  assert.equal(server.events.some((event) => event.table === 'audit_logs'), false);
});

test('existing non-recoverable identities are never converted or overwritten', async () => {
  const server = backend({ available: false });
  assert.equal((await server.call(invitation)).status, 500);
  assert.equal(server.events.some((event) => event.operation === 'invite'), false);
  assert.equal(server.events.some((event) => event.name === 'admin_finalize_staff_invitation'), false);
});

test('audit failure returns retryable error and retry does not send a duplicate invitation', async () => {
  const server = backend({ finalizeFailures: 1 });
  const first = await server.call(invitation);
  assert.equal(first.status, 500);
  assert.equal((await first.json()).retryable, true);
  assert.equal(server.events.filter((event) => event.operation === 'invite').length, 1);
  const retry = await server.call(invitation);
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).recovered, true);
  assert.equal(server.events.filter((event) => event.operation === 'invite').length, 1);
  assert.equal(server.events.filter((event) => event.name === 'admin_finalize_staff_invitation').length, 2);
});

test('retry after a lost success response is idempotent and sends no email', async () => {
  const server = backend({ recoverableUserId: 'staff-id' });
  server.state.finalized = true;
  const response = await server.call(invitation);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).recovered, true);
  assert.equal(server.events.some((event) => event.operation === 'invite'), false);
});

test('resend records its audit request before invoking Auth', async () => {
  const server = backend();
  assert.equal((await server.call({ action: 'resend', userId: 'staff-id', email: 'staff@example.com' })).status, 200);
  const auditIndex = server.events.findIndex((event) => event.name === 'admin_record_staff_invitation_resend_request');
  const sendIndex = server.events.findIndex((event) => event.operation === 'invite');
  assert.ok(auditIndex >= 0 && sendIndex > auditIndex);
});

test('resend audit failure sends no email and a retry sends exactly one', async () => {
  const server = backend({ resendAuditFailures: 1 });
  const first = await server.call({ action: 'resend', userId: 'staff-id', email: 'staff@example.com' });
  assert.equal(first.status, 500);
  assert.match((await first.json()).error, /No se envió otro correo/);
  assert.equal(server.events.some((event) => event.operation === 'invite'), false);
  assert.equal((await server.call({ action: 'resend', userId: 'staff-id', email: 'staff@example.com' })).status, 200);
  assert.equal(server.events.filter((event) => event.operation === 'invite').length, 1);
});

test('Auth resend failure is reported after the request was audited', async () => {
  const server = backend({ authInviteFailures: 1 });
  assert.equal((await server.call({ action: 'resend', userId: 'staff-id', email: 'staff@example.com' })).status, 500);
  assert.equal(server.events.some((event) => event.name === 'admin_record_staff_invitation_resend_request'), true);
});

test('resend works only for pending, unrevoked invitations and the original email', async () => {
  for (const options of [{ status: 'active' }, { revoked: '2026-10-22' }, {}]) {
    const server = backend(options);
    const email = Object.keys(options).length ? 'staff@example.com' : 'wrong@example.com';
    assert.equal((await server.call({ action: 'resend', userId: 'staff-id', email })).status, 500);
    assert.equal(server.events.some((event) => event.operation === 'invite'), false);
    assert.equal(server.events.some((event) => event.name === 'admin_record_staff_invitation_resend_request'), false);
  }
});

test('removing pending invitation delegates to protected cancellation without Auth deletion', async () => {
  const server = backend();
  assert.equal((await server.call({ action: 'delete', userId: 'staff-id' })).status, 200);
  assert.equal(server.events.some((event) => event.name === 'cancel_pending_staff_invitation'), true);
  const active = backend({ status: 'active' });
  assert.equal((await active.call({ action: 'delete', userId: 'staff-id' })).status, 500);
});

test('invitation rejects missing names and invalid Guatemala phone before Auth', async () => {
  for (const input of [{ firstName: '' }, { lastName: '' }, { phone: '+15125551234' }, { phone: '+5025551234' }, { phone: '+50212345678' }]) {
    const server = backend();
    const response = await server.call({ ...invitation, ...input });
    assert.equal(response.status, 500);
    assert.equal(server.events.some((event) => event.operation === 'invite'), false);
  }
});

test('source contains no direct audit insert or personal data audit payload', () => {
  assert.equal(source.includes("from('audit_logs').insert"), false);
  assert.equal(source.includes('metadata: { email'), false);
  assert.equal(source.includes('full_name: fullName'), false);
});
