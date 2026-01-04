import NodeCache from 'node-cache';
import { VocabularyService } from '../services/vocabulary.service';
import logger from './logger';

// Shared cache instance - guaranteed singleton even with hot reloading
const globalWithCache = global as typeof globalThis & {
    vocabularyCache: NodeCache | undefined;
};

export const vocabularyCache = globalWithCache.vocabularyCache || new NodeCache({ stdTTL: 300 });

globalWithCache.vocabularyCache = vocabularyCache;


/**
 * Generate cache key for user's vocabulary lists
 */
export const getCacheKey = {
    userLists: (userId: string, page: number, limit: number) =>
        `vocab_lists_${userId}_${page}_${limit}`,
    singleList: (listId: string) =>
        `vocab_list_${listId}`,
    userAllListsPattern: (userId: string) =>
        `vocab_lists_${userId}_`
};

/**
 * Invalidate cache for a specific list and all user list views
 */
export const invalidateListCache = (userId: string, listId?: string) => {
    logger.debug('Invalidating cache for user:', { userId, listId });
    const keys = vocabularyCache.keys();

    // Invalidate specific list
    if (listId) {
        const listKey = getCacheKey.singleList(listId);
        vocabularyCache.del(listKey);
        logger.debug('Invalidated single list cache:', { listKey });
    }

    // Invalidate all user list views (pagination)
    const pattern = getCacheKey.userAllListsPattern(userId);
    const userKeys = keys.filter(k => k.startsWith(pattern));

    if (userKeys.length > 0) {
        vocabularyCache.del(userKeys);
        logger.debug('Invalidated user list views:', { count: userKeys.length, pattern });
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
