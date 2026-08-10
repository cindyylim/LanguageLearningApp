import OpenAI from "openai";
import { CircuitBreaker } from "../utils/CircuitBreaker";
import { RequestQueue } from "../utils/RequestQueue";
import { z } from "zod";
import logger from '../utils/logger';
import { getLanguageName } from '../utils/languages';
import { assertAllContentAllowed, assertContentAllowed, ModerationError } from '../utils/moderation';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface Word {
  id: string;
  word: string;
  translation: string;
  partOfSpeech?: string;
  difficulty: string;
}

export type Difficulty = "easy" | "medium" | "hard";

export interface Question {
  question: string;
  type: "multiple_choice" | "fill_blank" | "sentence_completion";
  correctAnswer: string;
  options?: string[];
  context?: string;
  difficulty: string;
  wordId?: string;
}

export interface UserProgress {
  userId: string;
  wordId: string;
  mastery: number;
  reviewCount: number;
  streak: number;
  lastReviewed?: Date;
}

// Zod Schemas for Validation
const QuestionSchema = z.object({
  question: z.string().min(1),
  type: z.enum(["multiple_choice", "fill_blank", "sentence_completion"]),
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
  partOfSpeech: z.string().optional(),
  difficulty: z.string().optional(),
});

const VocabularyListSchema = z.array(VocabularyWordSchema);

// Metrics tracking
interface AIMetrics {
  operation: string;
  startTime: number;
  retryCount: number;
  errorType?: string;
  statusCode?: number;
  responseTimeMs?: number;
}

export class AIService {
  private static readonly MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
  private static readonly MAX_RETRIES = 3;
  private static readonly INITIAL_DELAY_MS = 1000;

  private static readonly circuitBreaker = new CircuitBreaker({
    failureThreshold: 5,
    resetTimeout: 60000,
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
              role: "system",
              content:
                "You are a helpful language learning assistant. Return valid JSON when asked for structured data. Do not wrap JSON in markdown code blocks.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.7,
        });

        const text = completion.choices[0]?.message?.content?.trim();
        if (!text) {
          throw new Error("Empty response from OpenAI");
        }

