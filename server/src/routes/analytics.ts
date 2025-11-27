import { Router, Response } from 'express';
import { connectToDatabase } from '../utils/mongo';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { AIService } from '../services/ai';
import { ObjectId } from 'mongodb';

const router = Router();

router.use(authMiddleware);

// Get learning progress
router.get('/progress', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const db = await connectToDatabase();
    
    // Get user's learning statistics
    const learningStats = await db.collection('LearningStats').find({ userId }).sort({ date: -1 }).limit(30).toArray();

    // Get word progress
    const wordProgress = await db.collection('WordProgress').aggregate([
      { $match: { userId } },
      {
        $lookup: {
          from: 'Word',
          localField: 'wordId',
          foreignField: '_id',
          as: 'word'
        }
      },
      { $unwind: { path: '$word', preserveNullAndEmptyArrays: true } },
      { $sort: { lastReviewed: -1 } }
    ]).toArray();
    
    // Get all quiz attempts
    const allAttempts = await db.collection('QuizAttempt').find({ userId }).sort({ createdAt: -1 }).toArray();
    const recentAttempts = allAttempts.slice(0, 10);
    
    // Calculate current streak (consecutive days with activity)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let currentStreak = 0;
    let checkDate = new Date(today);
    
    // Check for activity in the last 30 days to find current streak
    for (let i = 0; i < 30; i++) {
      const startOfDay = new Date(checkDate);
      const endOfDay = new Date(checkDate);
      endOfDay.setHours(23, 59, 59, 999);
      
      // Check if there was any activity on this day (quizzes or word progress updates)
      const dayActivity = await db.collection('LearningStats').findOne({
        userId,
        date: { $gte: startOfDay, $lte: endOfDay }
      });
      
      if (dayActivity) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break; // Streak broken
      }
    }
    
    // Calculate summary statistics
    const totalWords = wordProgress.length;
    const masteredWords = wordProgress.filter((wp: any) => wp.mastery == 1.0).length;
    const needsReview = wordProgress.filter((wp: any) => wp.mastery < 1.0).length;
    const totalQuizzesTaken = allAttempts.length;
    const avgScore = recentAttempts.length > 0
      ? recentAttempts.reduce((sum: number, attempt: any) => sum + (attempt.score || 0), 0) / recentAttempts.length
      : 0;
    
    // Get max streak from word progress (for comparison)
    const maxWordStreak = wordProgress.reduce((max: number, wp: any) => Math.max(max, wp.streak || 0), 0);
    
    return res.json({
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
  } catch (error) {
    console.error('Error fetching progress:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get AI-powered recommendations
router.get('/recommendations', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const db = await connectToDatabase();
    const userProgress = await db.collection('WordProgress').aggregate([
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
    const progressData = userProgress.map((wp: any) => ({
      userId,
      wordId: wp.wordId,
      mastery: wp.mastery,
      reviewCount: wp.reviewCount,
      streak: wp.streak,
      lastReviewed: wp.lastReviewed
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
  } catch (error) {
    console.error('Error generating recommendations:', error);
    res.status(500).json({ error: 'Failed to generate recommendations' });
  }
});

// Get adaptive difficulty suggestions
router.get('/adaptive-difficulty', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const db = await connectToDatabase();
    // Get user progress
    const userProgress = await db.collection('WordProgress').aggregate([
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
    const progressData = userProgress.map((wp: any) => ({
      userId,
      wordId: wp.word?._id?.toString() || '',
      mastery: wp.mastery,
      reviewCount: wp.reviewCount,
      streak: wp.streak,
      lastReviewed: wp.lastReviewed
    }));
    const adaptiveDifficulty = await AIService.calculateAdaptiveDifficulty(progressData);
    res.json({
      recommendedDifficulty: adaptiveDifficulty.recommendedDifficulty,
      nextReviewDate: adaptiveDifficulty.nextReviewDate,
      currentProgress: {
        totalWords: userProgress.length,
        avgMastery: userProgress.reduce((sum: number, wp: any) => sum + wp.mastery, 0) / userProgress.length,
        avgStreak: userProgress.reduce((sum: number, wp: any) => sum + wp.streak, 0) / userProgress.length
      }
    });
  } catch (error) {
    console.error('Error calculating adaptive difficulty:', error);
    res.status(500).json({ error: 'Failed to calculate adaptive difficulty' });
  }
});

// Get spaced repetition schedule
router.get('/spaced-repetition', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const db = await connectToDatabase();
    // Get words that need review
    const wordsToReview = await db.collection('WordProgress').find({
      userId,
      $or: [
        { nextReview: { $lte: new Date() } },
        { nextReview: null }
      ]
    }).toArray();

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
          'question.wordId': { $in: wordsToReview.map((w: any) => new ObjectId(w.wordId)) }
        }
      },
      { $sort: { createdAt: -1 } }
    ]).toArray();

    // Optimize spaced repetition for each word
    const optimizedSchedule = await Promise.all(
      wordsToReview.map(async (wordProgress: any) => {
        const wordHistory: { score: number; date: Date }[] = performanceHistory
          .filter((p: any) => p.question?.wordId?.toString() === wordProgress.wordId)
          .map((p: any) => ({
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
            lastReviewed: wordProgress.lastReviewed instanceof Date ? wordProgress.lastReviewed : (wordProgress.lastReviewed ? new Date(wordProgress.lastReviewed) : undefined)
          },
          wordHistory
        );

        return {
          wordId: wordProgress.wordId,
          word: wordProgress.word?.word || '',
          translation: wordProgress.word?.translation || '',
          currentMastery: wordProgress.mastery,
          nextReviewDate: optimization.nextReviewDate,
          interval: optimization.interval,
          priority: wordProgress.mastery < 1.0 ? 'high' : 'medium'
        };
      })
    );

    // Sort by priority and next review date
    const sortedSchedule = optimizedSchedule.sort((a: any, b: any) => {
      if (a.priority === 'high' && b.priority !== 'high') return -1;
      if (b.priority === 'high' && a.priority !== 'high') return 1;
      return new Date(a.nextReviewDate).getTime() - new Date(b.nextReviewDate).getTime();
    });

    res.json({
      wordsToReview: sortedSchedule,
      totalWords: sortedSchedule.length,
      highPriority: sortedSchedule.filter((w: any) => w.priority === 'high').length
    });
  } catch (error) {
    console.error('Error generating spaced repetition schedule:', error);
    res.status(500).json({ error: 'Failed to generate spaced repetition schedule' });
  }
});

// Get learning insights and trends
router.get('/insights', async (req: AuthRequest, res: Response) => {
  try {
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
    const difficultyStats = await db.collection('Quiz').find({ userId }).toArray();

    const difficultyDistribution = difficultyStats.reduce((acc: Record<string, number>, quiz: any) => {
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
  } catch (error) {
    console.error('Error generating insights:', error);
    res.status(500).json({ error: 'Failed to generate insights' });
  }
});

export default router; 