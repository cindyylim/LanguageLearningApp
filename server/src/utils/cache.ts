import NodeCache from 'node-cache';
import { VocabularyService } from '../services/vocabulary.service';
import logger from './logger';

// Shared cache instance
export const vocabularyCache = new NodeCache({ stdTTL: 300 }); // Cache for 5 minutes

/**
 * Generate cache key for user's vocabulary lists
 */
export const getCacheKey = {
    userLists: (userId: string, page: number, limit: number) =>
        `vocab_lists_${userId}_${page}_${limit}`,
    singleList: (listId: string) =>
        `vocab_list_${listId}`,
    userAllListsPattern: (userId: string) =>
        `vocab_lists_${userId}`
};

/**
 * Invalidate cache for a specific list and all user list views
 */
export const invalidateListCache = (userId: string, listId?: string) => {
    const keys = vocabularyCache.keys();

    // Invalidate specific list
    if (listId) {
        const listKey = getCacheKey.singleList(listId);
        vocabularyCache.del(listKey);
    }

    // Invalidate all user list views (pagination)
    const userKeys = keys.filter(k => k.startsWith(getCacheKey.userAllListsPattern(userId)));
    if (userKeys.length > 0) {
        vocabularyCache.del(userKeys);
    }
};

/**
 * Warm cache for a user by pre-fetching their vocabulary lists
 */
export const warmCacheForUser = async (userId: string) => {
    try {
        // Pre-fetch first page
        const lists = await VocabularyService.getUserLists(userId, 1, 20);
        const cacheKey = getCacheKey.userLists(userId, 1, 20);
        vocabularyCache.set(cacheKey, lists);

        return true;
    } catch (error) {
        logger.error('Failed to warm cache for user:', { userId, error });
        return false;
    }
};

/**
 * Get cache statistics
 */
export const getCacheStats = () => {
    return vocabularyCache.getStats();
};

/**
 * Clear all cache
 */
export const clearAllCache = () => {
    vocabularyCache.flushAll();
};
