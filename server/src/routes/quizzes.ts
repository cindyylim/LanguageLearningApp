import { Router, Response } from 'express';
import { z } from 'zod';
import { connectToDatabase } from '../utils/mongo';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { AIService, Question } from '../services/ai';
import { ObjectId } from 'mongodb';
import { Quiz, QuizAnswerWithQuestion, QuizQuestion } from '../interface/Quiz';
import { Word } from '../interface/Word';
import { Answer } from '../interface/Answer';

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
router.post('/generate', async (req: AuthRequest, res: Response) => {
  try {
    const { vocabularyListId, questionCount, difficulty } = generateQuizSchema.parse(req.body);
    const db = await connectToDatabase();
    // Get vocabulary list with words
    const vocabularyList = await db.collection('VocabularyList').findOne({ _id: new ObjectId(vocabularyListId), userId: req.user!.id });
    if (!vocabularyList) {
      return res.status(404).json({ error: 'Vocabulary list not found' });
    }
    const words = await db.collection('Word').find({ vocabularyListId: new ObjectId(vocabularyListId) }).toArray() as unknown as Word[];
    if (words.length === 0) {
      return res.status(400).json({ error: 'No words in vocabulary list' });
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
    const questions = await db.collection('QuizQuestion').find({ quizId: id }).toArray() as unknown as QuizQuestion[];
    let correctAnswers = 0;
    const totalQuestions = questions.length;
    const processedAnswers = answers.map((answer: QuizAnswerInput) => {
      const question = questions.find((q: QuizQuestion) => q._id.toString() === answer.questionId);
      if (!question) throw new Error(`Question ${answer.questionId} not found`);
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
                status: newMastery < 1.0 ? 'learning': 'mastered',
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
            status: initialMastery < 1.0 ? 'learning': 'mastered',
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
    const startOfDay = today.setHours(0, 0, 0, 0);
    const endOfDay = today.setHours(23, 59, 59, 999)
    
    const existingStats = await db.collection('LearningStats').findOne({
      userId: req.user!.id,
      date: { $gte: startOfDay, $lte: endOfDay }
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
          createdAt: new Date()
        });
      })
    );
    
    return res.json({
      attempt: {
        id: attemptResult.insertedId.toString(),
        score: totalQuestions > 0 ? correctAnswers / totalQuestions : 0,
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