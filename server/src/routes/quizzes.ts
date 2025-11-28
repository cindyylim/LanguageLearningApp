import { Router, Response } from 'express';
import { z } from 'zod';
import { connectToDatabase } from '../utils/mongo';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { AIService, Question } from '../services/ai';
import { ObjectId } from 'mongodb';
import { Quiz, QuizAnswerWithQuestion, QuizQuestion } from '../interface/Quiz';
import { Word } from '../interface/Word';
import { Answer } from '../interface/Answer';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { validateObjectId } from '../middleware/validateObjectId';

const router = Router();

router.use(authMiddleware);

const generateQuizSchema = z.object({
  vocabularyListId: z.string(),
  questionCount: z.number().min(1).max(20).optional().default(10),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional().default('medium'),
});

const submitQuizSchema = z.object({
  answers: z.array(z.object({
    questionId: z.string(),
    answer: z.string()
  }))
});

type QuizAnswerInput = z.infer<typeof submitQuizSchema>['answers'][number];

// Generate AI-powered quiz
router.post('/generate', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { vocabularyListId, questionCount, difficulty } = generateQuizSchema.parse(req.body);
  const db = await connectToDatabase();
  // Get vocabulary list with words
  const vocabularyList = await db.collection('VocabularyList').findOne({ _id: new ObjectId(vocabularyListId), userId: req.user!.id });
  if (!vocabularyList) {
    throw new AppError('Vocabulary list not found', 404);
  }
  const words = await db.collection('Word').find({ vocabularyListId: new ObjectId(vocabularyListId) }).toArray() as unknown as Word[];
  if (words.length === 0) {
    throw new AppError('No words in vocabulary list', 400);
  }
  // Generate questions using AI
  const aiQuestions: Question[] = await AIService.generateQuestions(
    words.map((w: Word) => ({
      id: w._id.toString(),
      word: w.word,
      translation: w.translation,
      partOfSpeech: w.partOfSpeech || undefined,
      difficulty: w.difficulty
    })),
    vocabularyList.targetLanguage,
    vocabularyList.nativeLanguage || 'en',
    questionCount,
    difficulty
  );
  // Create quiz in database
  const now = new Date();
  const quizResult = await db.collection('Quiz').insertOne({
    title: `Quiz: ${vocabularyList.name}`,
    description: `AI-generated quiz from ${vocabularyList.name}`,
    difficulty,
    questionCount,
    userId: req.user!.id,
    createdAt: now,
    updatedAt: now
  });
  const quizId = quizResult.insertedId.toString();
  // Create quiz questions
  const quizQuestions = await Promise.all(
    aiQuestions.map(async (aiQuestion: Question) => {
      const result = await db.collection('QuizQuestion').insertOne({
        question: aiQuestion.question,
        type: aiQuestion.type,
        correctAnswer: aiQuestion.correctAnswer,
        options: aiQuestion.options ? JSON.stringify(aiQuestion.options) : null,
        context: aiQuestion.context,
        difficulty: aiQuestion.difficulty,
        quizId: quizId,
        wordId: aiQuestion.wordId,
        createdAt: now
      });
      return await db.collection('QuizQuestion').findOne({ _id: result.insertedId });
    })
  );
  const quiz = await db.collection('Quiz').findOne({ _id: quizResult.insertedId });
  res.status(201).json({ quiz: { ...quiz, questions: quizQuestions } });
}));

// Get user's quizzes
router.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const db = await connectToDatabase();
  const quizzes = await db.collection('Quiz').find({ userId: req.user!.id }).sort({ createdAt: -1 }).toArray() as unknown as Quiz[];
  // For each quiz, get questions and last attempt
  const quizzesWithDetails = await Promise.all(
    quizzes.map(async (quiz: Quiz) => {
      const questions = await db.collection('QuizQuestion').find({ quizId: quiz._id.toString() }).toArray();
      const attempts = await db.collection('QuizAttempt').find({ quizId: quiz._id.toString(), userId: req.user!.id }).sort({ createdAt: -1 }).limit(1).toArray();
      return {
        ...quiz,
        questions,
        attempts,
        _count: { questions: questions.length, attempts: attempts.length }
      };
    })
  );
  res.json({ quizzes: quizzesWithDetails });
}));

