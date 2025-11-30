// Server-side sanitization utilities

import validator from 'validator';

/**
 * Sanitize a string by removing HTML tags and dangerous characters
 */
export function sanitizeString(input: string): string {
    if (typeof input !== 'string') {
        return input;
    }

    // Remove HTML tags
    let sanitized = validator.stripLow(input);

    // Escape HTML entities
    sanitized = validator.escape(sanitized);

    // Trim whitespace
    sanitized = validator.trim(sanitized);

    return sanitized;
}

/**
 * Sanitize an object by recursively sanitizing all string properties
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
    if (!obj || typeof obj !== 'object') {
        return obj;
    }

    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
            sanitized[key] = sanitizeString(value);
        } else if (Array.isArray(value)) {
            sanitized[key] = value.map(item =>
                typeof item === 'string' ? sanitizeString(item) :
                    typeof item === 'object' && item !== null ? sanitizeObject(item as Record<string, unknown>) :
                        item
            );
        } else if (typeof value === 'object' && value !== null) {
            sanitized[key] = sanitizeObject(value as Record<string, unknown>);
        } else {
            sanitized[key] = value;
        }
    }

    return sanitized as T;
}

/**
 * Validate and sanitize email
 */
export function sanitizeEmail(email: string): string {
    if (!validator.isEmail(email)) {
        throw new Error('Invalid email format');
    }
    return validator.normalizeEmail(email) || email;
}

/**
 * Sanitize text for safe display (removes all HTML)
 */
export function sanitizeText(input: string): string {
    if (typeof input !== 'string') {
        return input;
    }

    // Strip all HTML tags completely
    return input.replace(/<[^>]*>/g, '').trim();
}

/**
 * Validate and sanitize user input for vocabulary list names
 */
export function sanitizeVocabularyListName(name: string): string {
    if (!name || typeof name !== 'string') {
        throw new Error('Invalid name');
    }

    const sanitized = sanitizeString(name);

    if (sanitized.length === 0) {
        throw new Error('Name cannot be empty');
    }

    if (sanitized.length > 100) {
        throw new Error('Name cannot exceed 100 characters');
    }

    return sanitized;
}

/**
 * Validate and sanitize word/translation inputs
 */
export function sanitizeWordInput(input: string): string {
    if (!input || typeof input !== 'string') {
        throw new Error('Invalid input');
    }

    const sanitized = sanitizeString(input);

    if (sanitized.length === 0) {
        throw new Error('Input cannot be empty');
    }

    return sanitized;
}

/**
 * Sanitize user description/notes (allows more length)
 */
export function sanitizeDescription(description?: string): string | undefined {
    if (!description) return undefined;
    if (typeof description !== 'string') return undefined;

    const sanitized = sanitizeString(description);
    return sanitized.length > 0 ? sanitized : undefined;
}
