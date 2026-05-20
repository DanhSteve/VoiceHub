/**
 * FSM thuần (không I/O) — dùng trong service + unit test.
 */

function normId(id) {
  return id == null ? '' : String(id).trim();
}

/**
 * @param {{ status: string, callerId: string, calleeId: string }} session
 * @param {{ action: 'accept'|'reject'|'cancel'|'end', userId: string }} input
 * @returns {{ ok: true, next: string, endedReason?: string } | { ok: false, code: string }}
 */
function applyCallAction(session, input) {
  const { status, callerId, calleeId } = session;
  const { action, userId } = input;
  const uid = normId(userId);
  const c1 = normId(callerId);
  const c2 = normId(calleeId);
  const isCaller = uid === c1;
  const isCallee = uid === c2;
  const isParticipant = isCaller || isCallee;

  if (!uid || !isParticipant) {
    return { ok: false, code: 'forbidden' };
  }

  if (status === 'ringing') {
    if (action === 'accept') {
      if (!isCallee) return { ok: false, code: 'only_callee_accept' };
      return { ok: true, next: 'accepted', endedReason: undefined };
    }
    if (action === 'reject') {
      if (!isCallee) return { ok: false, code: 'only_callee_reject' };
      return { ok: true, next: 'rejected', endedReason: 'rejected' };
    }
    if (action === 'cancel') {
      if (!isCaller) return { ok: false, code: 'only_caller_cancel' };
      return { ok: true, next: 'cancelled', endedReason: 'cancelled' };
    }
    if (action === 'end') {
      return { ok: false, code: 'invalid_while_ringing' };
    }
    return { ok: false, code: 'unknown_action' };
  }

  if (status === 'accepted') {
    if (action === 'end') {
      if (!isParticipant) return { ok: false, code: 'forbidden' };
      return { ok: true, next: 'ended', endedReason: 'hangup' };
    }
    return { ok: false, code: 'invalid_after_accept' };
  }

  return { ok: false, code: 'terminal_state' };
}

module.exports = {
  applyCallAction,
  normId,
};
