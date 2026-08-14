import { MongoClient, Db } from 'mongodb';

// Separate TESTDB_URI so tests don't touch the application database.
// Read lazily so production/dev can import this module without TESTDB_URI set.
// Cache the connection promise so concurrent callers share one in-flight connect.
let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;
let connectionPromise: Promise<{ client: MongoClient; db: Db }> | null = null;

function getTestDbUri(): string {
  const uri = process.env.TESTDB_URI;
  if (!uri) {
    throw new Error('Please define the TESTDB_URI environment variable for test database');
  }
  return uri;
}

export async function connectToTestDatabase(): Promise<Db> {
  if (cachedDb) {
    return cachedDb;
  }

  if (connectionPromise) {
    const { db } = await connectionPromise;
    return db;
  }

  const TESTDB_URI = getTestDbUri();

  connectionPromise = (async () => {
    try {
      if (!cachedClient) {
        cachedClient = new MongoClient(TESTDB_URI, {
          serverSelectionTimeoutMS: 5000,
          maxPoolSize: 10,
          minPoolSize: 2,
          maxIdleTimeMS: 30000,
        });

        cachedClient.on('topologyClosed', () => {
          cachedClient = null;
          cachedDb = null;
          connectionPromise = null;
        });
      }

      await cachedClient.connect();
      const db = cachedClient.db();

      cachedDb = db;

      return { client: cachedClient, db };
    } catch (error) {
      connectionPromise = null;
      throw error;
    }
  })();

  const { db } = await connectionPromise;
  return db;
}

/**
 * Close the test database connection
 */
export async function closeTestDatabaseConnection(): Promise<void> {
  if (cachedClient) {
    await cachedClient.close();
    cachedClient = null;
    cachedDb = null;
    connectionPromise = null;
  }
}
