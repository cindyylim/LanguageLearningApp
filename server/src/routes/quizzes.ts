import { Router, Response } from 'express';
import { z } from 'zod';
import { connectToDatabase } from '../utils/mongo';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { AIService } from '../services/ai';
import { ObjectId } from 'mongodb';

const router = Router();

router.use(authMiddleware);

const generateQuizSchema = z.object({
  vocabularyListId: z.string(),
  questionCount: z.number().min(1).max(20).optional().default(10),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional().default('medium'),
  timeLimit: z.number().min(1).max(60).optional()
});

const submitQuizSchema = z.object({
  answers: z.array(z.object({
    questionId: z.string(),
    answer: z.string(),
    timeSpent: z.number()
  }))
});

// Generate AI-powered quiz
router.post('/generate', async (req: AuthRequest, res: Response) => {
  try {
    const { vocabularyListId, questionCount, difficulty, timeLimit } = generateQuizSchema.parse(req.body);
    const db = await connectToDatabase();
    // Get vocabulary list with words
    const vocabularyList = await db.collection('VocabularyList').findOne({ _id: new ObjectId(vocabularyListId), userId: req.user!.id });
    if (!vocabularyList) {
      return res.status(404).json({ error: 'Vocabulary list not found' });
    }
    const words = await db.collection('Word').find({ vocabularyListId: new ObjectId(vocabularyListId) }).toArray();
    if (words.length === 0) {
      return res.status(400).json({ error: 'No words in vocabulary list' });
    }
    // Generate questions using AI
    const aiQuestions = await AIService.generateQuestions(
      words.map((w: any) => ({
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
      timeLimit,
      userId: req.user!.id,
      createdAt: now,
      updatedAt: now
    });
    const quizId = quizResult.insertedId.toString();
    // Create quiz questions
    const quizQuestions = await Promise.all(
      aiQuestions.map(async (aiQuestion: any) => {
        const validWordId = words.some((w: any) => w._id.toString() === aiQuestion.wordId) ? aiQuestion.wordId : null;
        const result = await db.collection('QuizQuestion').insertOne({
          question: aiQuestion.question,
          type: aiQuestion.type,
          correctAnswer: aiQuestion.correctAnswer,
          options: aiQuestion.options ? JSON.stringify(aiQuestion.options) : null,
          context: aiQuestion.context,
          difficulty: aiQuestion.difficulty,
          quizId: quizId,
          wordId: validWordId,
          createdAt: now
        });
        return await db.collection('QuizQuestion').findOne({ _id: result.insertedId });
      })
    );
    const quiz = await db.collection('Quiz').findOne({ _id: quizResult.insertedId });
    return res.status(201).json({ quiz: { ...quiz, questions: quizQuestions } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error generating quiz:', error);
    return res.status(500).json({ error: 'Failed to generate quiz' });
  }
});

// Get user's quizzes
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const db = await connectToDatabase();
    const quizzes = await db.collection('Quiz').find({ userId: req.user!.id }).sort({ createdAt: -1 }).toArray();
    // For each quiz, get questions and last attempt
    const quizzesWithDetails = await Promise.all(
      quizzes.map(async (quiz: any) => {
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
    return res.json({ quizzes: quizzesWithDetails });
  } catch (error) {
    console.error('Error fetching quizzes:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get specific quiz
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const db = await connectToDatabase();
    const quiz = await db.collection('Quiz').findOne({ _id: new ObjectId(id), userId: req.user!.id });
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    const questions = await db.collection('QuizQuestion').find({ quizId: id }).toArray();
    return res.json({ quiz: { ...quiz, questions } });
  } catch (error) {
    console.error('Error fetching quiz:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Submit quiz answers
router.post('/:id/submit', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { answers } = submitQuizSchema.parse(req.body);
    const db = await connectToDatabase();
    const quiz = await db.collection('Quiz').findOne({ _id: new ObjectId(id), userId: req.user!.id });
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    const questions = await db.collection('QuizQuestion').find({ quizId: id }).toArray();
    let correctAnswers = 0;
    const totalQuestions = questions.length;
    let totalTimeSpent = 0;
    const processedAnswers = answers.map((answer: any) => {
      const question = questions.find((q: any) => q._id.toString() === answer.questionId);
      if (!question) throw new Error(`Question ${answer.questionId} not found`);
      const isCorrect = answer.answer.toLowerCase().trim() === question.correctAnswer.toLowerCase().trim();
      if (isCorrect) correctAnswers++;
      totalTimeSpent += answer.timeSpent;
      return {
        answer: answer.answer,
        isCorrect,
        timeSpent: answer.timeSpent,
        questionId: answer.questionId,
        wordId: question.wordId // Add wordId for progress tracking
      };
    });

    // Update word progress for each answered question
    await Promise.all(
      processedAnswers.map(async (processedAnswer: any) => {
        if (processedAnswer.wordId) {
          const existingProgress = await db.collection('WordProgress').findOne({
            userId: req.user!.id,
            wordId: processedAnswer.wordId
          });

          const now = new Date();
          const isCorrect = processedAnswer.isCorrect;
          
          if (existingProgress) {
            // Update existing progress
            const newReviewCount = existingProgress.reviewCount + 1;
            const newStreak = isCorrect ? existingProgress.streak + 1 : 0;
            
            // Calculate new mastery level (0-1 scale)
            let newMastery = existingProgress.mastery;
            if (isCorrect) {
              newMastery = Math.min(1, newMastery + 0.1); // Increase mastery for correct answers
            } else {
              newMastery = Math.max(0, newMastery - 0.15); // Decrease mastery for incorrect answers
            }

            // Calculate next review date based on spaced repetition
            const interval = Math.max(1, Math.floor(newMastery * 7)); // 1-7 days based on mastery
            const nextReview = new Date(now.getTime() + interval * 24 * 60 * 60 * 1000);

            await db.collection('WordProgress').updateOne(
              { _id: existingProgress._id },
              {
                $set: {
                  mastery: newMastery,
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
            const initialMastery = isCorrect ? 0.3 : 0.1;
            const interval = Math.max(1, Math.floor(initialMastery * 7));
            const nextReview = new Date(now.getTime() + interval * 24 * 60 * 60 * 1000);

            await db.collection('WordProgress').insertOne({
              userId: req.user!.id,
              wordId: processedAnswer.wordId,
              mastery: initialMastery,
              reviewCount: 1,
              streak: isCorrect ? 1 : 0,
              lastReviewed: now,
              nextReview: nextReview,
              createdAt: now,
              updatedAt: now
            });
          }
        }
      })
    );

    const attemptResult = await db.collection('QuizAttempt').insertOne({
      score: totalQuestions > 0 ? correctAnswers / totalQuestions : 0,
      timeSpent: totalTimeSpent,
      completed: true,
      userId: req.user!.id,
      quizId: id,
      createdAt: new Date()
    });
    
    // Update daily learning stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const existingStats = await db.collection('LearningStats').findOne({
      userId: req.user!.id,
      date: today
    });
    
    if (existingStats) {
      await db.collection('LearningStats').updateOne(
        { _id: existingStats._id },
        {
          $inc: {
            quizzesTaken: 1,
            totalQuestions: totalQuestions,
            correctAnswers: correctAnswers,
            timeSpent: totalTimeSpent
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
        timeSpent: totalTimeSpent,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    
    // Store answers
    await Promise.all(
      processedAnswers.map(async (processedAnswer: any) => {
        await db.collection('QuizAnswer').insertOne({
          answer: processedAnswer.answer,
          isCorrect: processedAnswer.isCorrect,
          timeSpent: processedAnswer.timeSpent,
          attemptId: attemptResult.insertedId.toString(),
          questionId: processedAnswer.questionId,
          createdAt: new Date()
        });
      })
    );
    
    return res.json({
      attempt: {
        id: attemptResult.insertedId.toString(),
        score: totalQuestions > 0 ? correctAnswers / totalQuestions : 0,
        timeSpent: totalTimeSpent,
        completed: true,
        correctAnswers,
        totalQuestions,
        answers: processedAnswers
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error submitting quiz:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get quiz results
router.get('/:id/results', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const db = await connectToDatabase();
    const quiz = await db.collection('Quiz').findOne({ _id: new ObjectId(id), userId: req.user!.id });
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    const attempts = await db.collection('QuizAttempt').find({ quizId: id, userId: req.user!.id }).sort({ createdAt: -1 }).toArray();
    for (const attempt of attempts) {
      attempt.answers = await db.collection('QuizAnswer').find({ attemptId: attempt._id.toString() }).toArray();
      for (const answer of attempt.answers) {
        answer.question = await db.collection('QuizQuestion').findOne({ _id: new ObjectId(answer.questionId) });
      }
    }
    return res.json({ quiz: { ...quiz, attempts } });
  } catch (error) {
    console.error('Error fetching quiz results:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router; 