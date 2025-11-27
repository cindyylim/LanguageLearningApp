import { GoogleGenerativeAI } from "@google/generative-ai";

const gemini = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

export interface Word {
  id: string;
  word: string;
  translation: string;
  partOfSpeech?: string;
  difficulty: string;
}

export interface AdaptiveMetrics {
  avgMastery: number;
  avgStreak: number;
  avgReviewCount: number;
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

export class AIService {
  private static readonly MODEL = gemini.getGenerativeModel({
    model: "gemini-2.0-flash",
  });
  private static readonly MAX_RETRIES = 3;
  private static readonly INITIAL_DELAY_MS = 1000; // 1 second

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
          `- [ID: ${w.id}] ${w.word} (${w.translation}) - ${
            w.partOfSpeech || "unknown"
          }`
      )
      .join("\n");

    for (let attempt = 1; attempt <= AIService.MAX_RETRIES; attempt++) {
      try {
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
        const result = await AIService.MODEL.generateContent(prompt);
        const responseText = result.response.text();

        // Safer JSON cleanup
        const cleaned = responseText
          .replace(/```[a-z]*\n?|```/gi, "")
          .trim()
          .replace(/^\[?/, "[")
          .replace(/\]?$/, "]");

        const questions = JSON.parse(cleaned) as Question[];
        return questions.slice(0, questionCount);
      } catch (error) {
        console.error(
          `Attempt ${attempt} failed for generating questions.`,
          error
        );

        if (attempt === AIService.MAX_RETRIES) {
          // Final attempt failed, throw the specific error.
          throw new Error(
            "Failed to generate questions after multiple retries."
          );
        }

        // Exponential backoff: Wait longer on each failure (1s, 2s, 4s...)
        const delay = AIService.INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    // Should never be reached if logic is correct, but required for type safety
    throw new Error("Failed to generate questions due to unexpected flow.");
  }
  /**
   * Generate contextual sentences for vocabulary words
   */
  static async generateContextualSentences(
    words: Word[],
    targetLanguage: string,
    nativeLanguage: string
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

    for (let attempt = 1; attempt <= AIService.MAX_RETRIES; attempt++) {
      try {
        const result = await AIService.MODEL.generateContent(prompt);
        const responseText = result.response.text();
        const cleaned = responseText.replace(/```[a-z]*\n?|```/gi, "").trim();
        return JSON.parse(cleaned);
      } catch (error) {
        console.error(
          `Attempt ${attempt} failed for generating sentences.`,
          error
        );

        if (attempt === AIService.MAX_RETRIES) {
          throw new Error(
            "Failed to generate contextual sentences after multiple retries."
          );
        }

        const delay = AIService.INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw new Error(
      "Failed to generate contextual sentences due to unexpected flow."
    );
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

    for (let attempt = 1; attempt <= AIService.MAX_RETRIES; attempt++) {
      try {
        const result = await AIService.MODEL.generateContent(prompt);
        const responseText = result.response.text();
        const cleaned = responseText.replace(/```[a-z]*\n?|```/gi, "").trim();
        return JSON.parse(cleaned); // Success!
      } catch (error) {
        console.error(
          `Attempt ${attempt} failed for analyzing complexity.`,
          error
        );

        if (attempt === AIService.MAX_RETRIES) {
          // Final attempt failed, use the fallback data
          return {
            complexity: "medium",
            score: 0.5,
            suggestions: [
              "Unable to analyze complexity after multiple retries.",
            ],
          };
        }

        const delay = AIService.INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    // Should be caught by the fallback above, but here for absolute type safety
    throw new Error(
      "Failed to analyze text complexity due to unexpected flow."
    );
  }

  static calculateAdaptiveDifficulty = async (
    userProgress: UserProgress[],
    targetScore: number = 0.8
  ): Promise<{
    recommendedDifficulty: string;
    nextReviewDate: Date;
  }> => {
    try {
      if (userProgress.length === 0) {
        // Default for new users
        return {
          recommendedDifficulty: "easy",
          nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        };
      }

      // --- 1. Calculate Core Metrics ---
      const metrics: AdaptiveMetrics = userProgress.reduce(
        (acc, p) => ({
          avgMastery: acc.avgMastery + p.mastery,
          avgStreak: acc.avgStreak + p.streak,
          avgReviewCount: acc.avgReviewCount + p.reviewCount,
        }),
        { avgMastery: 0, avgStreak: 0, avgReviewCount: 0 }
      );

      metrics.avgMastery /= userProgress.length;
      metrics.avgStreak /= userProgress.length;
      metrics.avgReviewCount /= userProgress.length;

      // --- 2. Determine Recommended Difficulty ---

      let recommendedDifficulty: string;
      const mastery = metrics.avgMastery;

      // Use targetScore and a lower threshold (e.g., targetScore * 0.75) for grading
      const hardThreshold = targetScore; // 0.8
      const mediumThreshold = targetScore * 0.75; // 0.6

      if (mastery >= hardThreshold) {
        recommendedDifficulty = "hard";
      } else if (mastery >= mediumThreshold) {
        recommendedDifficulty = "medium";
      } else {
        recommendedDifficulty = "easy";
      }

      // --- 3. Calculate Next Review Date (Spaced Repetition) ---

      let intervalMultiplier: number;

      switch (recommendedDifficulty) {
        case "hard":
          // Mastering well, use a higher interval multiplier (e.g., 3x the base)
          intervalMultiplier = 3;
          break;
        case "medium":
          // Solid but not perfect, use a standard multiplier
          intervalMultiplier = 1.5;
          break;
        case "easy":
        default:
          // Struggling, review sooner
          intervalMultiplier = 1;
          break;
      }

      // Base interval uses the exponential approach, scaled by difficulty
      const baseInterval = Math.pow(2, metrics.avgReviewCount);
      const daysUntilNextReview = Math.min(
        baseInterval * intervalMultiplier,
        30
      ); // Cap at 30 days

      const nextReviewDate = new Date();
      nextReviewDate.setDate(nextReviewDate.getDate() + daysUntilNextReview);

      return {
        recommendedDifficulty,
        nextReviewDate,
      };
    } catch (error) {
      console.error("Error calculating adaptive difficulty:", error);
      return {
        recommendedDifficulty: "medium",
        nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };
    }
  };
/**
 * Optimize spaced repetition intervals using an SM-2-like algorithm.
 */
static async optimizeSpacedRepetition(
  userProgress: UserProgress,
  performanceHistory: { score: number; date: Date }[]
): Promise<{
  nextReviewDate: Date;
  interval: number; // days
}> {
  const interval = Math.min(1, userProgress.mastery * 7)
  // Calculate the next review date
  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + interval);

  return {
    nextReviewDate: nextReviewDate,
    interval: interval, // days
  };
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
        .filter((p) => p.mastery < 0.6)
        .map((p) => p.wordId);

      // Analyze recent performance trends
      const avgRecentScore =
        recentPerformance.length > 0
          ? recentPerformance.reduce((sum, p) => sum + p.score, 0) /
            recentPerformance.length
          : 0.5;

      const focusAreas = [];
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

      return {
        focusAreas,
        recommendedWords: weakWords,
        studyPlan,
        estimatedTime,
      };
    } catch (error) {
      console.error("Error generating recommendations:", error);
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
    for (let attempt = 1; attempt <= AIService.MAX_RETRIES; attempt++) {
      try {
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
        const result = await AIService.MODEL.generateContent(aiPrompt);
        const response = await result.response;
        const responseText = response.text();
        // Remove Markdown code block if present
        const cleaned = responseText.replace(/```[a-z]*\n?|```/gi, "").trim();
        return JSON.parse(cleaned);
      } catch (error) {
        console.error('Error generating vocabulary list:', error);

        if (attempt === AIService.MAX_RETRIES) {
          console.error('Error generating vocabulary list:', error);
          return [];
        }

        const delay = AIService.INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    return [];
  }
}
