// Error type definitions and utilities for client

import { AxiosError } from 'axios';

export interface ApiError {
    error: string;
    message?: string;
    code?: string;
    status?: string;
}

export type AxiosErrorResponse = AxiosError<ApiError>;

export function isAxiosError(error: unknown): error is AxiosErrorResponse {
    return (error as AxiosError).isAxiosError === true;
}

export function getErrorMessage(error: unknown): string {
    if (isAxiosError(error)) {

        return error.response?.data?.message
            || error.response?.data?.error
            || error.message;
    }
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    return 'An unknown error occurred';
}

export function getUserFacingErrorMessage(error: unknown, fallback: string): string {
    if (isAxiosError(error)) {
        const data = error.response?.data;

        if (data?.code === 'MODERATION_BLOCKED') {
            return data.message
                || "This content isn't allowed. Please choose a different topic, such as travel, food, or hobbies.";
        }

        if (data?.message === 'Vocabulary list cannot be generated') {
            return "We couldn't generate a vocabulary list. Please try a different topic or try again later.";
        }

        if (data?.message) {
            return data.message;
        }

        if (data?.error && typeof data.error === 'string') {
            return data.error;
        }
    }

    const message = getErrorMessage(error);
    if (message.includes('flagged by moderation')) {
        return "This content isn't allowed. Please choose a different topic, such as travel, food, or hobbies.";
    }

    return message || fallback;
}
