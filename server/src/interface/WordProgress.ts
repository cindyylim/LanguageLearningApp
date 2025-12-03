import { ObjectId } from "mongodb";

export interface WordProgress {
    _id: string;
    wordId: string;
    userId: string;
    mastery: number;
    status: string;
    reviewCount: number;
    streak: number;
    lastReviewed: string;
    nextReview: string;
    createdAt: string;
    updatedAt: string;
}

