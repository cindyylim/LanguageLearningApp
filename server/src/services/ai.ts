import { GoogleGenerativeAI } from "@google/generative-ai";
import { CircuitBreaker } from "../utils/CircuitBreaker";
import { RequestQueue } from "../utils/RequestQueue";
import { z } from "zod";
import logger from '../utils/logger';

const gemini = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

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

const TextComplexitySchema = z.object({
  complexity: z.enum(["easy", "medium", "hard"]),
  score: z.number().min(0).max(1),
  suggestions: z.array(z.string()),
});

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
  private static readonly MODEL = gemini.getGenerativeModel({
    model: "gemini-2.0-flash",
  });
  private static readonly MAX_RETRIES = 3;
  private static readonly INITIAL_DELAY_MS = 1000; // 1 second

  private static readonly circuitBreaker = new CircuitBreaker({
    failureThreshold: 5,
    resetTimeout: 60000, // 1 minute
  });

  private static readonly requestQueue = new RequestQueue({
    concurrency: 3,
    rateLimit: 15, // 15 requests per minute (adjust based on quota)
    interval: 60000,
  });

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
        // Include the word ID directly in the prompt for the model to use
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

        const prompt = `
Generate ${questionCount} language learning questions for the following vocabulary words.
Target language: ${targetLanguage}
Native language: ${nativeLanguage}
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
        const result = await AIService.requestQueue.add(() =>
          AIService.circuitBreaker.execute(() =>
            AIService.MODEL.generateContent(prompt)
          )
        );
        const responseText = result.response.text();
        metrics.responseTimeMs = Date.now() - attemptStartTime;

        // Safer JSON cleanup
        const cleaned = responseText
          .replace(/```[a-z]*\n?|```/gi, "")
          .trim()
          .replace(/^\[?/, "[")
          .replace(/\]?$/, "]");

        const parsed = JSON.parse(cleaned);
        const questions = QuestionsArraySchema.parse(parsed) as Question[];

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

        if (attempt === AIService.MAX_RETRIES) {
          // Final attempt failed, log error metrics and throw
          AIService.logMetrics(metrics, error instanceof Error ? error : new Error(String(error)));
          logger.error(`Attempt ${attempt} failed for generating questions.`, { error, attempt });
          throw new Error(
            `Failed to generate questions after ${AIService.MAX_RETRIES} retries. Error type: ${errorType}`
          );
        }

        // Exponential backoff: Wait longer on each failure (1s, 2s, 4s...)
        const delay = AIService.INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
        logger.debug(`Retrying in ${delay}ms...`, { attempt, delay });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    // Should never be reached if logic is correct, but required for type safety
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
    // ... Prompt construction (omitted for brevity) ...
    const prompt = `
Generate 3 contextual sentences for each vocabulary word in ${targetLanguage}.
Provide natural, everyday usage examples that help learners understand the word in context.

Words:
${words.map((w) => `- [ID: ${w.id}] ${w.word} (${w.translation})`).join("\n")}

