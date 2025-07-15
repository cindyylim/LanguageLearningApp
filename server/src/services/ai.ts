import { GoogleGenerativeAI } from '@google/generative-ai';

const gemini = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

export interface Word {
  id: string;
  word: string;
  translation: string;
  partOfSpeech?: string;
  difficulty: string;
}

export interface Question {
  question: string;
  type: 'multiple_choice' | 'fill_blank' | 'sentence_completion';
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
  /**
   * Generate contextual questions from vocabulary using Gemini
   */
  static async generateQuestions(
    words: Word[],
    targetLanguage: string,
    nativeLanguage: string,
    questionCount: number = 10,
    difficulty: string = 'medium'
  ): Promise<Question[]> {
    try {
      const prompt = `
Generate ${questionCount} language learning questions for the following vocabulary words.
Target language: ${targetLanguage}
Native language: ${nativeLanguage}
Difficulty level: ${difficulty}

Vocabulary words:
${words.map(w => `- ${w.word} (${w.translation}) - ${w.partOfSpeech || 'unknown'}`).join('\n')}

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
    "wordId": "word_id_here"
  }
]
`;
      const model = gemini.getGenerativeModel({ model: "gemini-2.0-flash" });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const responseText = response.text();
      // Remove Markdown code block if present
      const cleaned = responseText.replace(/```[a-z]*\n?|```/gi, '').trim();
      const questions = JSON.parse(cleaned) as Question[];
      return questions.slice(0, questionCount);
    } catch (error) {
      console.error('Error generating questions:', error);
      throw new Error('Failed to generate questions');
    }
  }

