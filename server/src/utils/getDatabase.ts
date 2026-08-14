import { Db } from 'mongodb';
import { connectToDatabase } from './mongo';
import { connectToTestDatabase } from './testMongo';

export async function getDatabase(): Promise<Db> {
    return process.env.NODE_ENV === 'test'
        ? await connectToTestDatabase()
        : await connectToDatabase();
}
