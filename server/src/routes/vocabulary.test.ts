import request from "supertest";
import express from "express";
import { connectToDatabase } from "../utils/mongo";
import { ObjectId } from "mongodb";

// Mock the database
jest.mock("../utils/mongo");

// Mock the vocabulary service
jest.mock("../services/vocabulary.service");

const mockSanitizeVocabularyListName = jest.fn((name: string) => name);
const mockSanitizeDescription = jest.fn((desc?: string) => desc);
const mockSanitizeWordInput = jest.fn((input: string) => input);

// Mock the cache utility
const mockInvalidateListCache = jest.fn();
const mockVocabularyCacheGet = jest.fn();
const mockVocabularyCacheSet = jest.fn();
let mockWarmCacheForUserRef: jest.Mock; // <-- New reference variable
const mockGetCacheKeyUserListsRef = jest.fn(
  (userId: string, page: number, limit: number) =>
    `userLists_${userId}_${page}_${limit}`
);

jest.mock("../utils/cache", () => {
  mockWarmCacheForUserRef = jest.fn().mockReturnValue(Promise.resolve(true));
  return {
  invalidateListCache: mockInvalidateListCache,
  vocabularyCache: {
    get: mockVocabularyCacheGet,
    set: mockVocabularyCacheSet,
  },
  getCacheKey: {
    userLists: mockGetCacheKeyUserListsRef,
  },
  warmCacheForUser: mockWarmCacheForUserRef,
  };
});

// Mock the sanitize utility
jest.mock("../utils/sanitize", () => ({
  sanitizeVocabularyListName: mockSanitizeVocabularyListName,
  sanitizeDescription: mockSanitizeDescription,
  sanitizeWordInput: mockSanitizeWordInput,
}));

// Mock the auth middleware
jest.mock("../middleware/auth", () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    req.user = { id: "test-user-id" };
    next();
  },
  AuthRequest: {},
}));