  /**
   * Generate contextual sentences for vocabulary words
   */
  static async generateContextualSentences(
    words: Word[],
    targetLanguage: string,
    nativeLanguage: string
  ): Promise<{ wordId: string; sentences: string[] }[]> {
    try {
      const prompt = `
Generate 3 contextual sentences for each vocabulary word in ${targetLanguage}.
Provide natural, everyday usage examples that help learners understand the word in context.

Words:
${words.map(w => `- ${w.word} (${w.translation})`).join('\n')}

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
      const model = gemini.getGenerativeModel({ model: "gemini-2.0-flash" });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const responseText = response.text();
      // Remove Markdown code block if present
      const cleaned = responseText.replace(/```[a-z]*\n?|```/gi, '').trim();
      return JSON.parse(cleaned);
    } catch (error) {
      console.error('Error generating contextual sentences:', error);
      throw new Error('Failed to generate contextual sentences');
    }
  }

  /**
   * Analyze text complexity and difficulty using Gemini
   */
  static async analyzeTextComplexity(text: string, targetLanguage: string): Promise<{
    complexity: 'easy' | 'medium' | 'hard';
    score: number;
    suggestions: string[];
  }> {
    try {
      const model = gemini.getGenerativeModel({ model: "gemini-2.0-flash" });
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
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const responseText = response.text();
      // Remove Markdown code block if present
      const cleaned = responseText.replace(/```[a-z]*\n?|```/gi, '').trim();
      return JSON.parse(cleaned);
    } catch (error) {
      console.error('Error analyzing text complexity:', error);
      // Fallback to basic analysis
      return {
        complexity: 'medium',
        score: 0.5,
        suggestions: ['Unable to analyze complexity']
      };
    }
  }

  /**
   * Calculate adaptive difficulty based on user performance
   */
  static async calculateAdaptiveDifficulty(
    userProgress: UserProgress[],
    targetScore: number = 0.8
  ): Promise<{
    recommendedDifficulty: string;
    confidence: number;
    nextReviewDate: Date;
  }> {
    try {
      // Calculate average mastery
      const avgMastery = userProgress.reduce((sum, p) => sum + p.mastery, 0) / userProgress.length;
      
      // Calculate success rate based on streaks
      const totalStreaks = userProgress.reduce((sum, p) => sum + p.streak, 0);
      const successRate = totalStreaks / (userProgress.length * 5); // Assuming 5 is max streak
      
      // Determine recommended difficulty
      let recommendedDifficulty: string;
      let confidence: number;
      
      if (avgMastery >= 0.8 && successRate >= 0.8) {
        recommendedDifficulty = 'hard';
        confidence = 0.9;
      } else if (avgMastery >= 0.6 && successRate >= 0.6) {
        recommendedDifficulty = 'medium';
        confidence = 0.7;
      } else {
        recommendedDifficulty = 'easy';
        confidence = 0.8;
      }
      
      // Calculate next review date using spaced repetition
      const avgReviewCount = userProgress.reduce((sum, p) => sum + p.reviewCount, 0) / userProgress.length;
      const daysUntilNextReview = Math.pow(2, avgReviewCount); // Exponential spacing
      const nextReviewDate = new Date();
      nextReviewDate.setDate(nextReviewDate.getDate() + Math.min(daysUntilNextReview, 30)); // Cap at 30 days
      
      return {
        recommendedDifficulty,
        confidence,
        nextReviewDate
      };
    } catch (error) {
      console.error('Error calculating adaptive difficulty:', error);
      return {
        recommendedDifficulty: 'medium',
        confidence: 0.5,
        nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000) // Default to tomorrow
      };
    }
  }

  /**
   * Optimize spaced repetition intervals using AI
   */
  static async optimizeSpacedRepetition(
    wordId: string,
    userProgress: UserProgress,
    performanceHistory: { score: number; date: Date }[]
  ): Promise<{
    nextReviewDate: Date;
    interval: number; // days
    confidence: number;
  }> {
    try {
      // Analyze performance patterns
      const recentScores = performanceHistory
        .slice(-5) // Last 5 attempts
        .map(p => p.score);
      
      const avgRecentScore = recentScores.reduce((sum, score) => sum + score, 0) / recentScores.length;
      const trend = recentScores.length >= 2 
        ? (recentScores[recentScores.length - 1] || 0) - (recentScores[0] || 0)
        : 0;
      
      // Calculate optimal interval based on performance
      let baseInterval: number;
      if (avgRecentScore >= 0.9) {
        baseInterval = Math.pow(2, userProgress.reviewCount + 1); // Exponential growth
      } else if (avgRecentScore >= 0.7) {
        baseInterval = Math.pow(2, userProgress.reviewCount);
      } else {
        baseInterval = Math.max(1, Math.pow(2, userProgress.reviewCount - 1)); // Shorter intervals
      }
      
      // Adjust based on trend
      if (trend < -0.1) {
        baseInterval = Math.max(1, baseInterval * 0.7); // Decrease interval if performance declining
      } else if (trend > 0.1) {
        baseInterval = baseInterval * 1.2; // Increase interval if performance improving
      }
      
      const nextReviewDate = new Date();
      nextReviewDate.setDate(nextReviewDate.getDate() + Math.min(baseInterval, 60)); // Cap at 60 days
      
      const confidence = Math.min(0.9, 0.5 + (avgRecentScore * 0.4));
      
      return {
        nextReviewDate,
        interval: baseInterval,
        confidence
      };
    } catch (error) {
      console.error('Error optimizing spaced repetition:', error);
      return {
        nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Default to tomorrow
        interval: 1,
        confidence: 0.5
      };
    }
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
        .filter(p => p.mastery < 0.6)
        .map(p => p.wordId);
      
      // Analyze recent performance trends
      const avgRecentScore = recentPerformance.length > 0
        ? recentPerformance.reduce((sum, p) => sum + p.score, 0) / recentPerformance.length
        : 0.5;
      
      const focusAreas = [];
      if (weakWords.length > 0) {
        focusAreas.push('vocabulary_review');
      }
      if (avgRecentScore < 0.7) {
        focusAreas.push('practice_questions');
      }
      if (userProgress.some(p => p.streak < 2)) {
        focusAreas.push('consistency_building');
      }
      
      // Generate study plan
      const studyPlan = focusAreas.includes('vocabulary_review') 
        ? 'Focus on reviewing difficult words with contextual examples'
        : 'Continue with regular practice and introduce new vocabulary';
      
      const estimatedTime = focusAreas.length * 15; // 15 minutes per focus area
      
      return {
        focusAreas,
        recommendedWords: weakWords,
        studyPlan,
        estimatedTime
      };
    } catch (error) {
      console.error('Error generating recommendations:', error);
      return {
        focusAreas: ['general_practice'],
        recommendedWords: [],
        studyPlan: 'Continue with regular study routine',
        estimatedTime: 20
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
  ): Promise<{ word: string; translation: string; partOfSpeech?: string; difficulty?: string }[]> {
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
      const model = gemini.getGenerativeModel({ model: "gemini-2.0-flash" });
      const result = await model.generateContent(aiPrompt);
      const response = await result.response;
      const responseText = response.text();
      // Remove Markdown code block if present
      const cleaned = responseText.replace(/```[a-z]*\n?|```/gi, '').trim();
      return JSON.parse(cleaned);
    } catch (error) {
      console.error('Error generating vocabulary list:', error);
      throw new Error('Failed to generate vocabulary list');
    }
  }
} 