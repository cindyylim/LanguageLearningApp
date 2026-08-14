import { Db } from 'mongodb';
import logger from './logger';

/**
 * Creates database indexes for query performance. Call once at startup.
 *
 * Indexes match query patterns in the vocabulary, quiz, analytics, and auth services.
 */
export async function ensureIndexes(db: Db): Promise<void> {
    logger.info('Creating database indexes...');

    try {
        // ============================================
        // USER COLLECTION INDEXES
        // ============================================
        // Used in: auth.ts (login, register)
        await db.collection('User').createIndex(
            { email: 1 },
            { unique: true, name: 'idx_user_email' }
        );
        logger.info('User indexes created');

        // ============================================
        // VOCABULARY LIST COLLECTION INDEXES
        // ============================================
        // Used in: vocabulary.ts (get all lists, sorted by updatedAt)
        await db.collection('VocabularyList').createIndex(
            { userId: 1, updatedAt: -1 },
            { name: 'idx_vocablist_user_updated' }
        );

        // Used in: vocabulary.ts (get specific list by id and userId)
        await db.collection('VocabularyList').createIndex(
            { _id: 1, userId: 1 },
            { name: 'idx_vocablist_id_user' }
        );
        logger.info('VocabularyList indexes created');

        // ============================================
        // WORD COLLECTION INDEXES
        // ============================================
        // Used in: vocabulary.ts (get words by vocabularyListId)
        await db.collection('Word').createIndex(
            { vocabularyListId: 1 },
            { name: 'idx_word_vocablist' }
        );

        // Used in: vocabulary.ts (get word by id and vocabularyListId)
        await db.collection('Word').createIndex(
            { _id: 1, vocabularyListId: 1 },
            { name: 'idx_word_id_vocablist' }
        );

        // Text search index for word and translation fields
        // Useful for future search functionality
        await db.collection('Word').createIndex(
            { word: 'text', translation: 'text' },
            { name: 'idx_word_text_search' }
        );
        logger.info('Word indexes created');

        // ============================================
        // WORD PROGRESS COLLECTION INDEXES
        // ============================================
        // Used in: vocabulary.ts, quizzes.ts, analytics.ts (get/update progress by userId and wordId)
        await db.collection('WordProgress').createIndex(
            { userId: 1, wordId: 1 },
            { unique: true, name: 'idx_wordprogress_user_word' }
        );

        // Used in: analytics.ts (get all progress for user)
        await db.collection('WordProgress').createIndex(
            { userId: 1 },
            { name: 'idx_wordprogress_user' }
        );

        logger.info('WordProgress indexes created');

        // ============================================
        // QUIZ COLLECTION INDEXES
        // ============================================
        // Used in: quizzes.ts (get all quizzes for user, sorted by createdAt)
        await db.collection('Quiz').createIndex(
            { userId: 1, createdAt: -1 },
            { name: 'idx_quiz_user_created' }
        );

        // Used in: quizzes.ts (get specific quiz by id and userId)
        await db.collection('Quiz').createIndex(
            { _id: 1, userId: 1 },
            { name: 'idx_quiz_id_user' }
        );
        logger.info('Quiz indexes created');

        // ============================================
        // QUIZ QUESTION COLLECTION INDEXES
        // ============================================
        // Used in: quizzes.ts (get all questions for a quiz)
        await db.collection('QuizQuestion').createIndex(
            { quizId: 1 },
            { name: 'idx_quizquestion_quiz' }
        );

        logger.info('QuizQuestion indexes created');

        // ============================================
        // QUIZ ATTEMPT COLLECTION INDEXES
        // ============================================
        // Used in: quizzes.ts, analytics.ts (get attempts by user, sorted by createdAt)
        await db.collection('QuizAttempt').createIndex(
            { userId: 1, createdAt: -1 },
            { name: 'idx_quizattempt_user_created' }
        );

        // Compound index for user and quiz
        await db.collection('QuizAttempt').createIndex(
            { quizId: 1, userId: 1, createdAt: -1 },
            { name: 'idx_quizattempt_quiz_user_created' }
        );
        logger.info('QuizAttempt indexes created');

        // ============================================
        // QUIZ ANSWER COLLECTION INDEXES
        // ============================================
        // Used in: quizzes.ts (get answers for attempt)
        await db.collection('QuizAnswer').createIndex(
            { attemptId: 1 },
            { name: 'idx_quizanswer_attempt' }
        );

        await db.collection('QuizAnswer').createIndex(
            { userId: 1 },
            { name: 'idx_quizanswer_user' }
        );
        logger.info('QuizAnswer indexes created');

        // ============================================
        // LEARNING STATS COLLECTION INDEXES
        // ============================================
        // Used in: vocabulary.ts, quizzes.ts (find stats by userId and date range)
        await db.collection('LearningStats').createIndex(
            { userId: 1, date: 1 },
            { unique: true, name: 'idx_learningstats_user_date' }
        );
        logger.info('LearningStats indexes created');

        logger.info('All database indexes created successfully!');
        logger.info('Performance optimization complete');
    } catch (error) {
        logger.error('Error creating indexes:', { error });
        throw error;
    }
}
