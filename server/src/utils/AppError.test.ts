import { AppError } from './AppError';

describe('AppError', () => {
    it('should create an AppError with correct properties', () => {
        const message = 'Test error message';
        const statusCode = 404;
        const error = new AppError(message, statusCode);

        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(AppError);
        expect(error.message).toBe(message);
        expect(error.statusCode).toBe(statusCode);
        expect(error.status).toBe('fail');
        expect(error.isOperational).toBe(true);
    });

    it('should set status to "error" for 500 status code', () => {
        const error = new AppError('Server error', 500);
        expect(error.status).toBe('error');
    });

    it('should capture stack trace', () => {
        const error = new AppError('Test', 400);
        expect(error.stack).toBeDefined();
    });
});
