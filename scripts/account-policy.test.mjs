import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAdult, latestAdultBirthDate, isValidPassword, minimumReturnAt, requiresEarlyReturn } from '../shared/account-policy.ts';
import { acceptsPosition, watchOrientation } from '../shared/gps-policy.ts';

test('age uses calendar birthdays, including the exact eighteenth birthday', () => {
  assert.equal(isAdult('2009-10-22', '2026-10-22'), false);
  assert.equal(isAdult('2008-10-22', '2026-10-22'), true);
  assert.equal(isAdult('2008-10-23', '2026-10-22'), false);
  assert.equal(isAdult('2008-02-30', '2026-10-22'), false);
  assert.equal(isAdult('', '2026-10-22'), false);
  assert.equal(latestAdultBirthDate('2024-02-29'), '2006-02-28');
  assert.equal(isAdult('2008-02-29', '2026-02-28'), false);
  assert.equal(isAdult('2008-02-29', '2026-03-01'), true);
});

test('one password policy for signup, change, reset and administrative accounts', () => {
  for (const password of ['12345678', 'abcdefgh', 'Ab12', '!!!!!!!!', 'volcan25', 'volcan25!']) assert.equal(isValidPassword(password), false);
  for (const password of ['Volcan25', 'Maria2026', 'Xela1234', 'VOLCAN25', 'Volcan25!']) assert.equal(isValidPassword(password), true);
});

test('08:00 start requires 12:00 estimate; physical early returns use their own flow', () => {
  const start = '2026-10-22T08:00:00-06:00';
  const expected = '2026-10-22T12:00:00-06:00';
  assert.equal(minimumReturnAt(Date.parse(start)), Date.parse(expected));
  assert.equal(requiresEarlyReturn(Date.parse('2026-10-22T11:59:00-06:00'), start), true);
  assert.equal(requiresEarlyReturn(Date.parse(expected), start), false);
  assert.equal(requiresEarlyReturn(Date.parse(expected), null), true);
  assert.equal(requiresEarlyReturn(Date.parse(expected), 'invalid'), true);
});

test('GPS accepts real accuracy including poor fixes and legitimate movement', () => {
  const first = { latitude: 14.787, longitude: -91.548, accuracy: 8, timestamp: 1000 };
  assert.equal(acceptsPosition(null, first), true);
  assert.equal(acceptsPosition(first, { ...first, latitude: 14.7871, accuracy: 12, timestamp: 6000 }), true);
  assert.equal(acceptsPosition(first, { ...first, accuracy: 3500, timestamp: 6000 }), true);
  assert.equal(acceptsPosition(first, { ...first, latitude: 15.787, timestamp: 6000 }), false);
  assert.equal(acceptsPosition(first, { ...first, timestamp: 999 }), false);
  assert.equal(acceptsPosition(null, { ...first, accuracy: NaN }), false);
});

test('orientation watch requests high accuracy and clears the exact watch on cleanup', () => {
  let options;
  let cleared;
  let receive;
  const geolocation = {
    watchPosition(success, _error, config) { receive = success; options = config; return 42; },
    clearWatch(id) { cleared = id; },
  };
  const readings = [];
  const stop = watchOrientation(geolocation, (position) => readings.push(position.coords.accuracy), () => {});
  receive({ coords: { accuracy: 7 } });
  receive({ coords: { accuracy: 3000 } });
  assert.deepEqual(readings, [7, 3000]);
  assert.deepEqual(options, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
  stop();
  assert.equal(cleared, 42);
});