        return text;
      })
    );

    return response;
  }

  /**
   * Log AI operation metrics and errors
   */
  private static logMetrics(metrics: AIMetrics, error?: Error): void {
    const logData = {
      operation: metrics.operation,
      durationMs: Date.now() - metrics.startTime,
      retryCount: metrics.retryCount,
      errorType: metrics.errorType,
      statusCode: metrics.statusCode,
      responseTimeMs: metrics.responseTimeMs,
    };

    if (error) {
      logger.error(`AI Operation Failed: ${metrics.operation}`, {
        ...logData,
        errorMessage: error.message,
        errorStack: error.stack,
      });
    } else {
      logger.info(`AI Operation Success: ${metrics.operation}`, logData);
    }
  }

  /**
   * Categorize error types for better monitoring
   */
  private static categorizeError(error: unknown): string {
    if (error instanceof ModerationError) {
      return 'MODERATION_ERROR';
    }
    if (error instanceof z.ZodError) {
      return 'VALIDATION_ERROR';
    }
    if (error instanceof SyntaxError) {
      return 'JSON_PARSE_ERROR';
    }
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('quota') || errorMessage.includes('rate limit')) {
      return 'RATE_LIMIT_ERROR';
    }
    if (errorMessage.includes('timeout')) {
      return 'TIMEOUT_ERROR';
    }
    if (errorMessage.includes('network') || errorMessage.includes('ECONNREFUSED')) {
      return 'NETWORK_ERROR';
    }
    if (errorMessage.includes('API key')) {
      return 'AUTHENTICATION_ERROR';
    }
    if (errorMessage.includes('circuit breaker')) {
      return 'CIRCUIT_BREAKER_OPEN';
    }
    if (errorMessage.includes('flagged by moderation')) {
      return 'MODERATION_ERROR';
    }

    return 'UNKNOWN_ERROR';
  }

  static async generateQuestions(
    words: Word[],
    targetLanguage: string,
    nativeLanguage: string,
    questionCount: number = 10,
    difficulty: Difficulty = "medium"
  ): Promise<Question[]> {
    const wordsPrompt = words
      .map(
        (w) =>
          `- [ID: ${w.id}] ${w.word} (${w.translation}) - ${w.partOfSpeech || "unknown"
          }`
      )
      .join("\n");

    const metrics: AIMetrics = {
      operation: 'generateQuestions',
      startTime: Date.now(),
      retryCount: 0,
    };

    for (let attempt = 1; attempt <= AIService.MAX_RETRIES; attempt++) {
      metrics.retryCount = attempt - 1;
      const attemptStartTime = Date.now();

      try {
        logger.debug(`Generating questions - Attempt ${attempt}/${AIService.MAX_RETRIES}`, {
          wordCount: words.length,
          targetLanguage,
          nativeLanguage,
          questionCount,
          difficulty,
        });

        const targetLang = getLanguageName(targetLanguage);
        const nativeLang = getLanguageName(nativeLanguage);

        const prompt = `
Generate ${questionCount} language learning questions for the following vocabulary words.
Target language (language being learned): ${targetLang}
Native language (learner's language for explanations): ${nativeLang}
Difficulty level: ${difficulty}

Vocabulary words (Use the provided ID for the 'wordId' field):
${wordsPrompt}

Requirements:
1. Create a mix of question types: multiple choice, fill-in-the-blank, and sentence completion
2. Questions should be contextual and practical
3. Include 3-4 options for multiple choice questions
4. Provide explanations or context where helpful
5. Ensure questions are appropriate for ${difficulty} level

Return the response as a JSON array with the following structure:
[
  {
    "question": "Question text",
    "type": "multiple_choice|fill_blank|sentence_completion",
    "correctAnswer": "Correct answer",
    "options": ["option1", "option2", "option3", "option4"],
    "context": "Additional context or explanation",
    "difficulty": "easy|medium|hard",
    "wordId": "word_id_from_the_list" 
  }
]
`;
        await assertAllContentAllowed(
          words.map((w) => `${w.word} ${w.translation}`),
          'Input'
        );

        const responseText = await AIService.generateText(prompt);
        metrics.responseTimeMs = Date.now() - attemptStartTime;

        const cleaned = responseText
          .replace(/```[a-z]*\n?|```/gi, "")
          .trim()
          .replace(/^\[?/, "[")
          .replace(/\]?$/, "]");

        const parsed = JSON.parse(cleaned);
        const questions = QuestionsArraySchema.parse(parsed) as Question[];

        await assertAllContentAllowed(
          questions.flatMap((q) => [
            q.question,
            q.correctAnswer,
            q.context ?? '',
            ...(q.options ?? []),
          ]),
          'Generated content'
        );

        AIService.logMetrics(metrics);
        logger.info('Questions generated successfully', {
          questionCount: questions.length,
          attemptNumber: attempt,
          responseTimeMs: metrics.responseTimeMs,
        });

        return questions.slice(0, questionCount);
      } catch (error) {
        const errorType = AIService.categorizeError(error);
        metrics.errorType = errorType;
        metrics.responseTimeMs = Date.now() - attemptStartTime;

        logger.warn(`Question generation attempt ${attempt} failed`, {
          attempt,
          maxRetries: AIService.MAX_RETRIES,
          errorType,
          errorMessage: error instanceof Error ? error.message : String(error),
          wordCount: words.length,
          responseTimeMs: metrics.responseTimeMs,
        });

        if (errorType === 'MODERATION_ERROR') {
          AIService.logMetrics(metrics, error instanceof Error ? error : new Error(String(error)));
          throw error instanceof Error ? error : new Error(String(error));
        }

        if (attempt === AIService.MAX_RETRIES) {
          AIService.logMetrics(metrics, error instanceof Error ? error : new Error(String(error)));
          logger.error(`Attempt ${attempt} failed for generating questions.`, { error, attempt });
          throw new Error(
            `Failed to generate questions after ${AIService.MAX_RETRIES} retries. Error type: ${errorType}`
          );
        }

        const delay = AIService.INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
        logger.debug(`Retrying in ${delay}ms...`, { attempt, delay });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    const finalError = new Error("Failed to generate questions due to unexpected flow.");
    AIService.logMetrics(metrics, finalError);
    throw finalError;
  }

  /**
   * Generate contextual sentences for vocabulary words
   */
  static async generateContextualSentences(
    words: Word[],
    targetLanguage: string,
  ): Promise<{ wordId: string; sentences: string[] }[]> {
    const targetLang = getLanguageName(targetLanguage);

    const prompt = `
Generate 3 contextual sentences for each vocabulary word in ${targetLang}.
Provide natural, everyday usage examples that help learners understand the word in context.

Words:
${words.map((w) => `- [ID: ${w.id}] ${w.word} (${w.translation})`).join("\n")}

Return as JSON:
[
{
  "wordId": "word_id",
  "sentences": [
    "Sentence 1 in ${targetLang}",
    "Sentence 2 in ${targetLang}",
    "Sentence 3 in ${targetLang}"
  ]
}
]
`;

    const metrics: AIMetrics = {
      operation: 'generateContextualSentences',
      startTime: Date.now(),
      retryCount: 0,
    };

    for (let attempt = 1; attempt <= AIService.MAX_RETRIES; attempt++) {
      metrics.retryCount = attempt - 1;
      const attemptStartTime = Date.now();

      try {
        logger.debug(`Generating contextual sentences - Attempt ${attempt}/${AIService.MAX_RETRIES}`, {
          wordCount: words.length,
          targetLanguage,
        });

        await assertAllContentAllowed(
          words.map((w) => `${w.word} ${w.translation}`),
          'Input'
        );

        const responseText = await AIService.generateText(prompt);
        metrics.responseTimeMs = Date.now() - attemptStartTime;

        const cleaned = responseText.replace(/```[a-z]*\n?|```/gi, "").trim();
        const parsed = JSON.parse(cleaned);
        const sentences = ContextualSentencesArraySchema.parse(parsed);

        await assertAllContentAllowed(
          sentences.flatMap((entry) => entry.sentences),
          'Generated content'
        );

        AIService.logMetrics(metrics);
        logger.info('Contextual sentences generated successfully', {
          wordCount: words.length,
          sentenceCount: sentences.length,
          attemptNumber: attempt,
          responseTimeMs: metrics.responseTimeMs,
        });

        return sentences;
      } catch (error) {
        const errorType = AIService.categorizeError(error);
        metrics.errorType = errorType;
        metrics.responseTimeMs = Date.now() - attemptStartTime;

        logger.warn(`Contextual sentence generation attempt ${attempt} failed`, {
          attempt,
          maxRetries: AIService.MAX_RETRIES,
          errorType,
          errorMessage: error instanceof Error ? error.message : String(error),
          wordCount: words.length,
          responseTimeMs: metrics.responseTimeMs,
        });

        if (errorType === 'MODERATION_ERROR') {
          AIService.logMetrics(metrics, error instanceof Error ? error : new Error(String(error)));
          throw error instanceof Error ? error : new Error(String(error));
        }

        if (attempt === AIService.MAX_RETRIES) {
          AIService.logMetrics(metrics, error instanceof Error ? error : new Error(String(error)));
          logger.error(`Attempt ${attempt} failed for generating contextual sentences.`, { error, attempt });
          throw new Error(
            `Failed to generate contextual sentences after ${AIService.MAX_RETRIES} retries. Error type: ${errorType}`
          );
        }

        const delay = AIService.INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
        logger.debug(`Retrying in ${delay}ms...`, { attempt, delay });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    const finalError = new Error(
      "Failed to generate contextual sentences due to unexpected flow."
    );
    AIService.logMetrics(metrics, finalError);
    throw finalError;
  }

  /**
   * Generate personalized learning recommendations
   */
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
      const weakWords = userProgress
        .filter((p) => p.mastery < 1.0)
        .map((p) => p.wordId);
      const avgRecentScore =
        recentPerformance.length > 0
          ? recentPerformance.reduce((sum, p) => sum + p.score, 0) /
          recentPerformance.length
          : 0.5;

      const focusAreas: string[] = [];
      if (weakWords.length > 0) {
        focusAreas.push("vocabulary_review");
      }
      if (avgRecentScore < 0.7) {
        focusAreas.push("practice_questions");
      }
      if (userProgress.some((p) => p.streak < 2)) {
        focusAreas.push("consistency_building");
      }

      const studyPlan = focusAreas.includes("vocabulary_review")
        ? "Focus on reviewing difficult words with contextual examples"
        : "Continue with regular practice and introduce new vocabulary";

      const estimatedTime = focusAreas.length * 15;

      const recommendations = {
        focusAreas,
        recommendedWords: weakWords,
        studyPlan,
        estimatedTime,
      };

      return RecommendationsSchema.parse(recommendations);
    } catch (error) {
      const errorType = AIService.categorizeError(error);

      logger.error("Error generating recommendations:", {
        operation: 'generateRecommendations',
        userId,
        progressCount: userProgress.length,
        performanceCount: recentPerformance.length,
        errorType,
        errorMessage: error instanceof Error ? error.message : String(error),
      });

      return {
        focusAreas: ["general_practice"],
        recommendedWords: [],
        studyPlan: "Continue with regular study routine",
        estimatedTime: 20,
      };
    }
  }

  /**
   * Generate a vocabulary list using OpenAI based on a prompt/keywords
   */
  static async generateVocabularyList(
    prompt: string,
    targetLanguage: string,
    nativeLanguage: string,
    wordCount: number = 10
  ): Promise<
    {
      word: string;
      translation: string;
      partOfSpeech?: string;
      difficulty?: string;
    }[]
  > {
    const metrics: AIMetrics = {
      operation: 'generateVocabularyList',
      startTime: Date.now(),
      retryCount: 0,
    };

    for (let attempt = 1; attempt <= AIService.MAX_RETRIES; attempt++) {
      metrics.retryCount = attempt - 1;
      const attemptStartTime = Date.now();

      try {
        logger.debug(`Generating vocabulary list - Attempt ${attempt}/${AIService.MAX_RETRIES}`, {
          prompt,
          wordCount,
          targetLanguage,
          nativeLanguage,
        });

        await assertContentAllowed(prompt, 'Input');

        const targetLang = getLanguageName(targetLanguage);
        const nativeLang = getLanguageName(nativeLanguage);

        const aiPrompt = `
Generate a list of ${wordCount} useful vocabulary words for language learners based on the following topic or keywords: "${prompt}".

IMPORTANT:
- The "word" field MUST be written in ${targetLang} (the language being learned).
- The "translation" field MUST be written in ${nativeLang} (the learner's native language).
- Do NOT use any other language for these fields.

For each word, provide:
- The word in ${targetLang}
- Its translation in ${nativeLang}
- Part of speech (if possible)
- Difficulty (easy, medium, or hard)

Return the result as a JSON array with this structure:
[
  { "word": "...", "translation": "...", "partOfSpeech": "...", "difficulty": "easy|medium|hard" },
  ...
]
`;
        const responseText = await AIService.generateText(aiPrompt);
        metrics.responseTimeMs = Date.now() - attemptStartTime;

        const cleaned = responseText.replace(/```[a-z]*\n?|```/gi, "").trim();
        const parsed = JSON.parse(cleaned);
        const vocabularyList = VocabularyListSchema.parse(parsed);

        await assertAllContentAllowed(
          vocabularyList.flatMap((entry) => [entry.word, entry.translation]),
          'Generated content'
        );

        AIService.logMetrics(metrics);
        logger.info('Vocabulary list generated successfully', {
          wordCount: vocabularyList.length,
          prompt,
          attemptNumber: attempt,
          responseTimeMs: metrics.responseTimeMs,
        });

        return vocabularyList;
      } catch (error) {
        const errorType = AIService.categorizeError(error);
        metrics.errorType = errorType;
        metrics.responseTimeMs = Date.now() - attemptStartTime;

        logger.warn(`Vocabulary list generation attempt ${attempt} failed`, {
          attempt,
          maxRetries: AIService.MAX_RETRIES,
          errorType,
          errorMessage: error instanceof Error ? error.message : String(error),
          prompt,
          wordCount,
          responseTimeMs: metrics.responseTimeMs,
        });

        if (errorType === 'MODERATION_ERROR') {
          AIService.logMetrics(metrics, error instanceof Error ? error : new Error(String(error)));
          throw error instanceof Error ? error : new Error(String(error));
        }

        if (attempt === AIService.MAX_RETRIES) {
          AIService.logMetrics(metrics, error instanceof Error ? error : new Error(String(error)));
          logger.error('Failed to generate vocabulary list - returning empty array', {
            errorType,
            prompt,
            wordCount,
          });
          return [];
        }

        const delay = AIService.INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
        logger.debug(`Retrying in ${delay}ms...`, { attempt, delay });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    return [];
  }

  /**
   * Check if the AI service is healthy
   */
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
      const errorType = AIService.categorizeError(error);
      const duration = Date.now() - startTime;

      logger.error("AI Service health check failed:", {
        errorType,
        errorMessage: error instanceof Error ? error.message : String(error),
        durationMs: duration,
      });

      throw error;
    }
  }
}
