import { format as dateFnsFormat, parseISO } from 'date-fns';
import { fromZonedTime, toZonedTime, format as formatTz } from 'date-fns-tz';

// Mountain Time Zone (handles both MST and MDT automatically)
export const MOUNTAIN_TIMEZONE = 'America/Denver';

/**
 * Get current date in Mountain Time as YYYY-MM-DD string
 */
export const getCurrentMountainDate = (): string => {
  const now = new Date();
  const mountainTime = toZonedTime(now, MOUNTAIN_TIMEZONE);
  return formatTz(mountainTime, 'yyyy-MM-dd', { timeZone: MOUNTAIN_TIMEZONE });
};

/**
 * Get current Mountain Time as Date object
 */
export const getCurrentMountainTime = (): Date => {
  const now = new Date();
  return toZonedTime(now, MOUNTAIN_TIMEZONE);
};

/**
 * Convert a Mountain Time date string (YYYY-MM-DD) to UTC for database storage
 */
export const mountainDateToUtc = (dateString: string): string => {
  // Parse the date string and create a Date object representing midnight Mountain Time
  // fromZonedTime expects a Date object that represents the "wall clock" time in the specified timezone
  const [year, month, day] = dateString.split('-').map(Number);
  const mountainDate = new Date(year, month - 1, day, 0, 0, 0, 0);
  const utcDate = fromZonedTime(mountainDate, MOUNTAIN_TIMEZONE);
  return utcDate.toISOString();
};

/**
 * Convert UTC timestamp to Mountain Time for display
 */
export const utcToMountainTime = (utcTimestamp: string): Date => {
  const utcDate = parseISO(utcTimestamp);
  return toZonedTime(utcDate, MOUNTAIN_TIMEZONE);
};

/**
 * Format UTC timestamp for display in Mountain Time
 */
export const formatInMountainTime = (utcTimestamp: string, formatStr: string): string => {
  const mountainTime = utcToMountainTime(utcTimestamp);
  return formatTz(mountainTime, formatStr, { timeZone: MOUNTAIN_TIMEZONE });
};

/**
 * Get Mountain Time timestamp for database storage (current time)
 */
export const getMountainTimeForDB = (): string => {
  const now = new Date();
  const mountainTime = toZonedTime(now, MOUNTAIN_TIMEZONE);
  // Convert back to UTC for storage but preserve the Mountain Time moment
  return fromZonedTime(mountainTime, MOUNTAIN_TIMEZONE).toISOString();
};

/**
 * Check if a date string represents "today" in Mountain Time
 */
export const isTodayInMountainTime = (dateString: string): boolean => {
  const today = getCurrentMountainDate();
  return dateString === today;
};