// Get specific quiz
router.get('/:id', validateObjectId(), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const db = await connectToDatabase();
  const quiz = await db.collection('Quiz').findOne({ _id: new ObjectId(id), userId: req.user!.id });
  if (!quiz) {
    throw new AppError('Quiz not found', 404);
  }
  const questions = await db.collection('QuizQuestion').find({ quizId: id }).toArray();
  res.json({ quiz: { ...quiz, questions } });
}));

// Submit quiz answers
router.post('/:id/submit', validateObjectId(), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { answers } = submitQuizSchema.parse(req.body);
  const db = await connectToDatabase();
  const quiz = await db.collection('Quiz').findOne({ _id: new ObjectId(id), userId: req.user!.id });
  if (!quiz) {
    throw new AppError('Quiz not found', 404);
  }
  const questions = await db.collection('QuizQuestion').find({ quizId: id }).toArray() as unknown as QuizQuestion[];
  let correctAnswers = 0;
  const totalQuestions = questions.length;
  const processedAnswers = answers.map((answer: QuizAnswerInput) => {
    const question = questions.find((q: QuizQuestion) => q._id.toString() === answer.questionId);
    if (!question) throw new AppError(`Question ${answer.questionId} not found`, 404);
    const isCorrect = answer.answer.toLowerCase().trim() === question.correctAnswer.toLowerCase().trim();
    if (isCorrect) correctAnswers++;
    return {
      answer: answer.answer,
      isCorrect,
      questionId: answer.questionId,
      wordId: question.wordId // Add wordId for progress tracking
    };
  });

  // Update word progress for each unique word (group by wordId to avoid duplicates)
  const wordProgressMap = new Map<string, { correct: number; total: number }>();

  // Group answers by wordId
  processedAnswers.forEach((processedAnswer: Answer) => {
    if (processedAnswer.wordId) {
      const wordId = processedAnswer.wordId;
      if (!wordProgressMap.has(wordId)) {
        wordProgressMap.set(wordId, { correct: 0, total: 0 });
      }
      const stats = wordProgressMap.get(wordId)!;
      stats.total++;
      if (processedAnswer.isCorrect) {
        stats.correct++;
      }
    }
  });

  // Process each unique wordId only once
  const now = new Date();
  await Promise.all(
    Array.from(wordProgressMap.entries()).map(async ([wordId, stats]) => {
      if (typeof wordId !== 'string' || wordId.length !== 24) {
        console.warn(`Skipping progress update due to invalid wordId format: ${wordId}`);
        return;
      }
      // Check if the word exists in the Word database
      const wordExists = await db.collection('Word').findOne({ _id: new ObjectId(wordId) });

      // Skip if word doesn't exist (may have been deleted)
      if (!wordExists) {
        console.warn(`Skipping progress update for non-existent word: ${wordId}`);
        return;
      }

      const existingProgress = await db.collection('WordProgress').findOne({
        userId: req.user!.id,
        wordId: wordId
      });

      // Calculate average correctness for this word in this quiz
      const avgCorrectness = stats.total > 0 ? stats.correct / stats.total : 0;
      const isCorrect = avgCorrectness >= 0.5; // Consider correct if at least 50% correct

      if (existingProgress) {
        // Update existing progress
        const newReviewCount = existingProgress.reviewCount + stats.total;
        const newStreak = isCorrect ? existingProgress.streak + 1 : 0;

        // Calculate new mastery level (0-1 scale)
        // Increase mastery based on average correctness
        let newMastery = existingProgress.mastery;
        if (avgCorrectness > 0.5) {
          newMastery = Math.min(1, newMastery + 0.05);
        } else {
          newMastery = Math.max(0, newMastery - 0.2);
        }

        // Calculate next review date based on spaced repetition
        const interval = Math.min(1, Math.floor(newMastery * 7)); // 1-7 days based on mastery
        const nextReview = new Date(now.getTime() + interval * 24 * 60 * 60 * 1000);

        await db.collection('WordProgress').updateOne(
          { _id: existingProgress._id },
          {
            $set: {
              mastery: newMastery,
              status: newMastery < 1.0 ? 'learning' : 'mastered',
              reviewCount: newReviewCount,
              streak: newStreak,
              lastReviewed: now,
              nextReview: nextReview,
              updatedAt: now
            }
          }
        );
      } else {
        // Create new progress record
        const initialMastery = avgCorrectness;
        const interval = Math.min(1, Math.floor(initialMastery * 7));
        const nextReview = new Date(now.getTime() + interval * 24 * 60 * 60 * 1000);

        await db.collection('WordProgress').insertOne({
          userId: req.user!.id,
          wordId: wordId,
          mastery: initialMastery,
          status: initialMastery < 1.0 ? 'learning' : 'mastered',
          reviewCount: stats.total,
          streak: isCorrect ? 1 : 0,
          lastReviewed: now,
          nextReview: nextReview,
          createdAt: now,
          updatedAt: now
        });
      }
    })
  );

  const attemptResult = await db.collection('QuizAttempt').insertOne({
    score: totalQuestions > 0 ? correctAnswers / totalQuestions : 0,
    completed: true,
    userId: req.user!.id,
    quizId: id,
    createdAt: new Date()
  });

  // Update daily learning stats
  const today = new Date();
  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);

  const nextDay = new Date(startOfDay);
  nextDay.setDate(nextDay.getDate() + 1);

  const existingStats = await db.collection('LearningStats').findOne({
    userId: req.user!.id,
    date: { $gte: startOfDay, $lt: nextDay }
  });

  if (existingStats) {
    await db.collection('LearningStats').updateOne(
      { _id: existingStats._id },
      {
        $inc: {
          quizzesTaken: 1,
          totalQuestions: totalQuestions,
          correctAnswers: correctAnswers,
        },
        $set: {
          updatedAt: new Date()
        }
      }
    );
  } else {
    await db.collection('LearningStats').insertOne({
      userId: req.user!.id,
      date: today,
      quizzesTaken: 1,
      totalQuestions: totalQuestions,
      correctAnswers: correctAnswers,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  // Store answers
  await Promise.all(
    processedAnswers.map(async (processedAnswer: Answer) => {
      await db.collection('QuizAnswer').insertOne({
        answer: processedAnswer.answer,
        isCorrect: processedAnswer.isCorrect,
        attemptId: attemptResult.insertedId.toString(),
        questionId: processedAnswer.questionId,
        userId: req.user!.id,
        createdAt: new Date()
      });
    })
  );

  res.json({
    attempt: {
      id: attemptResult.insertedId.toString(),
      score: totalQuestions > 0 ? correctAnswers / totalQuestions : 0,
      completed: true,
      correctAnswers,
      totalQuestions,
      answers: processedAnswers
    }
  });
}));

// Get quiz results
router.get('/:id/results', validateObjectId(), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const db = await connectToDatabase();
  const quiz = await db.collection('Quiz').findOne({ _id: new ObjectId(id), userId: req.user!.id });
  if (!quiz) {
    throw new AppError('Quiz not found', 404);
  }
  const attempts = await db.collection('QuizAttempt').find({ quizId: id, userId: req.user!.id }).sort({ createdAt: -1 }).toArray();
  for (const attempt of attempts) {
    attempt.answers = await db.collection('QuizAnswer').find({ attemptId: attempt._id.toString() }).toArray();
    for (const answer of attempt.answers) {
      answer.question = await db.collection('QuizQuestion').findOne({ _id: new ObjectId(answer.questionId) });
    }
  }
  res.json({ quiz: { ...quiz, attempts } });
}));

export default router; 