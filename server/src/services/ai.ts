import OpenAI from 'openai';
import { CircuitBreaker } from '../utils/CircuitBreaker';
import { RequestQueue } from '../utils/RequestQueue';
import { z } from 'zod';
import logger from '../utils/logger';
import { assertAllContentAllowed, assertContentAllowed } from '../utils/moderation';
import {
  categorizeAIError,
  executeWithRetry,
  isRetryableAIError,
  parseJsonWithSchema,
} from './aiHelpers';
import {
  buildContextualSentencesPrompt,
  buildQuestionsPrompt,
  buildVocabularyListPrompt,
} from './aiPrompts';
import { WordStatus, type AIWordInput, type Difficulty, type Question, type UserProgress, type WordProgress } from '../shared/types/index';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const QuestionSchema = z.object({
  question: z.string().min(1),
  type: z.enum(['multiple_choice', 'fill_blank', 'sentence_completion']),
  correctAnswer: z.string().min(1),
  options: z.array(z.string()).optional(),
  context: z.string().optional(),
  difficulty: z.string(),
  wordId: z.string().optional(),
});

const QuestionsArraySchema = z.array(QuestionSchema);

const ContextualSentenceSchema = z.object({
  wordId: z.string(),
  sentences: z.array(z.string()),
});

const ContextualSentencesArraySchema = z.array(ContextualSentenceSchema);

const RecommendationsSchema = z.object({
  focusAreas: z.array(z.string()),
  recommendedWords: z.array(z.string()),
  studyPlan: z.string(),
  estimatedTime: z.number(),
});

const VocabularyWordSchema = z.object({
  word: z.string(),
  translation: z.string(),
  pinyin: z.string().optional(),
  partOfSpeech: z.string().optional(),
  difficulty: z.string().optional(),
});

const VocabularyListSchema = z.array(VocabularyWordSchema);

export class AIService {
  private static readonly MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  private static readonly MAX_RETRIES = 3;
  private static readonly INITIAL_DELAY_MS = 1000;

  private static readonly circuitBreaker = new CircuitBreaker({
    failureThreshold: 5,
    resetTimeout: 60000,
    countFailure: isRetryableAIError,
  });

  private static readonly requestQueue = new RequestQueue({
    concurrency: 3,
    rateLimit: 15,
    interval: 60000,
  });

