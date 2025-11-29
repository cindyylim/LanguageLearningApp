import { MongoClient, Db } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI as string;

// 1. Basic Validation
if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable');
}

// 2. Global Cache Variables
// We cache the Promise, not just the connection. This prevents
// "Race Conditions" where 5 requests hit the server at once and 
// all try to open a connection simultaneously.
let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

// This variable will hold the promise of the connection
let connectionPromise: Promise<{ client: MongoClient; db: Db }> | null = null;

export async function connectToDatabase(): Promise<Db> {
  // A. If we are already connected, return the cached DB immediately.
  if (cachedDb) {
    return cachedDb;
  }

  // B. If a connection is currently in progress, wait for it.
  //    This handles the "thundering herd" problem on server startup.
  if (connectionPromise) {
    const { db } = await connectionPromise;
    return db;
  }

  // C. Otherwise, start a new connection.
  connectionPromise = (async () => {
    try {
      if (!cachedClient) {
        cachedClient = new MongoClient(MONGODB_URI, {
          serverSelectionTimeoutMS: 5000,
          maxPoolSize: 10,
        });
        // CLEAR CACHE ON ERROR
        cachedClient.on('topologyClosed', () => {
          console.warn('MongoDB topology closed. Clearing cache.');
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
      // If connection fails, clear the promise so the next request can try again
      connectionPromise = null;
      throw error;
    }
  })();

  const { db } = await connectionPromise;
  return db;
}