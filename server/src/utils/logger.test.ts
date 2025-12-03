import { logger, createRequestLogger } from './logger';

// Mock winston
jest.mock('winston', () => {
    const mockLogger: any = {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        child: jest.fn((meta: any): any => ({
            ...mockLogger,
            defaultMeta: meta,
        })),
    };

    return {
        createLogger: jest.fn((): any => mockLogger),
        format: {
            combine: jest.fn(),
            timestamp: jest.fn(),
            printf: jest.fn(),
            colorize: jest.fn(),
            errors: jest.fn(),
        },
        transports: {
            Console: jest.fn(),
            File: jest.fn(),
        },
        Logger: jest.fn(),
    };
});

describe('Logger', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should create logger instance', () => {
        expect(logger).toBeDefined();
        expect(logger.info).toBeDefined();
        expect(logger.error).toBeDefined();
    });

    it('should log info messages', () => {
        logger.info('Test message');
        expect(logger.info).toHaveBeenCalledWith('Test message');
    });

    it('should log error messages', () => {
        const error = new Error('Test error');
        logger.error('Error occurred', error);
        expect(logger.error).toHaveBeenCalled();
    });

    it('should create request logger with requestId', () => {
        const requestId = '123-456';
        
        // Clear previous mock calls
        jest.clearAllMocks();
        
        // Call the function
        createRequestLogger(requestId);

        // Verify that logger.child was called with the correct parameter
        expect(logger.child).toHaveBeenCalledWith({ requestId });
    });
});
