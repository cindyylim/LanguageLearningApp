import { MongoClient, Db } from 'mongodb';
import { ensureIndexes } from './indexes';
import logger from './logger';

const MONGODB_URI = process.env.MONGODB_URI as string;

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable');
}

// Cache the connection promise so concurrent callers share one in-flight connect.
let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;
let connectionPromise: Promise<{ client: MongoClient; db: Db }> | null = null;
let indexesCreated = false;

export async function connectToDatabase(): Promise<Db> {
  if (cachedDb) {
    return cachedDb;
  }

  if (connectionPromise) {
    const { db } = await connectionPromise;
    return db;
  }

  connectionPromise = (async () => {
    try {
      if (!cachedClient) {
        cachedClient = new MongoClient(MONGODB_URI, {
          serverSelectionTimeoutMS: 5000,
          maxPoolSize: 10,
          minPoolSize: 2,
          maxIdleTimeMS: 30000,
        });
        cachedClient.on('topologyClosed', () => {
          logger.warn('MongoDB topology closed. Clearing cache.');
          cachedClient = null;
          cachedDb = null;
          connectionPromise = null;
          indexesCreated = false;
        });
      }
      await cachedClient.connect();
      const db = cachedClient.db();

      cachedDb = db;

      if (!indexesCreated) {
        await ensureIndexes(db);
        indexesCreated = true;
      }

      return { client: cachedClient, db };
    } catch (error) {
      connectionPromise = null;
      throw error;
    }
  })();

  const { db } = await connectionPromise;
  return db;
}
