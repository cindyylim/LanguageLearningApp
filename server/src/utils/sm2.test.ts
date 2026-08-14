import { calculateSM2, calculateFromManualStatus, mapAccuracyToQuality, mapStatusToQuality } from './sm2';

describe('SM-2 Spaced Repetition Utility', () => {
    describe('mapAccuracyToQuality', () => {
        it('should map accuracy scores correctly to quality grades 0-5', () => {
            expect(mapAccuracyToQuality(1.0)).toBe(5);
            expect(mapAccuracyToQuality(0.95)).toBe(5);
            expect(mapAccuracyToQuality(0.80)).toBe(4);
            expect(mapAccuracyToQuality(0.60)).toBe(3);
            expect(mapAccuracyToQuality(0.30)).toBe(2);
            expect(mapAccuracyToQuality(0.10)).toBe(1);
            expect(mapAccuracyToQuality(0.0)).toBe(0);
        });
    });

    describe('mapStatusToQuality', () => {
        it('should map status strings to quality grades', () => {
            expect(mapStatusToQuality('mastered')).toBe(5);
            expect(mapStatusToQuality('learning')).toBe(2);
            expect(mapStatusToQuality('unknown')).toBe(3);
        });
    });

    describe('calculateSM2', () => {
        it('should handle first repetition (n=1) for good response (q=5)', () => {
            const now = new Date('2026-07-27T00:00:00Z');
            const result = calculateSM2({ quality: 5, now });

            expect(result.repetition).toBe(1);
            expect(result.interval).toBe(1);
            expect(result.easeFactor).toBe(2.6); // 2.5 + (0.1 - 0) = 2.6
            expect(result.status).toBe('learning');
            expect(result.nextReview).toEqual(new Date('2026-07-28T00:00:00Z'));
        });

        it('should handle second repetition (n=2) for good response (q=5)', () => {
            const now = new Date('2026-07-27T00:00:00Z');
            const result = calculateSM2({
                quality: 5,
                repetition: 1,
                easeFactor: 2.6,
                interval: 1,
                now
            });

            expect(result.repetition).toBe(2);
            expect(result.interval).toBe(6);
            expect(result.nextReview).toEqual(new Date('2026-08-02T00:00:00Z'));
        });

        it('should handle third repetition (n=3) using EF multiplier', () => {
            const now = new Date('2026-07-27T00:00:00Z');
            const result = calculateSM2({
                quality: 5,
                repetition: 2,
                easeFactor: 2.7,
                interval: 6,
                now
            });

            expect(result.repetition).toBe(3);
            expect(result.interval).toBe(17); // round(6 * 2.8) = 16.8 -> 17
            expect(result.nextReview).toEqual(new Date('2026-08-13T00:00:00Z'));
        });

        it('should reset repetition and interval when grade q < 3', () => {
            const now = new Date('2026-07-27T00:00:00Z');
            const result = calculateSM2({
                quality: 2,
                repetition: 4,
                easeFactor: 2.5,
                interval: 15,
                now
            });

            expect(result.repetition).toBe(0);
            expect(result.interval).toBe(1);
            expect(result.status).toBe('learning');
            expect(result.nextReview).toEqual(new Date('2026-07-28T00:00:00Z'));
        });

        it('should not allow easeFactor to drop below 1.3', () => {
            let result = calculateSM2({ quality: 0, easeFactor: 1.3 });
            expect(result.easeFactor).toBe(1.3);
        });
    });

    describe('calculateFromManualStatus', () => {
        it('should mark a word mastered on the first Mastered click', () => {
            const now = new Date('2026-07-27T00:00:00Z');
            const result = calculateFromManualStatus('mastered', { now });

            expect(result.status).toBe('mastered');
            expect(result.repetition).toBeGreaterThanOrEqual(5);
        });

        it('should persist learning status when Learning is selected', () => {
            const now = new Date('2026-07-27T00:00:00Z');
            const result = calculateFromManualStatus('learning', {
                repetition: 4,
                easeFactor: 2.5,
                interval: 15,
                now,
            });

            expect(result.status).toBe('learning');
            expect(result.repetition).toBe(0);
        });
    });
});
