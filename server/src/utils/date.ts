const MS_PER_UTC_DAY = 86_400_000;

/**
 * UTC calendar start-of-day (00:00:00.000Z) for the given date.
 */
export function toUtcStartOfDay(date: Date = new Date()): Date {
    return new Date(Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate()
    ));
}

/**
 * Whole UTC calendar days since the Unix epoch.
 */
export function utcDayNumber(date: Date): number {
    return Math.floor(toUtcStartOfDay(date).getTime() / MS_PER_UTC_DAY);
}

/**
 * Difference in UTC calendar days (later - earlier). Consecutive days are 1
 * even when the timestamps are 23h or 25h apart due to DST.
 */
export function utcCalendarDaysBetween(later: Date, earlier: Date): number {
    return utcDayNumber(later) - utcDayNumber(earlier);
}
