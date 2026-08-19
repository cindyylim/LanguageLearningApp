const mockConnectToDatabase = jest.fn();
const mockConnectToTestDatabase = jest.fn();

jest.mock('./mongo', () => ({
  connectToDatabase: (...args: unknown[]) => mockConnectToDatabase(...args),
}));

jest.mock('./testMongo', () => ({
  connectToTestDatabase: (...args: unknown[]) => mockConnectToTestDatabase(...args),
}));

import { getDatabase } from './getDatabase';

describe('getDatabase', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    mockConnectToDatabase.mockResolvedValue({ name: 'app-db' });
    mockConnectToTestDatabase.mockResolvedValue({ name: 'test-db' });
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('uses test database connection in test environment', async () => {
    process.env.NODE_ENV = 'test';

    const db = await getDatabase();

    expect(db).toEqual({ name: 'test-db' });
    expect(mockConnectToTestDatabase).toHaveBeenCalled();
    expect(mockConnectToDatabase).not.toHaveBeenCalled();
  });

  it('uses application database connection outside test environment', async () => {
    process.env.NODE_ENV = 'development';

    const db = await getDatabase();

    expect(db).toEqual({ name: 'app-db' });
    expect(mockConnectToDatabase).toHaveBeenCalled();
    expect(mockConnectToTestDatabase).not.toHaveBeenCalled();
  });
});
