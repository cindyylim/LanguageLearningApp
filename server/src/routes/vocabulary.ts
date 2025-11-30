import { Router, Response } from 'express';
import { z } from 'zod';
import { connectToDatabase } from '../utils/mongo';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { AIService } from '../services/ai';
import { ObjectId } from 'mongodb';
import { Word } from '../interface/Word';

interface WordDocument {
  _id: ObjectId;
  word: string;
  translation: string;
  partOfSpeech?: string | null;
  difficulty: string;
  vocabularyListId: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

interface WordProgressDocument {
  _id: ObjectId;
  wordId: string;
  userId: string;
  mastery: number;
  status: string;
  reviewCount: number;
  streak: number;
  lastReviewed: string;
  nextReview: string;
  createdAt: string;
  updatedAt: string;
}

interface AIWord {
  word: string;
  translation: string;
  partOfSpeech?: string;
  difficulty?: string;
}

type ProgressMap = Record<string, WordProgressDocument>;

const router = Router();

router.use(authMiddleware);

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

// Get all vocabulary lists for user
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const db = await connectToDatabase();

    const lists = await db.collection('VocabularyList').aggregate([
      { $match: { userId: req.user!.id } },
      {
        $lookup: {
          from: 'Word',
          localField: '_id',
          foreignField: 'vocabularyListId',
          as: 'words'
        }
      },
      {
        $unwind: {
          path: '$words',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $lookup: {
          from: 'WordProgress',
          let: { wordIdStr: { $toString: '$words._id' } },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$wordId', '$$wordIdStr'] },
                    { $eq: ['$userId', req.user!.id] }
                  ]
                }
              }
            }
          ],
          as: 'wordProgress'
        }
      },
      {
        $addFields: {
          'words.progress': { $arrayElemAt: ['$wordProgress', 0] }
        }
      },
      {
        $group: {
          _id: '$_id',
          name: { $first: '$name' },
          description: { $first: '$description' },
          targetLanguage: { $first: '$targetLanguage' },
          nativeLanguage: { $first: '$nativeLanguage' },
          userId: { $first: '$userId' },
          createdAt: { $first: '$createdAt' },
          updatedAt: { $first: '$updatedAt' },
          words: { $push: '$words' }
        }
      },
      {
        $addFields: {
          words: {
            $filter: {
              input: '$words',
              as: 'w',
              cond: { $ifNull: ['$$w._id', false] }
            }
          }
        }
      },
      {
        $addFields: {
          _count: { words: { $size: '$words' } }
        }
      },
      { $sort: { updatedAt: -1 } }
    ]).toArray();

    return res.json({ vocabularyLists: lists });
  } catch (error) {
    console.error('Error fetching vocabulary lists:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new vocabulary list
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, targetLanguage, nativeLanguage } = createVocabularyListSchema.parse(req.body);
    const db = await connectToDatabase();

    // Get user's language preferences if not provided
    let userTargetLanguage = targetLanguage;
    let userNativeLanguage = nativeLanguage;

    if (!userTargetLanguage || !userNativeLanguage) {
      const user = await db.collection('User').findOne({ _id: new ObjectId(req.user!.id) });
      if (user) {
        userTargetLanguage = userTargetLanguage || user.targetLanguage;
        userNativeLanguage = userNativeLanguage || user.nativeLanguage;
      }
    }

    const now = new Date();
    const result = await db.collection('VocabularyList').insertOne({
      name,
      description,
      targetLanguage: userTargetLanguage,
      nativeLanguage: userNativeLanguage,
      userId: req.user!.id,
      createdAt: now,
      updatedAt: now
    });
    const list = await db.collection('VocabularyList').findOne({ _id: result.insertedId, userId: req.user!.id });
    return res.status(201).json({ vocabularyList: list });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating vocabulary list:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get specific vocabulary list with words
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const db = await connectToDatabase();
    const list = await db.collection('VocabularyList').findOne({ _id: new ObjectId(id), userId: req.user!.id });
    if (!list) {
      return res.status(404).json({ error: 'Vocabulary list not found' });
    }
    const words = await db.collection('Word').find({ vocabularyListId: new ObjectId(id) }).toArray() as unknown as WordDocument[];
    // Fetch progress for all words for this user
    const wordIds = words.map((w: WordDocument) => w._id.toString());
    const progressData = await db.collection('WordProgress').find({
      userId: req.user!.id,
      wordId: { $in: wordIds }
    }).toArray() as unknown as WordProgressDocument[];
    const progressMap = progressData.reduce((acc: ProgressMap, p: WordProgressDocument) => {
      acc[p.wordId] = p;
      return acc;
    }, {} as ProgressMap);
    const wordsWithProgress = words.map((word: WordDocument) => {
      const progress = progressMap[word._id.toString()];
      return {
        _id: word._id.toString(),
        word: word.word,
        translation: word.translation,
        partOfSpeech: word.partOfSpeech || '',
        difficulty: word.difficulty,
        vocabularyListId: word.vocabularyListId.toString(),
        createdAt: word.createdAt instanceof Date ? word.createdAt.toISOString() : String(word.createdAt),
        updatedAt: word.updatedAt instanceof Date ? word.updatedAt.toISOString() : String(word.updatedAt),
        progress: progress ? {
          _id: progress._id.toString(),
          wordId: progress.wordId,
          userId: progress.userId,
          mastery: progress.mastery,
          status: progress.status,
          reviewCount: progress.reviewCount,
          streak: progress.streak,
          lastReviewed: progress.lastReviewed,
          nextReview: progress.nextReview,
          createdAt: progress.createdAt,
          updatedAt: progress.updatedAt
        } : {
          mastery: 0,
          status: 'not_started',
          reviewCount: 0,
          streak: 0
        }
      } as Word;
    });
    return res.json({ vocabularyList: { ...list, words: wordsWithProgress } });
  } catch (error) {
    console.error('Error fetching vocabulary list:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Update vocabulary list
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description } = createVocabularyListSchema.parse(req.body);
    const db = await connectToDatabase();
    const result = await db.collection('VocabularyList').updateOne(
      { _id: new ObjectId(id), userId: req.user!.id },
      { $set: { name, description, updatedAt: new Date() } }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Vocabulary list not found' });
    }
    return res.json({ message: 'Vocabulary list updated successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error updating vocabulary list:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete vocabulary list
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const db = await connectToDatabase();
    const listObjectId = new ObjectId(id);

    const list = await db.collection('VocabularyList').findOne({
      _id: listObjectId,
      userId: req.user!.id
    });
    if (!list) {
      return res.status(404).json({ error: 'Vocabulary list not found' });
    }

    const words = await db
      .collection('Word')
      .find({ vocabularyListId: listObjectId })
      .project({ _id: 1 })
      .toArray() as unknown as { _id: ObjectId }[];
    const wordIds = words.map((w: { _id: ObjectId }) => w._id.toString());

    await db.collection('VocabularyList').deleteOne({ _id: listObjectId });
    const wordsDeleteResult = await db
      .collection('Word')
      .deleteMany({ vocabularyListId: listObjectId });

    if (wordIds.length > 0) {
      const progressDeleteResult = await db.collection('WordProgress').deleteMany({
        userId: req.user!.id,
        wordId: { $in: wordIds }
      });
      return res.json({
        message: 'Vocabulary list deleted successfully',
        deletedWords: wordsDeleteResult.deletedCount || 0,
        deletedWordProgress: progressDeleteResult.deletedCount || 0
      });
    }

    return res.json({
      message: 'Vocabulary list deleted successfully',
      deletedWords: wordsDeleteResult.deletedCount || 0,
      deletedWordProgress: 0
    });
  } catch (error) {
    console.error('Error deleting vocabulary list:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Add word to vocabulary list
router.post('/:id/words', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { word, translation, partOfSpeech, difficulty } = addWordSchema.parse(req.body);

    console.log('Adding word - Request params:', { id, word, translation, partOfSpeech, difficulty });
    console.log('User ID:', req.user!.id);

    const db = await connectToDatabase();
    console.log('Connected to database');

    // Verify vocabulary list belongs to user
    const list = await db.collection('VocabularyList').findOne({ _id: new ObjectId(id), userId: req.user!.id });
    console.log('Found vocabulary list:', list ? 'Yes' : 'No');

    if (!list) {
      console.log('Vocabulary list not found for id:', id, 'user:', req.user!.id);
      return res.status(404).json({ error: 'Vocabulary list not found' });
    }

    const now = new Date();
    const wordData = {
      word,
      translation,
      partOfSpeech: partOfSpeech || null,
      difficulty,
      vocabularyListId: new ObjectId(id), // Store as ObjectId instead of string
      createdAt: now,
      updatedAt: now
    };

    console.log('Inserting word data:', wordData);

    const result = await db.collection('Word').insertOne(wordData);
    console.log('Word inserted with ID:', result.insertedId);

    const newWord = await db.collection('Word').findOne({ _id: result.insertedId });
    console.log('Retrieved new word:', newWord);

    return res.status(201).json({ word: newWord });
  } catch (error) {
    console.error('Error in add word route:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error adding word:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Generate contextual sentences for vocabulary list
router.post('/:id/generate-sentences', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const db = await connectToDatabase();
    const list = await db.collection('VocabularyList').findOne({ _id: new ObjectId(id), userId: req.user!.id });
    if (!list) {
      return res.status(404).json({ error: 'Vocabulary list not found' });
    }
    const words = await db.collection('Word').find({ vocabularyListId: new ObjectId(id) }).toArray() as unknown as WordDocument[];
    if (words.length === 0) {
      return res.status(400).json({ error: 'No words in vocabulary list' });
    }
    // For AIService, pass words in expected format
    const sentences = await AIService.generateContextualSentences(
      words.map((w: WordDocument) => ({
        id: w._id.toString(),
        word: w.word,
        translation: w.translation,
        partOfSpeech: w.partOfSpeech || undefined,
        difficulty: w.difficulty
      })),
      list.targetLanguage,
      list.nativeLanguage
    );
    return res.json({ sentences });
  } catch (error) {
    console.error('Error generating sentences:', error);
    return res.status(500).json({ error: 'Failed to generate contextual sentences' });
  }
});

// Analyze text complexity
router.post('/analyze-complexity', async (req: AuthRequest, res: Response) => {
  try {
    const { text, targetLanguage } = req.body;
    if (!text || !targetLanguage) {
      return res.status(400).json({ error: 'Text and target language are required' });
    }
    const analysis = await AIService.analyzeTextComplexity(text, targetLanguage);
    return res.json({ analysis });
  } catch (error) {
    console.error('Error analyzing text complexity:', error);
    return res.status(500).json({ error: 'Failed to analyze text complexity' });
  }
});

// Generate vocabulary list using AI
router.post('/generate-ai-list', async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, targetLanguage, nativeLanguage, prompt, wordCount } = req.body;
    if (!name || !targetLanguage || !nativeLanguage || !prompt) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const db = await connectToDatabase();
    // Generate vocabulary words using AIService
    const aiWords = await AIService.generateVocabularyList(
      prompt,
      targetLanguage,
      nativeLanguage,
      wordCount || 10
    );
    // Create the vocabulary list
    const now = new Date();
    const result = await db.collection('VocabularyList').insertOne({
      name,
      description,
      targetLanguage,
      nativeLanguage,
      userId: req.user!.id,
      createdAt: now,
      updatedAt: now
    });
    const listId = result.insertedId;
    // Insert words
    const wordDocs = aiWords.map((w: AIWord) => ({
      word: w.word,
      translation: w.translation,
      partOfSpeech: w.partOfSpeech || null,
      difficulty: w.difficulty || 'medium',
      vocabularyListId: listId,
      createdAt: now,
      updatedAt: now
    }));
    await db.collection('Word').insertMany(wordDocs);
    // Fetch the new list with words
    const list = await db.collection('VocabularyList').findOne({
      _id: listId,
      userId: req.user!.id
    });
    const words = await db.collection('Word').find({ vocabularyListId: listId }).toArray();
    return res.status(201).json({ vocabularyList: { ...list, words } });
  } catch (error) {
    console.error('Error generating AI vocabulary list:', error);
    return res.status(500).json({ error: 'Failed to generate AI vocabulary list' });
  }
});

// Update word progress manually
router.post('/words/:wordId/progress', async (req: AuthRequest, res: Response) => {
  try {
    const { wordId } = req.params;
    const { mastery, status } = req.body; // mastery: 0-1, status: 'learning', 'mastered'

    const db = await connectToDatabase();
    const now = new Date();

    const word = await db.collection('Word').aggregate([
      { $match: { _id: new ObjectId(wordId) } },
      {
        $lookup: {
          from: 'VocabularyList',
          localField: 'vocabularyListId',
          foreignField: '_id',
          as: 'list'
        }
      },
      { $match: { 'list.userId': req.user!.id } }
    ]).toArray();

    if (!word) {
      return res.status(404).json({ error: 'Word not found' });
    }

    const existingProgress = await db.collection('WordProgress').findOne({
      userId: req.user!.id,
      wordId: wordId
    });

    let newMastery = mastery || 0;
    let newStatus = status || 'learning';

    // Auto-calculate mastery based on status if not provided
    if (!mastery && status) {
      switch (status) {
        case 'learning':
          newMastery = 0;
          break;
        case 'mastered':
          newMastery = 1.0;
          break;
        default:
          newMastery = 0;
      }
    }

    // Calculate next review date based on mastery
    const interval = Math.min(1, Math.floor(newMastery * 7));
    const nextReview = new Date(now.getTime() + interval * 24 * 60 * 60 * 1000);

    if (existingProgress) {
      // Update existing progress
      await db.collection('WordProgress').updateOne(
        { _id: existingProgress._id },
        {
          $set: {
            mastery: newMastery,
            status: newStatus,
            lastReviewed: now,
            nextReview: nextReview,
            updatedAt: now
          },
          $inc: { reviewCount: 1 }
        }
      );
    } else {
      // Create new progress record
      await db.collection('WordProgress').insertOne({
        userId: req.user!.id,
        wordId: wordId,
        mastery: newMastery,
        status: newStatus,
        reviewCount: 1,
        streak: 0,
        lastReviewed: now,
        nextReview: nextReview,
        createdAt: now,
        updatedAt: now
      });
    }

    const updatedProgress = await db.collection('WordProgress').findOne({
      userId: req.user!.id,
      wordId: wordId
    });

    // Update daily learning stats for manual progress updates
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
            wordsReviewed: 1
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
        quizzesTaken: 0,
        wordsReviewed: 1,
        totalQuestions: 0,
        correctAnswers: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    return res.json({
      message: 'Word progress updated successfully',
      progress: updatedProgress
    });
  } catch (error) {
    console.error('Error updating word progress:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get word progress for a specific word
router.get('/words/:wordId/progress', async (req: AuthRequest, res: Response) => {
  try {
    const { wordId } = req.params;
    const db = await connectToDatabase();

    const progress = await db.collection('WordProgress').findOne({
      userId: req.user!.id,
      wordId: wordId
    });

    return res.json({
      progress: progress || {
        mastery: 0,
        status: 'not_started',
        reviewCount: 0,
        streak: 0
      }
    });
  } catch (error) {
    console.error('Error fetching word progress:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Edit a word in a vocabulary list
router.put('/:listId/words/:wordId', async (req: AuthRequest, res: Response) => {
  try {
    const { listId, wordId } = req.params;
    const { word, translation, partOfSpeech, difficulty } = req.body;
    const db = await connectToDatabase();
    // Check list ownership
    const list = await db.collection('VocabularyList').findOne({ _id: new ObjectId(listId), userId: req.user!.id });
    if (!list) {
      return res.status(404).json({ error: 'Vocabulary list not found' });
    }
    // Update word
    const result = await db.collection('Word').updateOne(
      { _id: new ObjectId(wordId), vocabularyListId: new ObjectId(listId) },
      { $set: { word, translation, partOfSpeech, difficulty, updatedAt: new Date() } }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Word not found' });
    }
    const updatedWord = await db.collection('Word').findOne({ _id: new ObjectId(wordId) });
    return res.json({ word: updatedWord });
  } catch (error) {
    console.error('Error updating word:', error);
    return res.status(500).json({ error: 'Failed to update word' });
  }
});

// Delete a word in a vocabulary list
router.delete('/:listId/words/:wordId', async (req: AuthRequest, res: Response) => {
  try {
    const { listId, wordId } = req.params;
    const db = await connectToDatabase();
    // Check list ownership
    const list = await db.collection('VocabularyList').findOne({ _id: new ObjectId(listId), userId: req.user!.id });
    if (!list) {
      return res.status(404).json({ error: 'Vocabulary list not found' });
    }
    // Delete word
    const result = await db.collection('Word').deleteOne({ _id: new ObjectId(wordId), vocabularyListId: new ObjectId(listId) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Word not found' });
    }
    return res.json({ message: 'Word deleted successfully' });
  } catch (error) {
    console.error('Error deleting word:', error);
    return res.status(500).json({ error: 'Failed to delete word' });
  }
});

export default router; 