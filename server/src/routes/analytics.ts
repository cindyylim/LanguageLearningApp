import { Router, Response } from 'express';
import { connectToDatabase } from '../utils/mongo';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { AIService, UserProgress } from '../services/ai';
import { ObjectId } from 'mongodb';
import { WordProgress } from '../interface/WordProgress';
import { WordSchedule } from '../interface/WordSchedule';
import { Quiz, QuizAttempt, QuizAnswerWithQuestion } from '../interface/Quiz';
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

// Get adaptive difficulty suggestions
router.get('/adaptive-difficulty', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const db = await connectToDatabase();
  // Get user progress
  const userProgress = await db.collection('WordProgress').aggregate<WordProgress>([
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
  ]).toArray();
  const progressData: UserProgress[] = userProgress.map((wp: WordProgress) => ({
    userId,
    wordId: wp.wordId?.toString() || '',
    mastery: wp.mastery,
    reviewCount: wp.reviewCount,
    streak: wp.streak,
    lastReviewed: wp.lastReviewed ? new Date(wp.lastReviewed) : undefined
  }));
  const adaptiveDifficulty = await AIService.calculateAdaptiveDifficulty(progressData);
  res.json({
    recommendedDifficulty: adaptiveDifficulty.recommendedDifficulty,
    nextReviewDate: adaptiveDifficulty.nextReviewDate,
    currentProgress: {
      totalWords: userProgress.length,
      avgMastery: userProgress.reduce((sum: number, wp: WordProgress) => sum + wp.mastery, 0) / userProgress.length,
      avgStreak: userProgress.reduce((sum: number, wp: WordProgress) => sum + wp.streak, 0) / userProgress.length
    }
  });
}));

// Get spaced repetition schedule
router.get('/spaced-repetition', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const db = await connectToDatabase();
  // Get words that need review
  const wordsToReview = await db.collection('WordProgress').find({
    userId,
    $or: [
      { nextReview: { $lte: new Date() } },
      { nextReview: null }
    ]
  }).toArray() as unknown as WordProgress[];

  // Get performance history for optimization
  const performanceHistory = await db.collection('QuizAnswer').aggregate([
    {
      $match: {
        attempt: { userId }
      }
    },
    {
      $lookup: {
        from: 'QuizQuestion',
        localField: 'questionId',
        foreignField: '_id',
        as: 'question'
      }
    },
    { $unwind: { path: '$question', preserveNullAndEmptyArrays: true } },
    {
      $match: {
        'question.wordId': { $in: wordsToReview.map((w: WordProgress) => new ObjectId(w.wordId)) }
      }
    },
    { $sort: { createdAt: -1 } }
  ]).toArray() as unknown as QuizAnswerWithQuestion[];

  // Optimize spaced repetition for each word
  const optimizedSchedule: WordSchedule[] = await Promise.all(
    wordsToReview.map(async (wordProgress: WordProgress) => {
      const wordHistory: { score: number; date: Date }[] = performanceHistory
        .filter((p: QuizAnswerWithQuestion) => p.question?.wordId?.toString() === wordProgress.wordId)
        .map((p: QuizAnswerWithQuestion) => ({
          score: p.isCorrect ? 1 : 0,
          date: p.createdAt instanceof Date ? p.createdAt : new Date(p.createdAt)
        }));

      const optimization = await AIService.optimizeSpacedRepetition(
        {
          userId,
          wordId: wordProgress.wordId.toString(),
          mastery: wordProgress.mastery,
          reviewCount: wordProgress.reviewCount,
          streak: wordProgress.streak,
          lastReviewed: wordProgress.lastReviewed ? new Date(wordProgress.lastReviewed) : undefined
        },
        wordHistory
      );

      return {
        wordId: wordProgress.wordId,
        currentMastery: wordProgress.mastery,
        nextReviewDate: optimization.nextReviewDate,
        interval: optimization.interval,
        priority: wordProgress.mastery < 1.0 ? 'high' : 'medium'
      };
    })
  );

  // Sort by priority and next review date
  const sortedSchedule = optimizedSchedule.sort((a: WordSchedule, b: WordSchedule) => {
    if (a.priority === 'high' && b.priority !== 'high') return -1;
    if (b.priority === 'high' && a.priority !== 'high') return 1;
    return new Date(a.nextReviewDate).getTime() - new Date(b.nextReviewDate).getTime();
  });

  res.json({
    wordsToReview: sortedSchedule,
    totalWords: sortedSchedule.length,
    highPriority: sortedSchedule.filter((w: WordSchedule) => w.priority === 'high').length
  });
}));

// Get learning insights and trends
router.get('/insights', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const db = await connectToDatabase();
  // Get learning stats for the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentStats = await db.collection('LearningStats').find({
    userId,
    date: { $gte: thirtyDaysAgo }
  }).sort({ date: 1 }).toArray();

  // Get quiz attempts for trend analysis
  const recentAttempts = await db.collection('QuizAttempt').find({
    userId,
    createdAt: { $gte: thirtyDaysAgo }
  }).sort({ createdAt: 1 }).toArray();

  // Calculate trends
  let scoreTrend = 0;
  if (recentAttempts.length >= 2) {
    const first = recentAttempts[0];
    const last = recentAttempts[recentAttempts.length - 1];
    if (first && last) {
      scoreTrend = (last.score ?? 0) - (first.score ?? 0);
    }
  }

  // Get difficulty distribution
  const difficultyStats = await db.collection('Quiz').find({ userId }).toArray() as unknown as Quiz[];

  const difficultyDistribution = difficultyStats.reduce((acc: Record<string, number>, quiz: Quiz) => {
    acc[quiz.difficulty] = (acc[quiz.difficulty] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Get most challenging words
  const challengingWords = await db.collection('WordProgress').find({
    userId,
    mastery: { $lt: 1.0 }
  }).sort({ mastery: 1 }).limit(5).toArray();

  res.json({
    trends: {
      scoreTrend,
      totalQuizzesTaken: recentAttempts.length,
      consistencyScore: recentStats.length / 30 // Days with activity
    },
    difficultyDistribution,
    challengingWords,
    recommendations: {
      focusOnWeakWords: challengingWords && challengingWords.length > 0,
      tryHarderQuestions: typeof scoreTrend === 'number' && scoreTrend > 0.1 // Improving performance
    }
  });
}));

export default router; 