import {
    vocabularyCache,
    getCacheKey,
    invalidateListCache,
    getCacheStats,
    clearAllCache,
    warmCacheForUser,
} from './cache';

// Mock logger
jest.mock('./logger', () => ({
    __esModule: true,
    default: {
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
    },
}));

// Mock VocabularyService
jest.mock('../services/vocabulary.service');

import { VocabularyService } from '../services/vocabulary.service';
import logger from './logger';

describe('Cache Utils', () => {
    beforeEach(() => {
        clearAllCache();
    });

    describe('getCacheKey', () => {
        it('should generate correct key for user lists', () => {
            const key = getCacheKey.userLists('user123', 1, 20);
            expect(key).toBe('vocab_lists_user123_1_20');
        });

        it('should generate correct key for single list', () => {
            const key = getCacheKey.singleList('list456');
            expect(key).toBe('vocab_list_list456');
        });

        it('should generate correct pattern for user lists', () => {
            const pattern = getCacheKey.userAllListsPattern('user123');
            expect(pattern).toBe('vocab_lists_user123_');
        });
    });

    describe('invalidateListCache', () => {
        it('should invalidate specific list cache', () => {
            const listId = 'list123';
            const key = getCacheKey.singleList(listId);

            vocabularyCache.set(key, { test: 'data' });
            expect(vocabularyCache.get(key)).toBeDefined();

            invalidateListCache('user123', listId);
            expect(vocabularyCache.get(key)).toBeUndefined();
        });

        it('should invalidate all user list caches', () => {
            const userId = 'user123';
            const key1 = getCacheKey.userLists(userId, 1, 20);
            const key2 = getCacheKey.userLists(userId, 2, 20);

            vocabularyCache.set(key1, { data: '1' });
            vocabularyCache.set(key2, { data: '2' });

            invalidateListCache(userId);

            expect(vocabularyCache.get(key1)).toBeUndefined();
            expect(vocabularyCache.get(key2)).toBeUndefined();
        });
    });

    describe('getCacheStats', () => {
        it('should return cache statistics', () => {
            const stats = getCacheStats();
            expect(stats).toBeDefined();
            expect(typeof stats).toBe('object');
        });
    });

    describe('clearAllCache', () => {
        it('should clear all cached items', () => {
            vocabularyCache.set('test1', 'data1');
            vocabularyCache.set('test2', 'data2');

            clearAllCache();

            expect(vocabularyCache.get('test1')).toBeUndefined();
            expect(vocabularyCache.get('test2')).toBeUndefined();
        });
    });

    describe('warmCacheForUser', () => {
        it('should warm cache with user vocabulary lists', async () => {
            const userId = 'user123';
            const lists = [{ _id: 'list1', name: 'French' }];
            (VocabularyService.getUserLists as jest.Mock).mockResolvedValue({
                lists,
                hasMore: false,
            });

            const result = await warmCacheForUser(userId);

            expect(result).toBe(true);
            expect(vocabularyCache.get(getCacheKey.userLists(userId, 1, 20))).toEqual({
                vocabularyLists: lists,
                hasMore: false,
            });
        });

        it('should return false and log when warming cache fails', async () => {
            const userId = 'user123';
            (VocabularyService.getUserLists as jest.Mock).mockRejectedValue(new Error('db down'));

            const result = await warmCacheForUser(userId);

            expect(result).toBe(false);
            expect(logger.error).toHaveBeenCalledWith(
                'Failed to warm cache for user:',
                expect.objectContaining({ userId })
            );
        });
    });
});
