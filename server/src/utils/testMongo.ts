import { MongoClient, Db } from 'mongodb';

// Test database connection utility
// This uses a separate TESTDB_URI environment variable to avoid conflicts
// with the main application database

const TESTDB_URI = process.env.TESTDB_URI as string;

// 1. Basic Validation
if (!TESTDB_URI) {
  throw new Error('Please define the TESTDB_URI environment variable for test database');
}

// 2. Global Cache Variables
let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

// This variable will hold the promise of the connection
let connectionPromise: Promise<{ client: MongoClient; db: Db }> | null = null;

export async function connectToTestDatabase(): Promise<Db> {
  // A. If we are already connected, return the cached DB immediately.
  if (cachedDb) {
    return cachedDb;
  }

  // B. If a connection is currently in progress, wait for it.
  if (connectionPromise) {
    const { db } = await connectionPromise;
    return db;
  }

  // C. Otherwise, start a new connection.
  connectionPromise = (async () => {
    try {
      if (!cachedClient) {
        cachedClient = new MongoClient(TESTDB_URI, {
          serverSelectionTimeoutMS: 5000,
          maxPoolSize: 10,
          minPoolSize: 2,
          maxIdleTimeMS: 30000,
        });
        
        // CLEAR CACHE ON ERROR
        cachedClient.on('topologyClosed', () => {
          cachedClient = null;
          cachedDb = null;
          connectionPromise = null;
        });
      }

      await cachedClient.connect();
      const db = cachedClient.db();

      // Save to cache for future use
      cachedDb = db;

      return { client: cachedClient, db };
    } catch (error) {
      // If connection fails, clear the promise so the next request can try again.
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