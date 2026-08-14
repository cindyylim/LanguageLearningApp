import { WordStatus } from "../../../shared/types/index";
export interface SM2Input {
    quality: number; // 0 to 5
    repetition?: number; // current repetition / streak count (n)
    easeFactor?: number; // current ease factor (EF), default 2.5
    interval?: number; // current interval in days (I), default 1
    now?: Date;
}

export interface SM2Output {
    repetition: number;
    easeFactor: number;
    interval: number;
    status: WordStatus;
    nextReview: Date;
}

/**
 * Maps quiz answer accuracy (0.0 to 1.0) to SM-2 quality grade (0 to 5)
 */
export function mapAccuracyToQuality(accuracy: number): number {
    if (accuracy >= 0.95) return 5;
    if (accuracy >= 0.75) return 4;
    if (accuracy >= 0.50) return 3;
    if (accuracy >= 0.25) return 2;
    if (accuracy > 0.0) return 1;
    return 0;
}

/**
 * Maps manual status selection to SM-2 quality grade (0 to 5)
 */
export function mapStatusToQuality(status: string): number {
    switch (status) {
        case WordStatus.MASTERED:
            return 5;
        case WordStatus.LEARNING:
            return 2;
        case WordStatus.NEW:
            return 1;
        default:
            return 3;
    }
}

export function calculateFromManualStatus(
    status: string,
    existing?: Omit<SM2Input, 'quality'>
): SM2Output {
    const isMastered = status === WordStatus.MASTERED;
    const result = calculateSM2({
        quality: mapStatusToQuality(status),
        repetition: isMastered ? 5 : (existing?.repetition ?? 0),
        easeFactor: existing?.easeFactor,
        interval: existing?.interval,
        now: existing?.now,
    });

    if (isMastered) {
        return {
            ...result,
            status: WordStatus.MASTERED,
            repetition: Math.max(result.repetition, 5),
        };
    }

    return {
        ...result,
        status: WordStatus.LEARNING
    };
}

/**
 * SuperMemo-2 (SM-2) Spaced Repetition Algorithm
 */
export function calculateSM2(input: SM2Input): SM2Output {
    const q = Math.max(0, Math.min(5, Math.round(input.quality)));
    const prevEF = input.easeFactor ?? 2.5;
    const prevRepetition = input.repetition ?? 0;
    const prevInterval = input.interval ?? 1;
    const now = input.now ?? new Date();

    // 1. Calculate new Ease Factor (EF)
    // EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    let newEF = prevEF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    if (newEF < 1.3) {
        newEF = 1.3;
    }
    newEF = parseFloat(newEF.toFixed(2));

    // 2. Calculate new Repetition count and Interval
    let newRepetition = 0;
    let newInterval = 1;

    if (q >= 3) {
        newRepetition = prevRepetition + 1;
        if (newRepetition === 1) {
            newInterval = 1;
        } else if (newRepetition === 2) {
            newInterval = 6;
        } else {
            newInterval = Math.round(prevInterval * newEF);
        }
    } else {
        newRepetition = 0;
        newInterval = 1;
    }

    const nextReview = new Date(now.getTime() + newInterval * 24 * 60 * 60 * 1000);

    return {
        repetition: newRepetition,
        easeFactor: newEF,
        interval: newInterval,
        mastery,
        status,
        nextReview
    };
}
