import { Router, Response } from 'express';
import { connectToDatabase } from '../utils/mongo';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { AIService, UserProgress } from '../services/ai';
import { ObjectId } from 'mongodb';
import { WordProgress } from '../interface/WordProgress';
import { QuizAttempt } from '../interface/Quiz';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.use(authMiddleware);

// Get learning progress
router.get('/progress', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const db = await connectToDatabase();

  // Get user's learning statistics
  const learningStats = await db.collection('LearningStats').find({ userId }).sort({ date: -1 }).limit(30).toArray();

  // Get word progress - grouped by wordId to get the most recent progress for each word
  const wordProgress = await db.collection('WordProgress').aggregate<WordProgress>([
    { $match: { userId } },
    { $sort: { lastReviewed: -1 } },
    {
      $group: {
        _id: '$wordId',
        doc: { $first: '$$ROOT' }
      }
    },
    {
      $replaceRoot: { newRoot: '$doc' }
    },
    {
      $lookup: {
        from: 'Word',
        localField: 'wordId',
        foreignField: '_id',
        as: 'word'
      }
    },
    { $unwind: { path: '$word', preserveNullAndEmptyArrays: true } }
  ]).toArray();

  // Get all quiz attempts
  const allAttempts = await db.collection('QuizAttempt').find({ userId }).sort({ createdAt: -1 }).toArray() as unknown as QuizAttempt[];
  const recentAttempts = allAttempts.slice(0, 10);

  interface LearningStatsDocument {
    date: Date;
  }

  // Optimized streak calculation
  const recentStats = await db.collection('LearningStats')
    .find({ userId })
    .sort({ date: -1 })
    .limit(365) // Fetch enough history to calculate streak
    .toArray() as unknown as LearningStatsDocument[];

  let currentStreak = 0;
  const today = new Date();

  const toMidnight = (d: Date) => {
    const newD = new Date(d);
    newD.setHours(0, 0, 0, 0);
    return newD.getTime();
  };

  const todayTime = toMidnight(today);
  const yesterdayTime = todayTime - 86400000;

  if (recentStats.length > 0) {
    const lastActivityDate = toMidnight(recentStats[0]!.date);

    // Streak is valid if last activity was today or yesterday
    if (lastActivityDate === todayTime || lastActivityDate === yesterdayTime) {
      currentStreak = 1;
      let previousDate = lastActivityDate;

      for (let i = 1; i < recentStats.length; i++) {
        const currentDate = toMidnight(recentStats[i]!.date);

        if (currentDate === previousDate) continue;

        if (previousDate - currentDate === 86400000) {
          currentStreak++;
          previousDate = currentDate;
        } else {
          break;
        }
      }
    }
  }

  // Calculate summary statistics
  const totalWords = wordProgress.length;
  const masteredWords = wordProgress.filter((wp: WordProgress) => wp.mastery == 1.0).length;
  const needsReview = wordProgress.filter((wp: WordProgress) => wp.mastery < 1.0).length;
  const totalQuizzesTaken = allAttempts.length;
  const avgScore = recentAttempts.length > 0
    ? recentAttempts.reduce((sum: number, attempt: QuizAttempt) => sum + (attempt.score || 0), 0) / recentAttempts.length
    : 0;

  // Get max streak from word progress (for comparison)
  const maxWordStreak = wordProgress.reduce((max: number, wp: WordProgress) => Math.max(max, wp.streak || 0), 0);

  res.json({
    summary: {
      totalWords,
      masteredWords,
      needsReview,
      currentStreak,
      maxWordStreak,
      totalQuizzesTaken,
      avgScore,
    },
    learningStats,
    wordProgress,
    recentAttempts
  });
}));

// Get AI-powered recommendations
router.get('/recommendations', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const db = await connectToDatabase();
  const userProgress = await db.collection('WordProgress').aggregate<WordProgress[]>([
    { $match: { userId } },
    {
      $lookup: {
        from: 'Word',
        localField: 'wordId',
        foreignField: '_id',
        as: 'word'
      }
    },
    { $unwind: { path: '$word', preserveNullAndEmptyArrays: true } }
  ]).toArray() as unknown as WordProgress[];
  const recentAttempts = await db.collection('QuizAttempt').find({ userId }).sort({ createdAt: -1 }).limit(20).toArray();
  const performanceData = [];
  for (const attempt of recentAttempts) {
    const answers = await db.collection('QuizAnswer').find({ attemptId: attempt._id.toString() }).toArray();
    for (const answer of answers) {
      const question = await db.collection('QuizQuestion').findOne({ _id: new ObjectId(answer.questionId) });
      performanceData.push({
        wordId: question?.wordId || '',
        score: answer.isCorrect ? 1 : 0,
        date: answer.createdAt
      });
    }
  }
  const progressData: UserProgress[] = userProgress.map((wp: WordProgress) => ({
    userId,
    wordId: wp.wordId,
    mastery: wp.mastery,
    reviewCount: wp.reviewCount,
    streak: wp.streak,
    lastReviewed: wp.lastReviewed ? new Date(wp.lastReviewed) : undefined
  }));
  const recommendations = await AIService.generateRecommendations(
    userId,
    progressData,
    performanceData
  );
  const recommendedWordIds = (recommendations.recommendedWords || []).filter(
    (id: string) => typeof id === 'string' && /^[a-fA-F0-9]{24}$/.test(id)
  );
  const recommendedWords = recommendedWordIds.length > 0
    ? await db.collection('Word').find({ _id: { $in: recommendedWordIds.map((id: string) => new ObjectId(id)) } }).toArray()
    : [];
  res.json({
    ...recommendations,
    recommendedWords
  });
}));

export default router; 