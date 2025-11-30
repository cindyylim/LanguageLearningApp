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
