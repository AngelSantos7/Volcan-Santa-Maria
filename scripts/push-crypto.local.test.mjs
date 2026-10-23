// Uses the already-cached web-push version; no installation or real network.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createECDH, randomBytes } from 'node:crypto';
import https from 'node:https';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { sendValidatedPush } from '../supabase/functions/_shared/push-transport.ts';

const forbidden = () => { throw new Error('Network forbidden in crypto regression'); };
http.request = forbidden; http.get = forbidden; https.request = forbidden; https.get = forbidden;
globalThis.fetch = forbidden;
if (!process.env.WEB_PUSH_TEST_MODULE_PATH) throw new Error('Set WEB_PUSH_TEST_MODULE_PATH to the existing cached web-push package');
const require = createRequire(import.meta.url);
const webpush = require(process.env.WEB_PUSH_TEST_MODULE_PATH);
assert.equal(require(`${process.env.WEB_PUSH_TEST_MODULE_PATH}/package.json`).version, '3.6.7');
const vapid = webpush.generateVAPIDKeys();
webpush.setVapidDetails('mailto:synthetic@example.invalid', vapid.publicKey, vapid.privateKey);
const receiver = createECDH('prime256v1'); receiver.generateKeys();
const keys = { p256dh: receiver.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') };
const cases = JSON.parse(readFileSync(new URL('./fixtures/push-endpoints.json', import.meta.url), 'utf8')).filter(([, , valid]) => valid);
for (const [label, endpoint] of cases) {
  let generated; let called = 0;
  await sendValidatedPush({ endpoint, keys }, JSON.stringify({ title: 'Synthetic notification', body: 'Offline test' }),
    (...args) => { generated = webpush.generateRequestDetails(...args); return generated; },
    async (target, options) => {
      called++;
      assert.equal(target, endpoint); assert.equal(options.method, 'POST');
      assert.equal(options.redirect, 'error');
      assert.deepEqual(options.body, new Uint8Array(generated.body));
      assert.equal(options.headers['Content-Encoding'], 'aes128gcm');
      assert.equal(options.headers.TTL, '3600');
      assert.ok(options.headers.Authorization.startsWith('vapid '));
      assert.ok(options.body.byteLength > 0);
      return new Response(null, { status: 201 });
    });
  assert.equal(called, 1);
  console.log(`Real web-push 3.6.7 encryption/VAPID, intercepted fetch: ${label} PASS`);
}