  private static async generateText(prompt: string): Promise<string> {
    const response = await AIService.requestQueue.add(() =>
      AIService.circuitBreaker.execute(async () => {
        const completion = await openai.chat.completions.create({
          model: AIService.MODEL,
          messages: [
            {
              role: 'system',
              content:
                'You are a helpful language learning assistant. Return valid JSON when asked for structured data. Do not wrap JSON in markdown code blocks.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
        });

        const text = completion.choices[0]?.message?.content?.trim();
        if (!text) {
          throw new Error('Empty response from OpenAI');
        }

        return text;
      })
    );

    return response;
  }

  static async generateQuestions(
    words: AIWordInput[],
    targetLanguage: string,
    nativeLanguage: string,
    questionCount: number = 10,
    difficulty: Difficulty = 'medium'
  ): Promise<Question[]> {
    const prompt = buildQuestionsPrompt(
      words,
      targetLanguage,
      nativeLanguage,
      questionCount,
      difficulty
    );

    return executeWithRetry({
      operation: 'generateQuestions',
      maxRetries: AIService.MAX_RETRIES,
      initialDelayMs: AIService.INITIAL_DELAY_MS,
      runAttempt: async () => {
        await assertAllContentAllowed(
          words.map((w) => `${w.word} ${w.translation}`),
          'Input'
        );

        const responseText = await AIService.generateText(prompt);
        const questions = parseJsonWithSchema(
          responseText,
          QuestionsArraySchema,
          true
        ) as Question[];

        await assertAllContentAllowed(
          questions.flatMap((q) => [
            q.question,
            q.correctAnswer,
            q.context ?? '',
            ...(q.options ?? []),
          ]),
          'Generated content'
        );

        return questions.slice(0, questionCount);
      },
      onSuccess: (questions, attempt, responseTimeMs) => {
        logger.info('Questions generated successfully', {
          questionCount: questions.length,
          attemptNumber: attempt,
          responseTimeMs,
        });
      },
    });
  }

  static async generateContextualSentences(
    words: AIWordInput[],
    targetLanguage: string
  ): Promise<{ wordId: string; sentences: string[] }[]> {
    const prompt = buildContextualSentencesPrompt(words, targetLanguage);

    return executeWithRetry({
      operation: 'generateContextualSentences',
      maxRetries: AIService.MAX_RETRIES,
      initialDelayMs: AIService.INITIAL_DELAY_MS,
      runAttempt: async () => {
        await assertAllContentAllowed(
          words.map((w) => `${w.word} ${w.translation}`),
          'Input'
        );

        const responseText = await AIService.generateText(prompt);
        const sentences = parseJsonWithSchema(
          responseText,
          ContextualSentencesArraySchema
        );

        await assertAllContentAllowed(
          sentences.flatMap((entry) => entry.sentences),
          'Generated content'
        );

        return sentences;
      },
      onSuccess: (sentences, attempt, responseTimeMs) => {
        logger.info('Contextual sentences generated successfully', {
          wordCount: sentences.length,
          attemptNumber: attempt,
          responseTimeMs,
        });
      },
    });
  }

  static async generateRecommendations(
    userId: string,
    userProgress: UserProgress[],
    recentPerformance: { wordId: string; score: number; date: Date }[]
  ): Promise<{
    focusAreas: string[];
    recommendedWords: string[];
    studyPlan: string;
    estimatedTime: number;
  }> {
    try {
      const weakWordIds = userProgress
        .filter((p) => p.status === WordStatus.NEW || p.status === WordStatus.LEARNING)
        .map((p) => p.wordId);
      const avgRecentScore =
        recentPerformance.length > 0
          ? recentPerformance.reduce((sum, p) => sum + p.score, 0) /
            recentPerformance.length
          : 0.5;

      const focusAreas: string[] = [];
      if (weakWordIds.length > 0) {
        focusAreas.push('vocabulary_review');
      }
      if (avgRecentScore < 0.7) {
        focusAreas.push('practice_questions');
      }
      if (userProgress.some((p) => p.streak < 2)) {
        focusAreas.push('consistency_building');
      }

      const studyPlan = focusAreas.includes('vocabulary_review')
        ? 'Focus on reviewing difficult words with contextual examples'
        : 'Continue with regular practice and introduce new vocabulary';

      const recommendations = {
        focusAreas,
        recommendedWords: weakWordIds,
        studyPlan,
        estimatedTime: focusAreas.length * 15,
      };

      return RecommendationsSchema.parse(recommendations);
    } catch (error) {
      const errorType = categorizeAIError(error);

      logger.error('Error generating recommendations:', {
        operation: 'generateRecommendations',
        userId,
        progressCount: userProgress.length,
        performanceCount: recentPerformance.length,
        errorType,
        errorMessage: error instanceof Error ? error.message : String(error),
      });

      return {
        focusAreas: ['general_practice'],
        recommendedWords: [],
        studyPlan: 'Continue with regular study routine',
        estimatedTime: 20,
      };
    }
  }

  static async generateVocabularyList(
    prompt: string,
    targetLanguage: string,
    nativeLanguage: string,
    wordCount: number = 10
  ): Promise<
    {
      word: string;
      translation: string;
      pinyin?: string;
      partOfSpeech?: string;
      difficulty?: string;
    }[]
  > {
    const aiPrompt = buildVocabularyListPrompt(
      prompt,
      targetLanguage,
      nativeLanguage,
      wordCount
    );

    return executeWithRetry({
      operation: 'generateVocabularyList',
      maxRetries: AIService.MAX_RETRIES,
      initialDelayMs: AIService.INITIAL_DELAY_MS,
      runAttempt: async () => {
        await assertContentAllowed(prompt, 'Input');

        const responseText = await AIService.generateText(aiPrompt);
        const vocabularyList = parseJsonWithSchema(
          responseText,
          VocabularyListSchema
        );

        await assertAllContentAllowed(
          vocabularyList.flatMap((entry) => [
            entry.word,
            entry.translation,
            entry.pinyin ?? '',
          ]),
          'Generated content'
        );

        return vocabularyList;
      },
      onSuccess: (vocabularyList, attempt, responseTimeMs) => {
        logger.info('Vocabulary list generated successfully', {
          wordCount: vocabularyList.length,
          prompt,
          attemptNumber: attempt,
          responseTimeMs,
        });
      },
      onMaxRetries: (error, errorType) => {
        logger.error('Failed to generate vocabulary list - returning empty array', {
          errorType,
          prompt,
          wordCount,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        return [];
      },
    });
  }

  static async healthCheck(): Promise<boolean> {
    const startTime = Date.now();

    try {
      logger.debug('Running AI service health check');

      const text = await AIService.generateText("Say 'OK'");
      const isHealthy = !!text;
      const duration = Date.now() - startTime;

      logger.info('AI service health check completed', {
        isHealthy,
        durationMs: duration,
      });

      return isHealthy;
    } catch (error) {
      const errorType = categorizeAIError(error);
      const duration = Date.now() - startTime;

      logger.error('AI Service health check failed:', {
        errorType,
        errorMessage: error instanceof Error ? error.message : String(error),
        durationMs: duration,
      });

      throw error;
    }
  }
}
