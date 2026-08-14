import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { validateObjectId, isValidObjectId } from '../middleware/validateObjectId';
import { validate } from '../middleware/validate';
import { QuizService } from '../services/quiz.service';
import { AppError } from '../utils/AppError';
import { createUserRateLimiter } from '../middleware/rateLimit';
import { invalidateListCache } from '../utils/cache';

const router: Router = Router();

const QUIZ_GENERATE_PER_MINUTE = Number.parseInt(process.env.QUIZ_GENERATE_PER_MINUTE ?? '1', 10);
const QUIZ_GENERATE_PER_DAY = Number.parseInt(process.env.QUIZ_GENERATE_PER_DAY ?? '2', 10);

const quizGenerationMinuteLimiter = createUserRateLimiter(
    QUIZ_GENERATE_PER_MINUTE,
    60 * 1000,
    {
        requireUser: true,
        keyPrefix: 'quiz-gen-minute',
        message: {
            status: 'error',
            message: 'Quiz generation rate limit exceeded. Please wait before generating another quiz.',
        },
    }
);

const quizGenerationDayLimiter = createUserRateLimiter(
    QUIZ_GENERATE_PER_DAY,
    24 * 60 * 60 * 1000,
    {
        requireUser: true,
        keyPrefix: 'quiz-gen-day',
        message: {
            status: 'error',
            message: 'Daily quiz generation quota exceeded. Please try again tomorrow.',
        },
    }
);

const generateQuizSchema = z.object({
  vocabularyListId: z.string().refine(isValidObjectId, {
    message: 'Invalid vocabularyListId format',
  }),
  questionCount: z.number().min(1).max(20).optional().default(10),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional().default('medium'),
});

const submitQuizSchema = z.object({
  answers: z.array(z.object({
    questionId: z.string(),
    answer: z.string()
  }))
});

// Generate AI-powered quiz
router.post(
  '/generate',
  validate(generateQuizSchema),
  quizGenerationDayLimiter,
  quizGenerationMinuteLimiter,
  asyncHandler(async (req: AuthRequest, res: Response) => {
  const { vocabularyListId, questionCount, difficulty } = req.body;
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

  const result = await QuizService.generateQuiz(
    vocabularyListId,
    { questionCount, difficulty },
    req.user!.id,
    idempotencyKey
  );

  if (!result) {
    throw new AppError('Vocabulary list not found', 404);
  }

  res.status(result.created ? 201 : 200).json({ quiz: result.quiz });
}));

// Get user's quizzes
router.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const quizzes = await QuizService.getUserQuizzes(req.user!.id);
  res.json({ quizzes });
}));

// Get specific quiz
router.get('/:id', validateObjectId(), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const quiz = await QuizService.getQuizById(id as string, req.user!.id);

  if (!quiz) {
    throw new AppError('Quiz not found', 404);
  }

  res.json({ quiz });
}));

// Submit quiz answers
router.post('/:id/submit', validateObjectId(), validate(submitQuizSchema), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { answers } = req.body;

  const attempt = await QuizService.submitQuizAnswers(id as string, answers, req.user!.id);

  if (!attempt) {
    throw new AppError('Quiz not found', 404);
  }

  invalidateListCache(req.user!.id);

  res.json({ attempt });
}));

// Get quiz results
router.get('/:id/results', validateObjectId(), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const quiz = await QuizService.getQuizResults(id as string, req.user!.id);

  if (!quiz) {
    throw new AppError('Quiz not found', 404);
  }

  res.json({ quiz });
}));

export default router;