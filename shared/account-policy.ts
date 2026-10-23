export const MIN_PASSWORD_LENGTH = 8;

export function passwordChecks(password: string) {
  return {
    length: password.length >= MIN_PASSWORD_LENGTH,
    uppercase: /[A-Z]/u.test(password),
    number: /[0-9]/u.test(password),
  };
}

export function isValidPassword(password: string): boolean {
  return Object.values(passwordChecks(password)).every(Boolean);
}

// Calendar dates in Guatemala, shared by registration, profile and visits.
export function guatemalaDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

export function latestAdultBirthDate(today = guatemalaDate()): string {
  const [year, month, day] = today.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year - 18, month, 0)).getUTCDate();
  return `${year - 18}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

export function isAdult(birthDate: string, today = guatemalaDate()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return false;
  const date = new Date(`${birthDate}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === birthDate
    && birthDate <= latestAdultBirthDate(today);
}

export const MIN_VISIT_DURATION_MS = 4 * 60 * 60 * 1000;
export function minimumReturnAt(start: number): number {
  return start + MIN_VISIT_DURATION_MS;
}

export function requiresEarlyReturn(now: number, start: string | null): boolean {
  return !start || !Number.isFinite(Date.parse(start)) || now < minimumReturnAt(Date.parse(start));
}
