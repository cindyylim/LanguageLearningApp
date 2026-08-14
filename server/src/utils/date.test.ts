import { toUtcStartOfDay, utcDayNumber, utcCalendarDaysBetween } from './date';

describe('date utils', () => {
    it('normalizes a timestamp to UTC start of day', () => {
        const date = new Date('2026-08-14T15:45:30.123Z');
        const start = toUtcStartOfDay(date);

        expect(start.toISOString()).toBe('2026-08-14T00:00:00.000Z');
        expect(start.getUTCHours()).toBe(0);
        expect(start.getUTCMinutes()).toBe(0);
        expect(start.getUTCSeconds()).toBe(0);
        expect(start.getUTCMilliseconds()).toBe(0);
    });

    it('uses UTC calendar days rather than a fixed 24h millisecond gap', () => {
        const later = new Date('2026-03-09T00:30:00.000Z');
        const earlier = new Date('2026-03-08T01:30:00.000Z'); // 23 hours earlier

        expect(utcCalendarDaysBetween(later, earlier)).toBe(1);
        expect(utcDayNumber(later) - utcDayNumber(earlier)).toBe(1);
    });

    it('treats 25-hour gaps as one calendar day when dates are consecutive UTC days', () => {
        const later = new Date('2026-11-02T01:00:00.000Z');
        const earlier = new Date('2026-11-01T00:00:00.000Z');

        expect(utcCalendarDaysBetween(later, earlier)).toBe(1);
    });

    it('returns 0 for two timestamps on the same UTC day', () => {
        const morning = new Date('2026-08-14T01:00:00.000Z');
        const evening = new Date('2026-08-14T23:00:00.000Z');

        expect(utcCalendarDaysBetween(evening, morning)).toBe(0);
    });
});