Return as JSON:
[
{
  "wordId": "word_id",
  "sentences": [
    "Sentence 1 in ${targetLanguage}",
    "Sentence 2 in ${targetLanguage}",
    "Sentence 3 in ${targetLanguage}"
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

        const result = await AIService.requestQueue.add(() =>
          AIService.circuitBreaker.execute(() =>
            AIService.MODEL.generateContent(prompt)
          )
        );
        const responseText = result.response.text();
        metrics.responseTimeMs = Date.now() - attemptStartTime;

        const cleaned = responseText.replace(/```[a-z]*\n?|```/gi, "").trim();
        const parsed = JSON.parse(cleaned);
        const sentences = ContextualSentencesArraySchema.parse(parsed);

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
   * Analyze text complexity and difficulty using Gemini
   */
  static async analyzeTextComplexity(
    text: string,
    targetLanguage: string
  ): Promise<{
    complexity: "easy" | "medium" | "hard";
    score: number;
    suggestions: string[];
  }> {
    // ... Prompt construction (omitted for brevity) ...
    const prompt = `
Analyze the complexity of this ${targetLanguage} text and provide a difficulty assessment.

Text: "${text}"

Provide analysis in JSON format:
{
"complexity": "easy|medium|hard",
"score": 0.0-1.0,
"suggestions": ["suggestion1", "suggestion2"]
}

Consider:
- Vocabulary difficulty
- Grammar complexity
- Sentence structure
- Cultural context
`;

    const metrics: AIMetrics = {
      operation: 'analyzeTextComplexity',
      startTime: Date.now(),
      retryCount: 0,
    };

    for (let attempt = 1; attempt <= AIService.MAX_RETRIES; attempt++) {
      metrics.retryCount = attempt - 1;
      const attemptStartTime = Date.now();

      try {
        logger.debug(`Analyzing text complexity - Attempt ${attempt}/${AIService.MAX_RETRIES}`, {
          textLength: text.length,
          targetLanguage,
        });

        const result = await AIService.requestQueue.add(() =>
          AIService.circuitBreaker.execute(() =>
            AIService.MODEL.generateContent(prompt)
          )
        );
        const responseText = result.response.text();
        metrics.responseTimeMs = Date.now() - attemptStartTime;

        const cleaned = responseText.replace(/```[a-z]*\n?|```/gi, "").trim();
        const parsed = JSON.parse(cleaned);
        const analysis = TextComplexitySchema.parse(parsed) as {
          complexity: "easy" | "medium" | "hard";
          score: number;
          suggestions: string[];
        };

        AIService.logMetrics(metrics);
        logger.info('Text complexity analyzed successfully', {
          complexity: analysis.complexity,
          score: analysis.score,
          attemptNumber: attempt,
          responseTimeMs: metrics.responseTimeMs,
        });

        return analysis;
      } catch (error) {
        const errorType = AIService.categorizeError(error);
        metrics.errorType = errorType;
        metrics.responseTimeMs = Date.now() - attemptStartTime;

        logger.warn(`Text complexity analysis attempt ${attempt} failed`, {
          attempt,
          maxRetries: AIService.MAX_RETRIES,
          errorType,
          errorMessage: error instanceof Error ? error.message : String(error),
          textLength: text.length,
          responseTimeMs: metrics.responseTimeMs,
        });

        if (attempt === AIService.MAX_RETRIES) {
          // Final attempt failed, log and use fallback data
          AIService.logMetrics(metrics, error instanceof Error ? error : new Error(String(error)));
          logger.error(`Attempt ${attempt} failed for analyzing complexity.`, { error, attempt });
          logger.warn('Using fallback complexity analysis', {
            errorType,
            textLength: text.length,
          });
          return {
            complexity: "medium",
            score: 0.5,
            suggestions: [
              "Unable to analyze complexity after multiple retries.",
            ],
          };
        }

        const delay = AIService.INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
        logger.debug(`Retrying in ${delay}ms...`, { attempt, delay });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    // Should be caught by the fallback above, but here for absolute type safety
    const finalError = new Error(
      "Failed to analyze text complexity due to unexpected flow."
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
    estimatedTime: number; // minutes
  }> {
    try {
      // Analyze weak areas
      const weakWords = userProgress
        .filter((p) => p.mastery < 1.0)
        .map((p) => p.wordId);
      // Analyze recent performance trends
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

      // Generate study plan
      const studyPlan = focusAreas.includes("vocabulary_review")
        ? "Focus on reviewing difficult words with contextual examples"
        : "Continue with regular practice and introduce new vocabulary";

      const estimatedTime = focusAreas.length * 15; // 15 minutes per focus area

      // Validate the generated recommendations structure (even though it's manually constructed here,
      // in a real AI scenario we'd validate the AI output)
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
   * Generate a vocabulary list using Gemini based on a prompt/keywords
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

        const aiPrompt = `
Generate a list of ${wordCount} useful vocabulary words for language learners based on the following topic or keywords: "${prompt}".
Target language: ${targetLanguage}
Native language: ${nativeLanguage}

For each word, provide:
- The word in the target language
- Its translation in the native language
- Part of speech (if possible)
- Difficulty (easy, medium, or hard)

Return the result as a JSON array with this structure:
[
  { "word": "...", "translation": "...", "partOfSpeech": "...", "difficulty": "easy|medium|hard" },
  ...
]
`;
        const result = await AIService.requestQueue.add(() =>
          AIService.circuitBreaker.execute(() =>
            AIService.MODEL.generateContent(aiPrompt)
          )
        );
        const response = await result.response;
        const responseText = response.text();
        metrics.responseTimeMs = Date.now() - attemptStartTime;

        // Remove Markdown code block if present
        const cleaned = responseText.replace(/```[a-z]*\n?|```/gi, "").trim();
        const parsed = JSON.parse(cleaned);
        const vocabularyList = VocabularyListSchema.parse(parsed);

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

      const prompt = "Say 'OK'";
      const result = await AIService.requestQueue.add(() =>
        AIService.circuitBreaker.execute(() =>
          AIService.MODEL.generateContent(prompt)
        )
      );
      const response = await result.response;
      const isHealthy = !!response.text();
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
