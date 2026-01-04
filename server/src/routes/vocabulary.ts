import { Router, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { validateObjectId } from '../middleware/validateObjectId';
import { validate } from '../middleware/validate';
import { VocabularyService } from '../services/vocabulary.service';
import { AppError } from '../utils/AppError';
import { createUserRateLimiter } from '../middleware/rateLimit';
import { vocabularyCache, getCacheKey, invalidateListCache, warmCacheForUser } from '../utils/cache';
import { sanitizeVocabularyListName, sanitizeWordInput, sanitizeDescription } from '../utils/sanitize';
const router = Router();

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

const generateAIListSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  targetLanguage: z.string().min(1),
  nativeLanguage: z.string().min(1),
  prompt: z.string().min(1),
  wordCount: z.number().min(1).max(50).optional().default(10)
});


// Get all vocabulary lists for user
router.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;

  const cacheKey = getCacheKey.userLists(req.user!.id, page, limit);
  const cached = vocabularyCache.get(cacheKey);

  if (cached) {
    return res.json({ vocabularyLists: cached, page, limit });
  }

  const lists = await VocabularyService.getUserLists(req.user!.id, page, limit);
  vocabularyCache.set(cacheKey, lists);

  return res.json({ vocabularyLists: lists, page, limit });
}));

// Create new vocabulary list
router.post('/', validate(createVocabularyListSchema), asyncHandler(async (req: AuthRequest, res: Response) => {
  // Sanitize inputs
  const sanitizedData = {
    name: sanitizeVocabularyListName(req.body.name),
    description: sanitizeDescription(req.body.description),
    targetLanguage: req.body.targetLanguage,
    nativeLanguage: req.body.nativeLanguage
  };

  const list = await VocabularyService.createList(sanitizedData, req.user!.id);
  invalidateListCache(req.user!.id);

  // Warm cache for user after creating first list
  await warmCacheForUser(req.user!.id).catch(err => console.error('Cache warming failed:', err));

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

  // Sanitize inputs
  const sanitizedData = {
    name: sanitizeVocabularyListName(req.body.name),
    description: sanitizeDescription(req.body.description)
  };

  const success = await VocabularyService.updateList(id as string, sanitizedData, req.user!.id);

  if (!success) {
    throw new AppError('Vocabulary list not found', 404);
  }

  invalidateListCache(req.user!.id, id as string);
  return res.json({ message: 'Vocabulary list updated successfully' });
}));

// Delete vocabulary list
router.delete('/:id', validateObjectId(), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const result = await VocabularyService.deleteList(id as string, req.user!.id);

  if (!result) {
    throw new AppError('Vocabulary list not found', 404);
  }

  invalidateListCache(req.user!.id, id as string);
  return res.json({
    message: 'Vocabulary list deleted successfully',
    deletedWords: result.deletedWords,
    deletedWordProgress: result.deletedWordProgress
  });
}));

// Add word to vocabulary list
router.post('/:id/words', validateObjectId(), validate(addWordSchema), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  // Sanitize word inputs
  const sanitizedWordData = {
    word: sanitizeWordInput(req.body.word),
    translation: sanitizeWordInput(req.body.translation),
    partOfSpeech: sanitizeWordInput(req.body.partOfSpeech),
    difficulty: req.body.difficulty
  };

  const newWord = await VocabularyService.addWord(id as string, sanitizedWordData, req.user!.id);

  if (!newWord) {
    throw new AppError('Vocabulary list not found', 404);
  }

  invalidateListCache(req.user!.id, id as string);
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

// Get word progress for a specific word
router.get('/words/:wordId/progress', validateObjectId('wordId'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { wordId } = req.params;
  const progress = await VocabularyService.getWordProgress(wordId as string, req.user!.id);
  return res.json({ progress });
}));

// Update word progress manually
router.post('/words/:wordId/progress', validateObjectId('wordId'), validate(updateProgressSchema), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { wordId } = req.params;
  const updatedProgress = await VocabularyService.updateWordProgress(wordId as string, req.body.status, req.user!.id);

  if (!updatedProgress) {
    throw new AppError('Word not found', 404);
  }
  invalidateListCache(req.user!.id);

  return res.json({
    message: 'Word progress updated successfully',
    progress: updatedProgress
  });
}));
// Edit a word in a vocabulary list
router.put('/:listId/words/:wordId', validateObjectId('listId'), validateObjectId('wordId'), validate(updateWordSchema), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { listId, wordId } = req.params;

  // Sanitize word inputs
  const sanitizedWordData = {
    word: sanitizeWordInput(req.body.word),
    translation: sanitizeWordInput(req.body.translation),
    partOfSpeech: sanitizeWordInput(req.body.partOfSpeech),
    difficulty: req.body.difficulty
  };

  const updatedWord = await VocabularyService.updateWord(listId as string, wordId as string, sanitizedWordData, req.user!.id);

  if (!updatedWord) {
    throw new AppError('Vocabulary list or word not found', 404);
  }
  invalidateListCache(req.user!.id, listId as string);

  return res.json({ word: updatedWord });
}));

// Delete a word in a vocabulary list
router.delete('/:listId/words/:wordId', validateObjectId('listId'), validateObjectId('wordId'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { listId, wordId } = req.params;
  const success = await VocabularyService.deleteWord(listId as string, wordId as string, req.user!.id);

  if (!success) {
    throw new AppError('Vocabulary list or word not found', 404);
  }

  invalidateListCache(req.user!.id, listId as string);
  return res.json({ message: 'Word deleted successfully' });
}));

// Generate vocabulary list using AI
router.post('/generate-ai-list', validate(generateAIListSchema), asyncHandler(async (req: AuthRequest, res: Response) => {
  const list = await VocabularyService.generateAIList(req.body, req.user!.id);
  invalidateListCache(req.user!.id);
  return res.status(201).json({ vocabularyList: list });
}));
export default router;