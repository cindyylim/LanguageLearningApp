import { Router, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { validateObjectId } from '../middleware/validateObjectId';
import { validate } from '../middleware/validate';
import { QuizService } from '../services/quiz.service';
import { AppError } from '../utils/AppError';
import { createUserRateLimiter } from '../middleware/rateLimit';

const router: Router = Router();

router.use(authMiddleware);

// Rate limiter for quiz generation
const quizGenerationLimiter = createUserRateLimiter(10, 60 * 1000); // 10 requests per minute

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

// Generate AI-powered quiz
router.post('/generate', validate(generateQuizSchema), quizGenerationLimiter, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { vocabularyListId, questionCount, difficulty } = req.body;

  const quiz = await QuizService.generateQuiz(vocabularyListId, { questionCount, difficulty }, req.user!.id);

  if (!quiz) {
    throw new AppError('Vocabulary list not found', 404);
  }

  res.status(201).json({ quiz });
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