import {
    vocabularyCache,
    getCacheKey,
    invalidateListCache,
    getCacheStats,
    clearAllCache
} from './cache';

// Mock logger
jest.mock('./logger', () => ({
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
}));

// Mock VocabularyService
jest.mock('../services/vocabulary.service');

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
            expect(pattern).toBe('vocab_lists_user123');
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
});
