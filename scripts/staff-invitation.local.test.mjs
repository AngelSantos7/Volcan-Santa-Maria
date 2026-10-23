// Real local Edge Function + Auth + Mailpit regression. No secrets in output.
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const baseline = process.argv.includes('--baseline');
const url = new URL(process.env.SUPABASE_TEST_URL ?? 'http://127.0.0.1:54321');
const mail = new URL(process.env.SUPABASE_TEST_MAIL_URL ?? 'http://127.0.0.1:54324');
for (const endpoint of [url, mail]) {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) throw new Error('Loopback endpoints required');
}
const anon = process.env.SUPABASE_TEST_ANON_KEY;
const service = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
if (!anon || !service) throw new Error('Local Auth keys must come from the environment');
const created = new Set();
const clients = [];
const secret = () => `Aa9!${randomBytes(18).toString('hex')}`;
const address = () => `invite-regression-${randomUUID()}@example.invalid`;
class CheckError extends Error {}
function check(ok, label) { if (!ok) throw new CheckError(label); }
function client(key = anon) {
  const instance = createClient(url.href, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  clients.push(instance);
  return instance;
}
const admin = client(service);
async function fixture(role = 'tourist') {
  const credentials = { email: address(), password: secret() };
  const result = await admin.auth.admin.createUser({ ...credentials, email_confirm: true, user_metadata: { date_of_birth: '1990-01-01' } });
  check(!result.error && result.data.user, 'Fixture creation');
  const id = result.data.user.id;
  created.add(id);
  if (role !== 'tourist') check(!(await admin.from('user_roles').update({ role }).eq('user_id', id)).error, 'Fixture role');
  const instance = client();
  const signed = await instance.auth.signInWithPassword(credentials);
  check(!signed.error && signed.data.session, 'Fixture login');
  return { id, instance, token: signed.data.session.access_token };
}
async function invite(token, email) {
  const response = await fetch(new URL('/functions/v1/invite-staff', url), {
    method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'invite', email, firstName: 'Synthetic', lastName: 'Manager', phone: '+50255551234', permissions: { can_view_visitors: true, can_view_emergency_contacts: true } }),
  });
  const data = await response.json();
  if (data.user_id) created.add(data.user_id);
  return { status: response.status, data };
}
async function emailSession(email, type) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const inbox = await (await fetch(new URL(`/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`, mail))).json();
    for (const summary of inbox.messages ?? []) {
      const message = await (await fetch(new URL(`/api/v1/message/${summary.ID}`, mail))).json();
      for (const link of (message.HTML ?? '').match(/href="([^"]+)"/g) ?? []) {
        const verification = new URL(link.slice(6, -1).replaceAll('&amp;', '&'));
        if (verification.origin !== url.origin || verification.pathname !== '/auth/v1/verify' || verification.searchParams.get('type') !== type) continue;
        const response = await fetch(verification, { redirect: 'manual' });
        check([302, 303].includes(response.status), 'Email verification redirect');
        const target = new URL(response.headers.get('location'));
        const session = Object.fromEntries(new URLSearchParams(target.hash.slice(1)));
        check(session.access_token && session.refresh_token && !session.error, 'Email verification session');
        return session;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new CheckError('Local email not received');
}

