const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { applyCallAction } = require('../src/call/callFsm');

describe('applyCallAction', () => {
  const base = { callerId: 'u1', calleeId: 'u2', status: 'ringing' };

  test('callee can accept', () => {
    const r = applyCallAction(base, { action: 'accept', userId: 'u2' });
    assert.equal(r.ok, true);
    assert.equal(r.next, 'accepted');
  });

  test('caller cannot accept', () => {
    const r = applyCallAction(base, { action: 'accept', userId: 'u1' });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'only_callee_accept');
  });

  test('callee can reject', () => {
    const r = applyCallAction(base, { action: 'reject', userId: 'u2' });
    assert.equal(r.ok, true);
    assert.equal(r.next, 'rejected');
  });

  test('caller can cancel while ringing', () => {
    const r = applyCallAction(base, { action: 'cancel', userId: 'u1' });
    assert.equal(r.ok, true);
    assert.equal(r.next, 'cancelled');
  });

  test('either can end when accepted', () => {
    const s = { ...base, status: 'accepted' };
    assert.equal(applyCallAction(s, { action: 'end', userId: 'u1' }).ok, true);
    assert.equal(applyCallAction(s, { action: 'end', userId: 'u2' }).ok, true);
  });

  test('stranger forbidden', () => {
    const r = applyCallAction(base, { action: 'accept', userId: 'u99' });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'forbidden');
  });

  test('no transition from terminal', () => {
    const s = { ...base, status: 'ended' };
    const r = applyCallAction(s, { action: 'end', userId: 'u1' });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'terminal_state');
  });
});