// Mock the error handling middleware
jest.mock("../middleware/error", () => ({
  AppError: class MockAppError extends Error {
    constructor(message: string, statusCode: number) {
      super(message);
      this.name = "AppError";
      this.statusCode = statusCode;
    }
    statusCode: number;
  },
  errorHandler: (err: any, req: any, res: any, next: any) => {
    if (err && err.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    return res.status(500).json({ message: "Internal server error" });
  },
}));

// Mock the rate limiter
jest.mock("../middleware/rateLimit", () => ({
  createUserRateLimiter: () => (req: any, res: any, next: any) => next(),
}));

// Mock the validation middleware
jest.mock("../middleware/validate", () => ({
  validate: (schema: any) => (req: any, res: any, next: any) => {
    // Simple validation mock - just pass through for tests
    next();
  },
}));

// Mock the validateObjectId middleware
jest.mock("../middleware/validateObjectId", () => ({
  validateObjectId: (paramName?: string) => (req: any, res: any, next: any) => {
    // Simple validation mock - just pass through for tests
    next();
  },
}));

// Import after mocking
import vocabularyRouter from "./vocabulary";
import { mock } from "node:test";

// Create a test app instance
const testApp = express();
testApp.use(express.json());

// Apply the auth middleware to test app
testApp.use((req: any, res: any, next: any) => {
  // Mock request ID middleware
  (req as any).id = "test-request-id";
  req.user = { id: "test-user-id" };
  next();
});

testApp.use("/api/vocabulary", vocabularyRouter);

// Add error middleware to test app
const { errorHandler } = require("../middleware/error");
testApp.use(errorHandler);

describe("Vocabulary API Endpoints", () => {
  let mockDb: any;
  let mockCollection: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup mock collection
    mockCollection = {
      findOne: jest.fn(),
      find: jest.fn().mockReturnThis(),
      insertOne: jest.fn(),
      updateOne: jest.fn(),
      deleteOne: jest.fn(),
      toArray: jest.fn(),
      aggregate: jest.fn().mockReturnThis(),
      insertMany: jest.fn(),
      deleteMany: jest.fn(),
      project: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
    };

    mockDb = {
      collection: jest.fn().mockReturnValue(mockCollection),
    };

    (connectToDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  // Mock authentication middleware for tests
  const mockAuthMiddleware = (req: any, res: any, next: any) => {
    req.user = { id: "test-user-id" };
    next();
  };

  // Apply the auth middleware to test app
  testApp.use((req: any, res: any, next: any) => {
    // Mock request ID middleware
    (req as any).id = "test-request-id";
    mockAuthMiddleware(req, res, next);
  });

  describe("POST /api/vocabulary", () => {
    it("should create a new vocabulary list", async () => {
      const listData = {
        name: "Test List",
        description: "Test Description",
        targetLanguage: "fr",
        nativeLanguage: "en",
      };

      const mockInsertedId = new ObjectId();
      const mockCreatedList = {
        _id: mockInsertedId,
        ...listData,
        userId: "test-user-id",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock the vocabulary service
      const { VocabularyService } = require("../services/vocabulary.service");
      VocabularyService.createList = jest
        .fn()
        .mockResolvedValue(mockCreatedList);

      // Mock warmCacheForUser to resolve successfully
      mockWarmCacheForUserRef.mockResolvedValue(undefined);

      const response = await request(testApp)
        .post("/api/vocabulary")
        .send(listData)
        .expect(201);

      expect(response.body).toEqual({
        vocabularyList: expect.objectContaining({
          _id: mockInsertedId.toString(),
          name: listData.name,
          description: listData.description,
          targetLanguage: listData.targetLanguage,
          nativeLanguage: listData.nativeLanguage,
        }),
      });
      expect(mockInvalidateListCache).toHaveBeenCalledWith("test-user-id");
      expect(mockWarmCacheForUserRef).toHaveBeenCalledWith("test-user-id");
    });

    it("should return 500 for invalid data", async () => {
      const invalidData = {
        name: "", // Empty name should fail validation
        targetLanguage: "fr",
      };

      const response = await request(testApp)
        .post("/api/vocabulary")
        .send(invalidData)
        .expect(500);

      expect(response.body).toHaveProperty("message");
    });
  });

  describe("GET /api/vocabulary", () => {
    it("should get user vocabulary lists", async () => {
      const mockLists: any[] = [
        {
          _id: new ObjectId().toString(),
          name: "List 1",
          userId: "test-user-id",
          _count: { words: 5 },
        },
        {
          _id: new ObjectId().toString(),
          name: "List 2",
          userId: "test-user-id",
          _count: { words: 10 },
        },
      ];

      // Mock the vocabulary service
      const { VocabularyService } = require("../services/vocabulary.service");
      VocabularyService.getUserLists = jest.fn().mockResolvedValue(mockLists);

      const response = await request(testApp)
        .get("/api/vocabulary")
        .expect(200);

      expect(response.body).toEqual({
        vocabularyLists: mockLists,
        page: 1,
        limit: 20,
      });

      expect(mockGetCacheKeyUserListsRef).toHaveBeenCalledWith(
        "test-user-id",
        1,
        20
      );

      const expectedKey = mockGetCacheKeyUserListsRef.mock.results[0]?.value;
      expect(mockVocabularyCacheSet).toHaveBeenCalledWith(
        expectedKey,
        mockLists
      );
    });

    it("should support pagination", async () => {
      const mockLists: any[] = [];

      // Mock the vocabulary service
      const { VocabularyService } = require("../services/vocabulary.service");
      VocabularyService.getUserLists = jest.fn().mockResolvedValue(mockLists);
      const response = await request(testApp)
        .get("/api/vocabulary?page=2&limit=5")
        .expect(200);

      expect(response.body).toEqual({
        vocabularyLists: [],
        page: 2,
        limit: 5,
      });
      expect(mockGetCacheKeyUserListsRef).toHaveBeenCalledWith(
        "test-user-id",
        2,
        5
      );
      const expectedKey = mockGetCacheKeyUserListsRef.mock.results[0]?.value;
      expect(mockVocabularyCacheSet).toHaveBeenCalledWith(
        expectedKey,
        mockLists
      );
    });
    it("should return cached list", async () => {
      const mockLists: any[] = [
        {
          _id: new ObjectId().toString(),
          name: "Cached List 1",
          userId: "test-user-id",
          _count: { words: 5 },
        },
      ];

      // Mock vocabularyCache to return cached data
      mockVocabularyCacheGet.mockReturnValue(mockLists);

      const response = await request(testApp)
        .get("/api/vocabulary")
        .expect(200);

      expect(response.body).toEqual({
        vocabularyLists: mockLists,
        page: 1,
        limit: 20,
      });

      expect(mockGetCacheKeyUserListsRef).toHaveBeenCalledWith(
        "test-user-id",
        1,
        20
      );
      const expectedKey = mockGetCacheKeyUserListsRef.mock.results[0]?.value;
      // Verify cache was checked before database
      expect(mockVocabularyCacheGet).toHaveBeenCalledWith(expectedKey);
    });
  });

  describe("GET /api/vocabulary/:id", () => {
    it("should get specific vocabulary list", async () => {
      const listId = new ObjectId();
      const mockList = {
        _id: listId.toString(),
        name: "Test List",
        userId: "test-user-id",
        targetLanguage: "fr",
        nativeLanguage: "en",
      };

      const { VocabularyService } = require("../services/vocabulary.service");
      VocabularyService.getListById = jest.fn().mockResolvedValue(mockList);
      const response = await request(testApp)
        .get(`/api/vocabulary/${listId}`)
        .expect(200);

      expect(response.body).toEqual({
        vocabularyList: mockList,
      });
    });

    it("should return 404 for non-existent list", async () => {
      const nonExistentId = new ObjectId();

      const { VocabularyService } = require("../services/vocabulary.service");
      VocabularyService.getListById = jest.fn().mockResolvedValue(null);

      const response = await request(testApp)
        .get(`/api/vocabulary/${nonExistentId}`)
        .expect(404);

      expect(response.body).toHaveProperty("message");
    });
  });

  describe("PUT /api/vocabulary/:id", () => {
    it("should update vocabulary list", async () => {
      const listId = new ObjectId();
      const updateData = {
        name: "Updated List",
        description: "Updated Description",
      };

      const { VocabularyService } = require("../services/vocabulary.service");
      VocabularyService.updateList = jest.fn().mockResolvedValue(true);

      const response = await request(testApp)
        .put(`/api/vocabulary/${listId}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toEqual({
        message: "Vocabulary list updated successfully",
      });
      expect(mockInvalidateListCache).toHaveBeenCalledWith(
        "test-user-id",
        listId.toString()
      );
    });

    it("should return 404 for non-existent list", async () => {
      const nonExistentId = new ObjectId();
      const updateData = {
        name: "Updated List",
        description: "Updated Description",
      };

      const { VocabularyService } = require("../services/vocabulary.service");
      VocabularyService.updateList = jest.fn().mockResolvedValue(false);
      const response = await request(testApp)
        .put(`/api/vocabulary/${nonExistentId}`)
        .send(updateData)
        .expect(404);

      expect(response.body).toHaveProperty("message");
    });
  });

  describe("DELETE /api/vocabulary/:id", () => {
    it("should delete vocabulary list", async () => {
      const listId = new ObjectId();
      const { VocabularyService } = require("../services/vocabulary.service");
      VocabularyService.deleteList = jest.fn().mockResolvedValue({
        deletedWords: 2,
        deletedWordProgress: 2,
      });
      const response = await request(testApp)
        .delete(`/api/vocabulary/${listId}`)
        .expect(200);

      expect(response.body).toEqual({
        message: "Vocabulary list deleted successfully",
        deletedWords: 2,
        deletedWordProgress: 2,
      });
      expect(mockInvalidateListCache).toHaveBeenCalledWith(
        "test-user-id",
        listId.toString()
      );
    });

    it("should return 404 for non-existent list", async () => {
      const nonExistentId = new ObjectId();

      const { VocabularyService } = require("../services/vocabulary.service");
      VocabularyService.deleteList = jest.fn().mockResolvedValue(null);
      const response = await request(testApp)
        .delete(`/api/vocabulary/${nonExistentId}`)
        .expect(404);

      expect(response.body).toHaveProperty("message");
    });
  });

  describe("POST /api/vocabulary/:id/words", () => {
    it("should add word to vocabulary list", async () => {
      const listId = new ObjectId();
      const wordData = {
        word: "bonjour",
        translation: "hello",
        partOfSpeech: "noun",
        difficulty: "easy",
      };

      const insertedId = new ObjectId();
      const mockNewWord = {
        _id: insertedId.toString(),
        ...wordData,
        vocabularyListId: listId.toString(),
      };

      // Mock the vocabulary service
      const { VocabularyService } = require("../services/vocabulary.service");
      VocabularyService.addWord = jest.fn().mockResolvedValue(mockNewWord);
      const response = await request(testApp)
        .post(`/api/vocabulary/${listId}/words`)
        .send(wordData)
        .expect(201);

      expect(response.body).toEqual({
        word: mockNewWord,
      });
      expect(mockInvalidateListCache).toHaveBeenCalledWith(
        "test-user-id",
        listId.toString()
      );
    });

    it("should return 404 for non-existent list", async () => {
      const nonExistentId = new ObjectId();
      const wordData = {
        word: "bonjour",
        translation: "hello",
        partOfSpeech: "noun",
        difficulty: "easy",
      };

      const { VocabularyService } = require("../services/vocabulary.service");
      VocabularyService.addWord = jest.fn().mockResolvedValue(null);
      const response = await request(testApp)
        .post(`/api/vocabulary/${nonExistentId}/words`)
        .send(wordData)
        .expect(404);

      expect(response.body).toHaveProperty("message");
    });
  });

  describe("POST /api/vocabulary/:id/generate-sentences", () => {
    it("should generate sentences for vocabulary list", async () => {
      const listId = new ObjectId();
      const mockSentences = [
        { word: "bonjour", sentence: "Bonjour, comment allez-vous?" },
        { word: "merci", sentence: "Merci beaucoup pour votre aide." },
      ];

      // Mock the vocabulary service
      const { VocabularyService } = require("../services/vocabulary.service");
      VocabularyService.generateSentences = jest
        .fn()
        .mockResolvedValue(mockSentences);

      const response = await request(testApp)
        .post(`/api/vocabulary/${listId}/generate-sentences`)
        .expect(200);

      expect(response.body).toEqual({
        sentences: mockSentences,
      });
      expect(VocabularyService.generateSentences).toHaveBeenCalledWith(
        listId.toString(),
        "test-user-id"
      );
    });

    it("should return 404 for non-existent list when generating sentences", async () => {
      const nonExistentId = new ObjectId();

      // Mock the vocabulary service to return null (list not found)
      const { VocabularyService } = require("../services/vocabulary.service");
      VocabularyService.generateSentences = jest.fn().mockResolvedValue(null);

      const response = await request(testApp)
        .post(`/api/vocabulary/${nonExistentId}/generate-sentences`)
        .expect(404);

      expect(response.body).toHaveProperty("message");
    });
  });

  describe("GET /api/vocabulary/words/:wordId/progress", () => {
    it("should get word progress", async () => {
      const wordId = new ObjectId();
      const mockProgress = {
        _id: new ObjectId(),
        wordId: wordId,
        userId: "test-user-id",
        mastery: 0.7,
        status: "learning",
        reviewCount: 3,
        lastReviewed: new Date(),
      };

      // Mock the vocabulary service
      const { VocabularyService } = require("../services/vocabulary.service");
      VocabularyService.getWordProgress = jest
        .fn()
        .mockResolvedValue(mockProgress);

      const response = await request(testApp)
        .get(`/api/vocabulary/words/${wordId}/progress`)
        .expect(200);

      expect(response.body).toEqual({
        progress: expect.objectContaining({
          _id: mockProgress._id.toString(),
          wordId: mockProgress.wordId.toString(),
          userId: mockProgress.userId,
          mastery: mockProgress.mastery,
          status: mockProgress.status,
          reviewCount: mockProgress.reviewCount,
          lastReviewed: expect.any(String),
        }),
      });
      expect(VocabularyService.getWordProgress).toHaveBeenCalledWith(
        wordId.toString(),
        "test-user-id"
      );
    });
  });

  describe("POST /api/vocabulary/words/:wordId/progress", () => {
    it("should update word progress", async () => {
      const wordId = new ObjectId();
      const progressData = {
        status: "mastered",
        mastery: 0.9,
      };

      const mockUpdatedProgress = {
        _id: new ObjectId(),
        wordId: wordId,
        userId: "test-user-id",
        ...progressData,
        reviewCount: 4,
        lastReviewed: new Date(),
      };

      // Mock the vocabulary service
      const { VocabularyService } = require("../services/vocabulary.service");
      VocabularyService.updateWordProgress = jest
        .fn()
        .mockResolvedValue(mockUpdatedProgress);

      const response = await request(testApp)
        .post(`/api/vocabulary/words/${wordId}/progress`)
        .send(progressData)
        .expect(200);

      expect(response.body).toEqual({
        message: "Word progress updated successfully",
        progress: expect.objectContaining({
          _id: mockUpdatedProgress._id.toString(),
          wordId: mockUpdatedProgress.wordId.toString(),
          userId: mockUpdatedProgress.userId,
          mastery: mockUpdatedProgress.mastery,
          status: mockUpdatedProgress.status,
          reviewCount: mockUpdatedProgress.reviewCount,
          lastReviewed: expect.any(String),
        }),
      });
      expect(VocabularyService.updateWordProgress).toHaveBeenCalledWith(
        wordId.toString(),
        progressData.status,
        "test-user-id"
      );
    });

    it("should return 404 for non-existent word when updating progress", async () => {
      const nonExistentId = new ObjectId();
      const progressData = {
        status: "mastered",
      };

      // Mock the vocabulary service to return null (word not found)
      const { VocabularyService } = require("../services/vocabulary.service");
      VocabularyService.updateWordProgress = jest.fn().mockResolvedValue(null);

      const response = await request(testApp)
        .post(`/api/vocabulary/words/${nonExistentId}/progress`)
        .send(progressData)
        .expect(404);

      expect(response.body).toHaveProperty("message");
    });
  });

  describe("PUT /api/vocabulary/:listId/words/:wordId", () => {
    it("should update a word in vocabulary list", async () => {
      const listId = new ObjectId();
      const wordId = new ObjectId();
      const updateData = {
        word: "updated word",
        translation: "updated translation",
        partOfSpeech: "verb",
        difficulty: "hard",
      };

      const mockUpdatedWord = {
        _id: wordId.toString(),
        vocabularyListId: listId.toString(),
        ...updateData,
      };

      // Mock the vocabulary service
      const { VocabularyService } = require("../services/vocabulary.service");
      VocabularyService.updateWord = jest
        .fn()
        .mockResolvedValue(mockUpdatedWord);
      
      // Ensure sanitize functions return the input values
      mockSanitizeWordInput.mockImplementation((input: string) => input);

      const response = await request(testApp)
        .put(`/api/vocabulary/${listId}/words/${wordId}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toEqual({
        word: expect.objectContaining({
          _id: mockUpdatedWord._id.toString(),
          difficulty: mockUpdatedWord.difficulty,
          word: "updated word",
          translation: "updated translation",
          partOfSpeech: "verb",
          vocabularyListId: mockUpdatedWord.vocabularyListId.toString(),
        }),
      });
      expect(VocabularyService.updateWord).toHaveBeenCalledWith(
        listId.toString(),
        wordId.toString(),
        {
          difficulty: updateData.difficulty,
          word: "updated word",
          translation: "updated translation",
          partOfSpeech: "verb",
        },
        "test-user-id"
      );
      expect(mockInvalidateListCache).toHaveBeenCalledWith(
        "test-user-id",
        listId.toString()
      );
    });

    it("should return 404 for non-existent list or word when updating", async () => {
      const nonExistentId = new ObjectId();
      const wordId = new ObjectId();
      const updateData = {
        word: "updated word",
        translation: "updated translation",
        partOfSpeech: "verb",
        difficulty: "hard",
      };

      // Mock the vocabulary service to return null (list or word not found)
      const { VocabularyService } = require("../services/vocabulary.service");
      VocabularyService.updateWord = jest.fn().mockResolvedValue(null);

      const response = await request(testApp)
        .put(`/api/vocabulary/${nonExistentId}/words/${wordId}`)
        .send(updateData);

      expect(response.body).toHaveProperty("message");
      expect(response.body.message).toEqual(
        "Vocabulary list or word not found"
      );
    });
  });

  describe("DELETE /api/vocabulary/:listId/words/:wordId", () => {
    it("should delete a word from vocabulary list", async () => {
      const listId = new ObjectId();
      const wordId = new ObjectId();

      // Mock the vocabulary service
      const { VocabularyService } = require("../services/vocabulary.service");
      VocabularyService.deleteWord = jest.fn().mockResolvedValue(true);

      const response = await request(testApp)
        .delete(`/api/vocabulary/${listId}/words/${wordId}`)
        .expect(200);

      expect(response.body).toEqual({
        message: "Word deleted successfully",
      });
      expect(VocabularyService.deleteWord).toHaveBeenCalledWith(
        listId.toString(),
        wordId.toString(),
        "test-user-id"
      );
      // Verify cache is invalidated when word is deleted
      expect(mockInvalidateListCache).toHaveBeenCalledWith(
        "test-user-id",
        listId.toString()
      );
    });

    it("should return 404 for non-existent list or word when deleting", async () => {
      const nonExistentId = new ObjectId();
      const wordId = new ObjectId();

      // Mock the vocabulary service to return false (list or word not found)
      const { VocabularyService } = require("../services/vocabulary.service");
      VocabularyService.deleteWord = jest.fn().mockResolvedValue(false);

      const response = await request(testApp)
        .delete(`/api/vocabulary/${nonExistentId}/words/${wordId}`)
        .expect(404);

      expect(response.body).toHaveProperty("message");
    });
  });

  describe("POST /api/vocabulary/generate-ai-list", () => {
    it("should generate vocabulary list using AI", async () => {
      const aiListData = {
        name: "AI Generated List",
        description: "Generated by AI",
        targetLanguage: "fr",
        nativeLanguage: "en",
        prompt: "Basic French greetings",
        wordCount: 5,
      };

      const mockAIList = {
        _id: new ObjectId().toString(),
        name: aiListData.name,
        description: aiListData.description,
        targetLanguage: aiListData.targetLanguage,
        nativeLanguage: aiListData.nativeLanguage,
        userId: "test-user-id",
        words: [
          { word: "bonjour", translation: "hello" },
          { word: "merci", translation: "thank you" },
        ],
      };

      // Mock the vocabulary service
      const { VocabularyService } = require("../services/vocabulary.service");
      VocabularyService.generateAIList = jest
        .fn()
        .mockResolvedValue(mockAIList);

      const response = await request(testApp)
        .post("/api/vocabulary/generate-ai-list")
        .send(aiListData)
        .expect(201);

      expect(response.body).toEqual({
        vocabularyList: expect.objectContaining({
          _id: mockAIList._id.toString(),
          name: mockAIList.name,
          description: mockAIList.description,
          targetLanguage: mockAIList.targetLanguage,
          nativeLanguage: mockAIList.nativeLanguage,
          userId: mockAIList.userId,
          words: mockAIList.words,
        }),
      });
      expect(VocabularyService.generateAIList).toHaveBeenCalledWith(
        aiListData,
        "test-user-id"
      );
    });
  });
});
