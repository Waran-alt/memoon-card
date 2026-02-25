import { INTERVAL_THRESHOLDS, TIME_CONSTANTS } from '@/constants/app.constants';

export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

export function getElapsedDays(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return ms / TIME_CONSTANTS.MS_PER_DAY;
}

export function getElapsedHours(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / TIME_CONSTANTS.MS_PER_HOUR;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function addHours(date: Date, hours: number): Date {
  const result = new Date(date);
  result.setTime(result.getTime() + hours * TIME_CONSTANTS.MS_PER_HOUR);
  return result;
}

export function addMinutes(date: Date, minutes: number): Date {
  const result = new Date(date);
  result.setTime(result.getTime() + minutes * 60 * 1000);
  return result;
}

export function formatIntervalMessage(days: number): string {
  if (days < INTERVAL_THRESHOLDS.ONE_DAY) {
    const hours = Math.round(days * TIME_CONSTANTS.HOURS_PER_DAY);
    if (hours < 1) {
      return 'Review again soon';
    }
    return `Review in ${hours} hour${hours !== 1 ? 's' : ''}`;
  }

  const roundedDays = Math.round(days);
  if (roundedDays === 1) {
    return 'Review tomorrow';
  }
  if (roundedDays < INTERVAL_THRESHOLDS.ONE_WEEK) {
    return `Review in ${roundedDays} days`;
  }
  if (roundedDays < INTERVAL_THRESHOLDS.ONE_MONTH) {
    const weeks = Math.round(roundedDays / TIME_CONSTANTS.DAYS_PER_WEEK);
    return `Review in ${weeks} week${weeks !== 1 ? 's' : ''}`;
  }
  const months = Math.round(roundedDays / TIME_CONSTANTS.DAYS_PER_MONTH);
  return `Review in ${months} month${months !== 1 ? 's' : ''}`;
}
