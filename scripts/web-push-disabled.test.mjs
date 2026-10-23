import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  isWebPushEnabled,
  runWhenWebPushEnabled,
} from '../src/features/notifications/web-push-config.ts';

test('the versioned production example disables Web Push', () => {
  const example = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
  assert.match(example, /^VITE_WEB_PUSH_ENABLED=false$/mu);
});

test('Web Push stays disabled when the frontend flag is absent or false', () => {
  for (const value of [undefined, null, '', 'false', '0', 'on']) {
    assert.equal(isWebPushEnabled(value), false);
  }
});

test('the frontend flag requires an explicit true value', () => {
  assert.equal(isWebPushEnabled('true'), true);
  assert.equal(isWebPushEnabled(' TRUE '), true);
});

test('a disabled frontend never reaches the browser permission operation', async () => {
  let permissionRequests = 0;
  await assert.rejects(
    runWhenWebPushEnabled(async () => {
      permissionRequests += 1;
    }, undefined),
    /disabled/u
  );
  assert.equal(permissionRequests, 0);
});

test('the guarded operation remains available for a future explicit rollout', async () => {
  let permissionRequests = 0;
  await runWhenWebPushEnabled(async () => {
    permissionRequests += 1;
  }, 'true');
  assert.equal(permissionRequests, 1);
});
