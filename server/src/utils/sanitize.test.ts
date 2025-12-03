import {
    sanitizeString,
    sanitizeObject,
    sanitizeEmail,
    sanitizeText,
    sanitizeVocabularyListName,
    sanitizeWordInput,
    sanitizeDescription
} from './sanitize';

describe('Sanitize Utils', () => {
    describe('sanitizeString', () => {
        it('should remove HTML tags and trim whitespace', () => {
            const result = sanitizeString('  <script>alert("xss")</script>hello  ');
            expect(result).not.toContain('<script>');
            expect(result).toContain('hello');
        });

        it('should return input if not a string', () => {
            const input = 123 as any;
            expect(sanitizeString(input)).toBe(123);
        });
    });

    describe('sanitizeObject', () => {
        it('should recursively sanitize string properties', () => {
            const obj = {
                name: '<b>Test</b>',
                nested: {
                    value: '<i>Nested</i>'
                }
            };
            const result = sanitizeObject(obj);
            expect(result.name).not.toContain('<b>');
            expect(result.nested.value).not.toContain('<i>');
        });

        it('should handle arrays', () => {
            const obj = {
                items: ['<script>xss</script>', 'safe']
            };
            const result = sanitizeObject(obj);
            expect(result.items[0]).not.toContain('<script>');
        });
    });

    describe('sanitizeEmail', () => {
        it('should normalize valid email', () => {
            const result = sanitizeEmail('Test@Example.com');
            expect(result).toBe('test@example.com');
        });

        it('should throw error for invalid email', () => {
            expect(() => sanitizeEmail('not-an-email')).toThrow('Invalid email format');
        });
    });

    describe('sanitizeText', () => {
        it('should remove all HTML tags', () => {
            const result = sanitizeText('<p>Hello <b>World</b></p>');
            expect(result).toBe('Hello World');
        });
    });

    describe('sanitizeVocabularyListName', () => {
        it('should sanitize valid name', () => {
            const result = sanitizeVocabularyListName('  My List  ');
            expect(result).toBeTruthy();
            expect(typeof result).toBe('string');
        });

        it('should throw error for empty name', () => {
            expect(() => sanitizeVocabularyListName('')).toThrow();
        });

        it('should throw error for name exceeding 100 characters', () => {
            const longName = 'a'.repeat(150);
            expect(() => sanitizeVocabularyListName(longName)).toThrow();
        });
    });

    describe('sanitizeWordInput', () => {
        it('should sanitize valid input', () => {
            const result = sanitizeWordInput('  word  ');
            expect(result).toBeTruthy();
        });

        it('should throw error for empty input', () => {
            expect(() => sanitizeWordInput('')).toThrow('Invalid input');
        });
    });

    describe('sanitizeDescription', () => {
        it('should sanitize description', () => {
            const result = sanitizeDescription('  description  ');
            expect(result).toBeTruthy();
        });

        it('should return undefined for empty description', () => {
            const result = sanitizeDescription('');
            expect(result).toBeUndefined();
        });
    });
});
