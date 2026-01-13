import { Router, Request, Response, NextFunction } from 'express';
import { seedTestDatabase, cleanupTestData, resetTestDatabase } from '../utils/testDb';
import { asyncHandler } from '../utils/asyncHandler';
import { connectToTestDatabase } from '../utils/testMongo';

const router: Router = Router();

// Middleware to ensure these endpoints are only available in test environment
const testOnlyMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Test database endpoints are not available in production' });
  }
  return next();
};

router.use(testOnlyMiddleware);

// Seed test database
router.post('/seed', asyncHandler(async (req: Request, res: Response) => {
  await seedTestDatabase();
  return res.json({ message: 'Test database seeded successfully' });
}));

// Clean up test data
router.post('/cleanup', asyncHandler(async (req: Request, res: Response) => {
  await cleanupTestData();
  return res.json({ message: 'Test data cleaned up successfully' });
}));

// Reset test database (cleanup + seed)
router.post('/reset', asyncHandler(async (req: Request, res: Response) => {
  await resetTestDatabase();
  return res.json({ message: 'Test database reset successfully' });
}));

// Delete user by email (for cleaning up unique test users)
router.post('/delete-user', asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const db = await connectToTestDatabase();

  try {
    // Find the user
    const user = await db.collection('User').findOne({ email });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete user's vocabulary lists and words
    const vocabLists = await db.collection('VocabularyList').find({
      userId: user._id
    }).toArray();

    const vocabListIds = vocabLists.map(list => list._id);

    if (vocabListIds.length > 0) {
      // Delete words in these vocabulary lists
      await db.collection('Word').deleteMany({
        listId: { $in: vocabListIds }
      });

      // Delete the vocabulary lists
      await db.collection('VocabularyList').deleteMany({
        userId: user._id
      });
    }

    // Delete user's quiz attempts and progress
    await db.collection('QuizAttempt').deleteMany({
      userId: user._id
    });

    await db.collection('WordProgress').deleteMany({
      userId: user._id
    });

    // Delete the user
    await db.collection('User').deleteOne({ _id: user._id });

    return res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    return res.status(500).json({ error: 'Failed to delete user' });
  }
}));

export default router;