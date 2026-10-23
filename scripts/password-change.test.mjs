import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changeOwnPassword } from '../shared/password-change.ts';

function fixture({
  wrong = false,
  differentUser = false,
  network = false,
} = {}) {
  const calls = [];
  const identity = { id: 'own-user', email: 'fixture@example.invalid' };
  const main = {
    auth: { getUser: async () => ({ data: { user: identity }, error: null }) },
  };
  const verifier = {
    auth: {
      signInWithPassword: async ({ email }) => {
        calls.push(['authenticate', email]);
        return {
          error: wrong
            ? { code: 'invalid_credentials' }
            : network
              ? { code: 'network_error' }
              : null,
          data: {
            user: {
              ...identity,
              id: differentUser ? 'other-user' : identity.id,
            },
          },
        };
      },
      updateUser: async () => {
        calls.push(['update']);
        return { error: null };
      },
      dispose: async () => {},
      signOut: async ({ scope }) => {
        calls.push(['cleanup', scope]);
      },
    },
  };
  return { main, verifier, calls };
}
for (const role of ['tourist', 'admin', 'visitor_manager']) {
  test(`${role}: wrong current password never updates`, async () => {
    const f = fixture({ wrong: true });
    await assert.rejects(
      changeOwnPassword(
        f.main,
        () => f.verifier,
        'Wrong-test-value',
        'New-test-value-9'
      ),
      /current_password_incorrect/
    );
    assert.deepEqual(f.calls, [['authenticate', 'fixture@example.invalid']]);
  });
  test(`${role}: successful reauthentication updates only isolated session`, async () => {
    const f = fixture();
    await changeOwnPassword(
      f.main,
      () => f.verifier,
      'Current-test-value-9',
      'New-test-value-9'
    );
    assert.deepEqual(f.calls, [
      ['authenticate', 'fixture@example.invalid'],
      ['update'],
      ['cleanup', 'local'],
    ]);
    assert.deepEqual(Object.keys(f.main.auth), ['getUser']);
  });
}
test('invalid new password fails before contacting Auth', async () => {
  for (const password of ['short1', 'lowercase9', 'NoNumberHere']) {
    const f = fixture();
    await assert.rejects(
      changeOwnPassword(
        f.main,
        () => f.verifier,
        'Current-test-value-9',
        password
      ),
      /password_policy/
    );
    assert.deepEqual(f.calls, []);
  }
});
test('different verified identity cannot change any password', async () => {
  const f = fixture({ differentUser: true });
  await assert.rejects(
    changeOwnPassword(
      f.main,
      () => f.verifier,
      'Current-test-value-9',
      'New-test-value-9'
    ),
    /authentication_required/
  );
  assert.equal(
    f.calls.some(([call]) => call === 'update'),
    false
  );
  assert.deepEqual(f.calls.at(-1), ['cleanup', 'local']);
});
test('network failure does not update or misreport an incorrect password', async () => {
  const f = fixture({ network: true });
  await assert.rejects(
    changeOwnPassword(
      f.main,
      () => f.verifier,
      'Current-test-value-9',
      'New-test-value-9'
    ),
    (error) => error.code === 'network_error'
  );
  assert.equal(
    f.calls.some(([call]) => call === 'update'),
    false
  );
});
