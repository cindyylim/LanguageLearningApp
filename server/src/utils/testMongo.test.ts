describe('testMongo', () => {
    const originalTestDbUri = process.env.TESTDB_URI;
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
        if (originalTestDbUri === undefined) {
            delete process.env.TESTDB_URI;
        } else {
            process.env.TESTDB_URI = originalTestDbUri;
        }
        if (originalNodeEnv === undefined) {
            delete process.env.NODE_ENV;
        } else {
            process.env.NODE_ENV = originalNodeEnv;
        }
        jest.resetModules();
        jest.dontMock('mongodb');
    });

    it('can be imported in production without TESTDB_URI', () => {
        process.env.NODE_ENV = 'production';
        delete process.env.TESTDB_URI;
        jest.resetModules();

        expect(() => {
            require('./testMongo');
        }).not.toThrow();
    });

    it('can be imported in development without TESTDB_URI', () => {
        process.env.NODE_ENV = 'development';
        delete process.env.TESTDB_URI;
        jest.resetModules();

        expect(() => {
            require('./testMongo');
        }).not.toThrow();
    });

    it('throws when connecting in test without TESTDB_URI', async () => {
        process.env.NODE_ENV = 'test';
        delete process.env.TESTDB_URI;
        jest.resetModules();

        const { connectToTestDatabase } = require('./testMongo');
        await expect(connectToTestDatabase()).rejects.toThrow(
            'Please define the TESTDB_URI environment variable for test database'
        );
    });

    it('connects using TESTDB_URI when it is set', async () => {
        const mockConnect = jest.fn().mockResolvedValue(undefined);
        const mockDb = jest.fn().mockReturnValue({ name: 'testdb' });
        const mockOn = jest.fn();

        jest.resetModules();
        jest.doMock('mongodb', () => ({
            MongoClient: jest.fn().mockImplementation(() => ({
                connect: mockConnect,
                db: mockDb,
                on: mockOn,
            })),
        }));

        process.env.NODE_ENV = 'test';
        process.env.TESTDB_URI = 'mongodb://localhost:27017/language-learning-test';

        const { connectToTestDatabase } = require('./testMongo');
        const db = await connectToTestDatabase();

        expect(mockConnect).toHaveBeenCalled();
        expect(db).toEqual({ name: 'testdb' });
    });

    it('returns cached database on subsequent calls', async () => {
        const mockConnect = jest.fn().mockResolvedValue(undefined);
        const mockDb = { name: 'cached-testdb' };
        const mockOn = jest.fn();

        jest.resetModules();
        jest.doMock('mongodb', () => ({
            MongoClient: jest.fn().mockImplementation(() => ({
                connect: mockConnect,
                db: jest.fn().mockReturnValue(mockDb),
                on: mockOn,
            })),
        }));

        process.env.NODE_ENV = 'test';
        process.env.TESTDB_URI = 'mongodb://localhost:27017/language-learning-test';

        const { connectToTestDatabase } = require('./testMongo');
        const first = await connectToTestDatabase();
        const second = await connectToTestDatabase();

        expect(first).toBe(mockDb);
        expect(second).toBe(mockDb);
        expect(mockConnect).toHaveBeenCalledTimes(1);
    });

    it('clears connection promise when test database connect fails', async () => {
        const mockConnect = jest
            .fn()
            .mockRejectedValueOnce(new Error('test connect failed'))
            .mockResolvedValue(undefined);
        const mockDb = { name: 'retry-testdb' };
        const mockOn = jest.fn();

        jest.resetModules();
        jest.doMock('mongodb', () => ({
            MongoClient: jest.fn().mockImplementation(() => ({
                connect: mockConnect,
                db: jest.fn().mockReturnValue(mockDb),
                on: mockOn,
            })),
        }));

        process.env.NODE_ENV = 'test';
        process.env.TESTDB_URI = 'mongodb://localhost:27017/language-learning-test';

        const { connectToTestDatabase } = require('./testMongo');

        await expect(connectToTestDatabase()).rejects.toThrow('test connect failed');
        await expect(connectToTestDatabase()).resolves.toBe(mockDb);
        expect(mockConnect).toHaveBeenCalledTimes(2);
    });

    it('clears cache when topology closes and closes test connection', async () => {
        const mockConnect = jest.fn().mockResolvedValue(undefined);
        const mockClose = jest.fn().mockResolvedValue(undefined);
        const mockDb = { name: 'closable-testdb' };
        let topologyHandler: (() => void) | undefined;
        const mockOn = jest.fn((_event: string, handler: () => void) => {
            topologyHandler = handler;
        });

        jest.resetModules();
        jest.doMock('mongodb', () => ({
            MongoClient: jest.fn().mockImplementation(() => ({
                connect: mockConnect,
                db: jest.fn().mockReturnValue(mockDb),
                on: mockOn,
                close: mockClose,
            })),
        }));

        process.env.NODE_ENV = 'test';
        process.env.TESTDB_URI = 'mongodb://localhost:27017/language-learning-test';

        const { connectToTestDatabase, closeTestDatabaseConnection } = require('./testMongo');
        await connectToTestDatabase();

        expect(topologyHandler).toBeDefined();
        topologyHandler?.();

        mockConnect.mockClear();
        await connectToTestDatabase();
        expect(mockConnect).toHaveBeenCalledTimes(1);

        await closeTestDatabaseConnection();
        expect(mockClose).toHaveBeenCalled();
    });
});
