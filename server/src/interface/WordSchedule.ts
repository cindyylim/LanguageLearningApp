export interface WordSchedule {
    wordId: string;
    currentMastery: number;
    nextReviewDate: Date;
    interval: number;
    priority: string;
}