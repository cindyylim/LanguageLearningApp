describe('connectToDatabase', () => {
  const originalMongoUri = process.env.MONGODB_URI;

  afterEach(() => {
    if (originalMongoUri === undefined) {
      delete process.env.MONGODB_URI;
    } else {
      process.env.MONGODB_URI = originalMongoUri;
    }
    jest.resetModules();
    jest.dontMock('mongodb');
    jest.dontMock('./indexes');
  });

  it('throws when MONGODB_URI is not defined at import', () => {
    delete process.env.MONGODB_URI;
    jest.resetModules();

    expect(() => {
      require('./mongo');
    }).toThrow('Please define the MONGODB_URI environment variable');
  });

  it('connects once and ensures indexes on first call', async () => {
    const mockConnect = jest.fn().mockResolvedValue(undefined);
    const mockDb = { name: 'app-db' };
    const mockOn = jest.fn();
    const mockEnsureIndexes = jest.fn().mockResolvedValue(undefined);

    jest.resetModules();
    jest.doMock('mongodb', () => ({
      MongoClient: jest.fn().mockImplementation(() => ({
        connect: mockConnect,
        db: jest.fn().mockReturnValue(mockDb),
        on: mockOn,
      })),
    }));
    jest.doMock('./indexes', () => ({
      ensureIndexes: mockEnsureIndexes,
    }));
    jest.doMock('./logger', () => ({
      __esModule: true,
      default: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
    }));

    process.env.MONGODB_URI = 'mongodb://localhost:27017/language-learning';

    const { connectToDatabase } = require('./mongo');
    const first = await connectToDatabase();
    const second = await connectToDatabase();

    expect(first).toBe(mockDb);
    expect(second).toBe(mockDb);
    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockEnsureIndexes).toHaveBeenCalledTimes(1);
    expect(mockEnsureIndexes).toHaveBeenCalledWith(mockDb);
    expect(mockOn).toHaveBeenCalledWith('topologyClosed', expect.any(Function));
  });

  it('clears cache when topology closes', async () => {
    const mockConnect = jest.fn().mockResolvedValue(undefined);
    const mockDb = { name: 'app-db' };
    let topologyHandler: (() => void) | undefined;
    const mockOn = jest.fn((_event: string, handler: () => void) => {
      topologyHandler = handler;
    });
    const mockEnsureIndexes = jest.fn().mockResolvedValue(undefined);

    jest.resetModules();
    jest.doMock('mongodb', () => ({
      MongoClient: jest.fn().mockImplementation(() => ({
        connect: mockConnect,
        db: jest.fn().mockReturnValue(mockDb),
        on: mockOn,
      })),
    }));
    jest.doMock('./indexes', () => ({
      ensureIndexes: mockEnsureIndexes,
    }));
    jest.doMock('./logger', () => ({
      __esModule: true,
      default: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
    }));

    process.env.MONGODB_URI = 'mongodb://localhost:27017/language-learning';

    const { connectToDatabase } = require('./mongo');
    await connectToDatabase();

    expect(topologyHandler).toBeDefined();
    topologyHandler?.();

    mockEnsureIndexes.mockClear();
    mockConnect.mockClear();

    await connectToDatabase();

    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockEnsureIndexes).toHaveBeenCalledTimes(1);
  });

  it('clears connection promise when connect fails', async () => {
    const mockConnect = jest
      .fn()
      .mockRejectedValueOnce(new Error('connect failed'))
      .mockResolvedValue(undefined);
    const mockDb = { name: 'app-db' };
    const mockOn = jest.fn();
    const mockEnsureIndexes = jest.fn().mockResolvedValue(undefined);

    jest.resetModules();
    jest.doMock('mongodb', () => ({
      MongoClient: jest.fn().mockImplementation(() => ({
        connect: mockConnect,
        db: jest.fn().mockReturnValue(mockDb),
        on: mockOn,
      })),
    }));
    jest.doMock('./indexes', () => ({
      ensureIndexes: mockEnsureIndexes,
    }));
    jest.doMock('./logger', () => ({
      __esModule: true,
      default: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
    }));

    process.env.MONGODB_URI = 'mongodb://localhost:27017/language-learning';

    const { connectToDatabase } = require('./mongo');

    await expect(connectToDatabase()).rejects.toThrow('connect failed');
    await expect(connectToDatabase()).resolves.toBe(mockDb);
    expect(mockConnect).toHaveBeenCalledTimes(2);
  });
});
