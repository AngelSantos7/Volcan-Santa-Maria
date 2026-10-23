// Real Auth requests, loopback only. Credentials stay in process memory.
// --observe records the pre-fix behavior; default mode enforces the requirements.
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { changeOwnPassword } from '../shared/password-change.ts';

const observe = process.argv.includes('--observe');
const url = new URL(process.env.SUPABASE_TEST_URL ?? 'http://127.0.0.1:54321');
const mail = new URL(process.env.SUPABASE_TEST_MAIL_URL ?? 'http://127.0.0.1:54324');
for (const endpoint of [url, mail]) {
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)) throw new Error('Loopback endpoints required');
}
const anon = process.env.SUPABASE_TEST_ANON_KEY;
const service = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
if (!anon || !service) throw new Error('Local Auth keys must be supplied through environment variables');
const created = new Set();
const clients = [];
const password = () => `Aa9!${randomBytes(18).toString('hex')}`;
const email = () => `p1-auth-${randomUUID()}@example.invalid`;
class LocalCheckError extends Error {}
function check(condition, label) {
  if (!condition) throw new LocalCheckError(label);
}
function client(key = anon) {
  const instance = createClient(url.href, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  clients.push(instance);
  return instance;
}
const admin = client(service);
async function request(path, body, { token = anon, method = 'POST' } = {}) {
  const response = await fetch(new URL(`/auth/v1/${path}`, url), {
    method, headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return { status: response.status, data };
}
function outcome(label, result, status, code) {
  const actualCode = result.data.error_code ?? result.data.code ?? 'ok';
  console.log(`${label}: HTTP ${result.status}, ${actualCode}`);
  if (!observe) check(result.status === status && (!code || actualCode === code), `${label}: unexpected Auth result`);
}
async function fixture() {
  const credentials = { email: email(), password: password() };
  const result = await admin.auth.admin.createUser({ ...credentials, email_confirm: true, user_metadata: { date_of_birth: '1990-01-01' } });
  check(!result.error && result.data.user, 'Synthetic account creation failed');
  created.add(result.data.user.id);
  return { ...credentials, id: result.data.user.id };
}
async function login(credentials) {
  const result = await request('token?grant_type=password', { email: credentials.email, password: credentials.password });
  check(result.status === 200 && result.data.access_token, 'Synthetic account login failed');
  return result.data;
}
async function mailSession(address, type) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const search = await fetch(new URL(`/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`, mail));
    const inbox = await search.json();
    for (const summary of inbox.messages ?? []) {
      const message = await (await fetch(new URL(`/api/v1/message/${summary.ID}`, mail))).json();
      const links = (message.HTML ?? '').match(/href="([^"]+)"/g) ?? [];
      for (const link of links) {
        const href = link.slice(6, -1).replaceAll('&amp;', '&');
        const verification = new URL(href);
        if (verification.origin !== url.origin || verification.pathname !== '/auth/v1/verify' || verification.searchParams.get('type') !== type) continue;
        const response = await fetch(verification, { redirect: 'manual' });
        check(response.status === 303 || response.status === 302, 'Email verification did not redirect');
        const redirect = new URL(response.headers.get('location'));
        const session = Object.fromEntries(new URLSearchParams(redirect.hash.slice(1)));
        check(session.access_token && session.refresh_token && !session.error, 'Email link did not establish a session');
        return session;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Expected local email not received');
}

try {
  for (const kind of ['missing', 'incorrect', 'correct']) {
    const account = await fixture();
    const session = await login(account);
    const next = password();
    const result = await request('user', {
      password: next,
      ...(kind === 'missing' ? {} : { current_password: kind === 'correct' ? account.password : password() }),
    }, { token: session.access_token, method: 'PUT' });
    outcome(`normal_change_${kind}`, result, kind === 'correct' ? 200 : 400,
      kind === 'missing' ? 'current_password_required' : kind === 'incorrect' ? 'current_password_invalid' : undefined);
    if (kind === 'correct') await login({ ...account, password: next });
  }
  for (const [label, candidate, valid] of [
    ['lowercase_only', 'volcan25', false], ['uppercase_only', 'VOLCAN25', false],
    ['no_digit', 'VolcanMaria', false], ['too_short', 'Aa9', false], ['compliant', password(), true],
  ]) {
    const address = email();
    const result = await request('signup', { email: address, password: candidate, data: { date_of_birth: '1990-01-01' } });
    if (result.data.id) created.add(result.data.id);
    if (result.data.user?.id) created.add(result.data.user.id);
    outcome(`signup_${label}`, result, valid ? 200 : 422, valid ? undefined : 'weak_password');
    if (valid && !observe) {
      await mailSession(address, 'signup');
      await login({ email: address, password: candidate });
      console.log('signup_email_confirmation_and_login: PASS');
    }
  }
  if (!observe) {
    const account = await fixture();
    outcome('recovery_request', await request('recover', { email: account.email }), 200);
    const recovery = await mailSession(account.email, 'recovery');
    const next = password();
    outcome('recovery_without_old_password', await request('user', { password: next }, { token: recovery.access_token, method: 'PUT' }), 200);
    const normal = await login({ ...account, password: next });
    outcome('normal_session_after_recovery', await request('user', { password: password() }, { token: normal.access_token, method: 'PUT' }), 400, 'current_password_required');

    const address = email();
    const invitation = await admin.auth.admin.inviteUserByEmail(address, { data: { first_name: 'Synthetic', last_name: 'Manager', staff_invitation: true } });
    check(!invitation.error && invitation.data.user, `Synthetic staff invitation failed (${invitation.error?.code ?? 'unknown'}, HTTP ${invitation.error?.status ?? 0})`);
    const id = invitation.data.user.id;
    created.add(id);
    check(!(await admin.from('user_roles').update({ role: 'visitor_manager' }).eq('user_id', id)).error, 'Synthetic staff role failed');
    check(!(await admin.from('staff_permissions').insert({ user_id: id, is_active: false, invitation_status: 'pending', can_view_visitors: true })).error, 'Synthetic staff permissions failed');
    const invited = await mailSession(address, 'invite');
    const staff = client();
    check(!(await staff.auth.setSession(invited)).error, 'Invitation session failed');
    const initial = password();
    const firstPassword = await staff.auth.updateUser({ password: initial });
    check(!firstPassword.error, `Invitation first password was rejected (${firstPassword.error?.code ?? 'unknown'})`);
    check((await staff.rpc('activate_my_staff_invitation')).data === true, 'Invitation activation failed');
    check((await staff.rpc('get_admin_session')).data?.role === 'visitor_manager', 'Activated manager cannot enter Admin');
    await login({ email: address, password: initial });
    console.log('staff_invitation_email_first_password_activation_login: PASS (no synthetic DOB)');

    // Execute the same helper used by PWA AuthProvider and Admin AccountPassword
    // with their respective installed SDKs, against the real local Auth backend.
    const adminSdk = await import('../admin-web/node_modules/@supabase/supabase-js/dist/index.mjs');
    for (const [label, factory] of [['PWA', createClient], ['Admin', adminSdk.createClient]]) {
      const testAccount = await fixture();
      if (label === 'Admin') check(!(await admin.from('user_roles').update({ role: 'admin' }).eq('user_id', testAccount.id)).error, 'Synthetic Admin role failed');
      const main = factory(url.href, anon, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      clients.push(main);
      check(!(await main.auth.signInWithPassword(testAccount)).error, `${label} login failed`);
      const changed = password();
      await changeOwnPassword(main, () => factory(url.href, anon, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }), testAccount.password, changed);
      await login({ ...testAccount, password: changed });
      console.log(`${label}_real_password_change_helper: PASS`);
    }
  }
} catch (error) {
  // Never dump SDK errors, request bodies, sessions, URLs or assertion values.
  console.error(`FAIL local Auth check: ${error instanceof LocalCheckError ? error.message : 'Auth request failed (details withheld)'}`);
  process.exitCode = 1;
} finally {
  for (const instance of clients) await instance.auth.dispose();
  let cleanupFailed = false;
  for (const id of created) {
    if ((await admin.auth.admin.deleteUser(id)).error) cleanupFailed = true;
  }
  console.log(cleanupFailed ? 'Synthetic cleanup: incomplete (no real accounts targeted)' : 'Synthetic cleanup: PASS');
  if (cleanupFailed) process.exitCode = 1;
}
