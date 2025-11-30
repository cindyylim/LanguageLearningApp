import { Router, Response } from 'express';
import { z } from 'zod';
import NodeCache from 'node-cache';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { validateObjectId } from '../middleware/validateObjectId';
import { validate } from '../middleware/validate';
import { VocabularyService } from '../services/vocabulary.service';
import { AppError } from '../utils/AppError';
import { createUserRateLimiter } from '../middleware/rateLimit';

const router = Router();
const cache = new NodeCache({ stdTTL: 300 }); // Cache for 5 minutes

router.use(authMiddleware);

// Rate limiters for expensive AI operations
const aiGenerationLimiter = createUserRateLimiter(10, 60 * 1000); // 10 requests per minute

const createVocabularyListSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  targetLanguage: z.string().optional(),
  nativeLanguage: z.string().optional()
});

const addWordSchema = z.object({
  word: z.string().min(1),
  translation: z.string().min(1),
  partOfSpeech: z.string().optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional().default('medium')
});

const updateProgressSchema = z.object({
  mastery: z.number().min(0).max(1).optional(),
  status: z.enum(['learning', 'mastered', 'not_started']).optional()
});

const updateWordSchema = z.object({
  word: z.string().min(1),
  translation: z.string().min(1),
  partOfSpeech: z.string().optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional()
});

// Helper to invalidate user's vocabulary list cache
const invalidateUserCache = (userId: string) => {
  const keys = cache.keys();
  const userKeys = keys.filter(k => k.startsWith(`vocab_lists_${userId}`));
  if (userKeys.length > 0) {
    cache.del(userKeys);
  }
};

// Get all vocabulary lists for user
router.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;

  const cacheKey = `vocab_lists_${req.user!.id}_${page}_${limit}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    return res.json({ vocabularyLists: cached, page, limit });
  }

  const lists = await VocabularyService.getUserLists(req.user!.id, page, limit);
  cache.set(cacheKey, lists);

  return res.json({ vocabularyLists: lists, page, limit });
}));

// Create new vocabulary list
router.post('/', validate(createVocabularyListSchema), asyncHandler(async (req: AuthRequest, res: Response) => {
  const list = await VocabularyService.createList(req.body, req.user!.id);
  invalidateUserCache(req.user!.id);
  return res.status(201).json({ vocabularyList: list });
}));

// Get specific vocabulary list with words
router.get('/:id', validateObjectId(), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const list = await VocabularyService.getListById(id as string, req.user!.id);

  if (!list) {
    throw new AppError('Vocabulary list not found', 404);
  }

  return res.json({ vocabularyList: list });
}));

// Update vocabulary list
router.put('/:id', validateObjectId(), validate(createVocabularyListSchema), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const success = await VocabularyService.updateList(id as string, req.body, req.user!.id);

  if (!success) {
    throw new AppError('Vocabulary list not found', 404);
  }

  invalidateUserCache(req.user!.id);
  return res.json({ message: 'Vocabulary list updated successfully' });
}));

// Delete vocabulary list
router.delete('/:id', validateObjectId(), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const result = await VocabularyService.deleteList(id as string, req.user!.id);

  if (!result) {
    throw new AppError('Vocabulary list not found', 404);
  }

  invalidateUserCache(req.user!.id);
  return res.json({
    message: 'Vocabulary list deleted successfully',
    deletedWords: result.deletedWords,
    deletedWordProgress: result.deletedWordProgress
  });
}));

// Add word to vocabulary list
router.post('/:id/words', validateObjectId(), validate(addWordSchema), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const newWord = await VocabularyService.addWord(id as string, req.body, req.user!.id);

  if (!newWord) {
    throw new AppError('Vocabulary list not found', 404);
  }

  invalidateUserCache(req.user!.id);
  return res.status(201).json({ word: newWord });
}));

// Generate contextual sentences for vocabulary list
router.post('/:id/generate-sentences', validateObjectId(), aiGenerationLimiter, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const sentences = await VocabularyService.generateSentences(id as string, req.user!.id);

  if (!sentences) {
    throw new AppError('Vocabulary list not found', 404);
  }

  return res.json({ sentences });
}));

// Update word progress manually
router.post('/words/:wordId/progress', validateObjectId('wordId'), validate(updateProgressSchema), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { wordId } = req.params;
  const updatedProgress = await VocabularyService.updateWordProgress(wordId as string, req.body, req.user!.id);

  if (!updatedProgress) {
    throw new AppError('Word not found', 404);
  }

  return res.json({
    message: 'Word progress updated successfully',
    progress: updatedProgress
  });
}));

// Get word progress for a specific word
router.get('/words/:wordId/progress', validateObjectId('wordId'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { wordId } = req.params;
  const progress = await VocabularyService.getWordProgress(wordId as string, req.user!.id);
  return res.json({ progress });
}));

// Edit a word in a vocabulary list
router.put('/:listId/words/:wordId', validateObjectId('listId'), validateObjectId('wordId'), validate(updateWordSchema), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { listId, wordId } = req.params;
  const updatedWord = await VocabularyService.updateWord(listId as string, wordId as string, req.body, req.user!.id);

  if (!updatedWord) {
    throw new AppError('Vocabulary list or word not found', 404);
  }
  invalidateUserCache(req.user!.id);

  return res.json({ word: updatedWord });
}));

// Delete a word in a vocabulary list
router.delete('/:listId/words/:wordId', validateObjectId('listId'), validateObjectId('wordId'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { listId, wordId } = req.params;
  const success = await VocabularyService.deleteWord(listId as string, wordId as string, req.user!.id);

  if (!success) {
    throw new AppError('Vocabulary list or word not found', 404);
  }

  invalidateUserCache(req.user!.id);
  return res.json({ message: 'Word deleted successfully' });
}));

export default router;