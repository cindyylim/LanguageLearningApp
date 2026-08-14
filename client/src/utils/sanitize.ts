// Client-side sanitization utilities

import DOMPurify from 'dompurify';

/**
 * Strip all HTML tags for plain text display
 * Use this when you want to display user input as plain text
 */
export function sanitizeText(dirty: string): string {
    return DOMPurify.sanitize(dirty, {
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: []
    });
}
