// Error type definitions and utilities for client

import { AxiosError } from 'axios';

export interface ApiError {
    error: string;
    message?: string;
    status?: string;
}

export type AxiosErrorResponse = AxiosError<ApiError>;

export function isAxiosError(error: unknown): error is AxiosErrorResponse {
    return (error as AxiosError).isAxiosError === true;
}

export function getErrorMessage(error: unknown): string {
    if (isAxiosError(error)) {
        return error.response?.data?.error || error.response?.data?.message || error.message;
    }
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    return 'An unknown error occurred';
}