try {
  const owner = await fixture('admin');
  const tourist = await fixture();
  const deniedEmail = address();
  check((await invite(tourist.token, deniedEmail)).status === 403, 'Tourist must not invite');
  check((await admin.rpc('staff_invitation_email_available', { p_email: deniedEmail })).data === true, 'Denied invitation created an identity');
  console.log('Unauthorized tourist -> invite-staff: HTTP 403, no identity created PASS');
  const email = address();
  const result = await invite(owner.token, email);
  console.log(`Authorized administrator -> invite-staff: HTTP ${result.status}`);
  if (baseline) {
    check(result.status === 500 && /Database error saving new user/i.test(result.data.error ?? ''), 'Expected original Auth insertion failure');
    check((await admin.rpc('staff_invitation_email_available', { p_email: email })).data === true, 'Failed invitation did not roll back');
    console.log('Original invitation failure reproduced; identity rolled back PASS');
  } else {
    check(result.status === 200 && result.data.user_id, 'Authorized invitation must succeed');
    const id = result.data.user_id;
    const identity = await admin.auth.admin.getUserById(id);
    check(identity.data.user?.invited_at && !identity.data.user?.user_metadata.date_of_birth, 'Real invitation must not fabricate a birth date');
    check((await admin.from('profiles').select('date_of_birth').eq('id', id).single()).data?.date_of_birth === null, 'Invitation profile DOB');
    check((await admin.from('user_roles').select('role').eq('user_id', id).single()).data?.role === 'visitor_manager', 'Invited role must be visitor_manager');
    const pending = (await admin.from('staff_permissions').select('*').eq('user_id', id).single()).data;
    check(pending?.invitation_status === 'pending' && pending.is_active === false, 'Pending invitation must be inactive');
    for (const [key, value] of Object.entries(pending)) {
      if (key.startsWith('can_')) check(value === ['can_view_visitors', 'can_view_emergency_contacts'].includes(key), 'Unexpected granted permission');
    }
    const staff = client();
    check(!(await staff.auth.setSession(await emailSession(email, 'invite'))).error, 'Invite link session');
    // GoTrue generates an internal temporary password when consuming an invite.
    // Do not mistake encrypted_password presence for a user-chosen password.
    // Exercise the application's intended order: set password, then activate.
    for (const weak of ['volcan25', 'VOLCAN25']) {
      check((await staff.auth.updateUser({ password: weak })).error?.code === 'weak_password', 'Weak invitation password accepted');
    }
    const password = secret();
    check(!(await staff.auth.updateUser({ password })).error, 'First password without previous password');
    check((await staff.rpc('activate_my_staff_invitation')).data === true, 'Invitation activation');
    check(!(await staff.auth.signInWithPassword({ email, password })).error, 'Invited manager login');
    check((await staff.rpc('get_admin_session')).data?.role === 'visitor_manager', 'Manager Admin session');
    for (const [permission, expected] of [['can_view_visitors', true], ['can_view_emergency_contacts', true], ['can_view_identity_documents', false], ['can_manage_visits', false], ['can_manage_staff', false]]) {
      check((await staff.rpc('has_staff_permission', { permission_name: permission })).data === expected, 'Effective permission mismatch');
    }
    const staffSession = (await staff.auth.getSession()).data.session;
    check((await invite(staffSession.access_token, address())).status === 403, 'Manager must not invite');
    console.log('Real Mailpit invitation, strong first password, activation, login and exact permissions PASS');

    const today = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(part => [part.type, part.value]));
    const birthday = years => `${Number(today.year) - years}-${today.month}-${today.day}`;
    const forged = { staff_invitation: true, invited_at: new Date().toISOString(), role: 'admin', app_metadata: { role: 'visitor_manager' } };
    for (const [label, data, valid] of [
      ['minor', { date_of_birth: birthday(17) }, false],
      ['exactly_18', { date_of_birth: birthday(18) }, true],
      ['missing_DOB', {}, false],
      ['forged_staff_missing_DOB', forged, false],
      ['forged_staff_minor', { ...forged, date_of_birth: birthday(17) }, false],
      ['forged_staff_adult', { ...forged, date_of_birth: birthday(18) }, true],
    ]) {
      const credentials = { email: address(), password: secret() };
      const response = await fetch(new URL('/auth/v1/signup', url), {
        method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...credentials, data }),
      });
      const signup = await response.json();
      const id = signup.id ?? signup.user?.id;
      if (id) created.add(id);
      if (valid) {
        check(response.status === 200 && id, `${label}: valid signup rejected`);
        check((await admin.from('user_roles').select('role').eq('user_id', id).single()).data?.role === 'tourist', `${label}: metadata granted a privileged role`);
        check((await admin.from('staff_permissions').select('user_id').eq('user_id', id)).data?.length === 0, 'Tourist has staff permissions');
        await emailSession(credentials.email, 'signup');
        const signed = client();
        check(!(await signed.auth.signInWithPassword(credentials)).error, 'Confirmed tourist login');
        check((await invite((await signed.auth.getSession()).data.session.access_token, address())).status === 403, 'Forged metadata allowed invitation');
      } else {
        check(response.status === 500 && !id, `${label}: invalid signup accepted`);
        check((await admin.rpc('staff_invitation_email_available', { p_email: credentials.email })).data === true, `${label}: rejected identity persisted`);
      }
      console.log(`Tourist ${label}: ${valid ? 'PERMITTED as tourist only, email confirmed' : 'DENIED, no persisted identity'} PASS`);
    }
    // Empty-password OTP creation also must not bypass the deferred check.
    const otpEmail = address();
    const otp = await client().auth.signInWithOtp({ email: otpEmail, options: { shouldCreateUser: true, data: forged } });
    check(otp.error && (await admin.rpc('staff_invitation_email_available', { p_email: otpEmail })).data === true, 'Passwordless metadata bypass');
    console.log('Passwordless signup with forged staff metadata: DENIED PASS');
  }
} catch (error) {
  console.error(`FAIL: ${error instanceof CheckError ? error.message : 'Local request failed (details withheld)'}`);
  process.exitCode = 1;
} finally {
  for (const id of created) if ((await admin.auth.admin.deleteUser(id)).error) process.exitCode = 1;
  for (const instance of clients) await instance.auth.dispose();
  console.log('Synthetic fixture cleanup completed');
}
