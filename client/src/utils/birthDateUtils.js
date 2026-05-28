/** Khớp services/auth-service/src/utils/dateOfBirth.js */
export const MIN_REGISTRATION_AGE = 13;
export const MAX_REGISTRATION_AGE = 120;

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * @param {{ day?: string|number, month?: string|number, year?: string|number, birthDay?: string|number, birthMonth?: string|number, birthYear?: string|number }} parts
 * @returns {{ ok: true, iso: string } | { ok: false, code: string }}
 */
export function validateBirthDateParts(parts) {
  const d = Number(parts.day ?? parts.birthDay);
  const m = Number(parts.month ?? parts.birthMonth);
  const y = Number(parts.year ?? parts.birthYear);

  if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(y)) {
    return { ok: false, code: 'required' };
  }
  if (d < 1 || m < 1 || m > 12 || y < 1900) {
    return { ok: false, code: 'invalid' };
  }

  const candidate = new Date(y, m - 1, d);
  if (
    candidate.getFullYear() !== y ||
    candidate.getMonth() !== m - 1 ||
    candidate.getDate() !== d
  ) {
    return { ok: false, code: 'invalid' };
  }

  const birth = startOfDay(candidate);
  const today = startOfDay(new Date());

  if (birth > today) {
    return { ok: false, code: 'future' };
  }

  const oldest = new Date(today);
  oldest.setFullYear(oldest.getFullYear() - MAX_REGISTRATION_AGE);
  if (birth < oldest) {
    return { ok: false, code: 'invalid' };
  }

  const minBirth = new Date(today);
  minBirth.setFullYear(minBirth.getFullYear() - MIN_REGISTRATION_AGE);
  if (birth > minBirth) {
    return { ok: false, code: 'tooYoung' };
  }

  const iso = `${y}-${pad2(m)}-${pad2(d)}`;
  return { ok: true, iso };
}

export function birthYearOptions() {
  const now = new Date().getFullYear();
  const maxYear = now - MIN_REGISTRATION_AGE;
  const minYear = now - MAX_REGISTRATION_AGE;
  const years = [];
  for (let y = maxYear; y >= minYear; y -= 1) {
    years.push(y);
  }
  return years;
}

export function isBirthDateComplete({ birthDay, birthMonth, birthYear }) {
  return (
    String(birthDay || '').trim() !== '' &&
    String(birthMonth || '').trim() !== '' &&
    String(birthYear || '').trim() !== ''
  );
}
