// API-related type definitions

export interface ApiErrorResponse {
    error: string;
    status?: string;
    message?: string;
    stack?: string;
}

export interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
}

export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}
