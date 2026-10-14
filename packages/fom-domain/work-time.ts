import { crmDay, crmLocalTime, crmInstant } from './crm-dates';

export const WORK_TIME_ZONE = 'Europe/Bucharest';
/** Only absolute instants are converted. Calendar-only and legacy wall dates stay untouched. */
export function workInstant(value: unknown): Date | null {
  let date: Date;
  if (value instanceof Date) date = value;
  else if (typeof value === 'number') date = new Date(value);
  else if (typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) date = new Date(value);
  else if (value && typeof value === 'object' && typeof (value as any).toMillis === 'function') date = new Date((value as any).toMillis());
  else if (value && typeof value === 'object' && typeof (value as any).seconds === 'number') date = new Date((value as any).seconds * 1000 + ((value as any).nanoseconds || 0) / 1e6);
  else return null;
  return Number.isFinite(date.getTime()) ? date : null;
}
export function romanianWorkDate(value: unknown): string {
  const date = workInstant(value);
  if (!date) return '';
  return crmDay(date).split('-').reverse().join('.');
}
export function romanianWorkTime(value: unknown): string {
  const date = workInstant(value);
  return date ? crmLocalTime(date) : '';
}
export function romanianWorkDisplay(value: unknown): string {
  const date = workInstant(value);
  if (!date) return '';
  const day = new Intl.DateTimeFormat('ro-RO', { timeZone: WORK_TIME_ZONE, day: '2-digit', month: 'short', year: 'numeric' }).format(date);
  return `${day} ${romanianWorkTime(date)}`;
}
export function romanianManualInstant(day: string, time: string): string {
  if (!/^\d{2}\.\d{2}\.\d{4}$/.test(day)) throw new Error('Data trebuie să fie DD.MM.YYYY.');
  return crmInstant(day.split('.').reverse().join('-'), time);
}
/** Display normalization only; never writes history or changes the recorded instant. */
export function normalizeWorkTimes<T extends Record<string, any>>(work: T): T {
  const patch: Record<string, string> = {};
  for (const [instant, date, time] of [['timpSosire', 'dataSosire', 'oraSosire'], ['timpPlecare', 'dataPlecare', 'oraPlecare']]) {
    if (workInstant(work[instant])) {
      patch[date] = romanianWorkDate(work[instant]);
      patch[time] = romanianWorkTime(work[instant]);
    }
  }
  return { ...work, ...patch };
}
