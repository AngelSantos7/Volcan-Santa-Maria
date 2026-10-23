// Runs only against an explicitly supplied loopback Auth server. Valid passwords
// deliberately hit the underage signup guard, so every request rolls back and
// no user, password, email or cleanup deletion is persisted.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { isValidPassword } from '../shared/account-policy.ts';

assert.equal(isValidPassword('volcan25'), false, 'Application policy requires uppercase');
// Auth lower_upper_letters_digits enforces the same composition as the application.

const url = new URL(process.env.SUPABASE_TEST_URL ?? 'http://127.0.0.1:54321');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'LOCAL tests only');
const key = process.env.SUPABASE_TEST_ANON_KEY;
assert.ok(key, 'Set SUPABASE_TEST_ANON_KEY from local status');
for (const [password, valid] of [['12345678', false], ['abcdefgh', false], ['volcan25', false], ['VOLCAN25', false], ['Ab12', false], ['Volcan25', true], ['Maria2026', true]]) {
  const response = await fetch(new URL('/auth/v1/signup', url), {
    method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `policy-${randomUUID()}@example.com`, password, data: { date_of_birth: '2015-01-01' } }),
  });
  const body = await response.json();
  if (valid) {
    assert.ok(response.status >= 500 && /adult_required|database error/i.test(body.msg ?? body.message ?? ''), 'Valid password must reach the database age guard and roll back');
  } else assert.equal(body.error_code ?? body.code, 'weak_password', 'Auth must reject weak password before database insertion');
  console.log(`PASS Auth policy: ${valid ? 'valid composition reaches age guard' : 'weak composition rejected'}`);
}
