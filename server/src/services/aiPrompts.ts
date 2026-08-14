import { getLanguageName } from '../utils/languages';
import type { Difficulty, Word } from '../../../shared/types/index';

export function buildQuestionsPrompt(
  words: Word[],
  targetLanguage: string,
  nativeLanguage: string,
  questionCount: number,
  difficulty: Difficulty
): string {
  const wordsPrompt = words
    .map(
      (w) =>
        `- [ID: ${w._id}] ${w.word} (${w.translation}) - ${w.partOfSpeech || 'unknown'}`
    )
    .join('\n');

  const targetLang = getLanguageName(targetLanguage);
  const nativeLang = getLanguageName(nativeLanguage);

  return `
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
}

export function buildContextualSentencesPrompt(
  words: Word[],
  targetLanguage: string
): string {
  const targetLang = getLanguageName(targetLanguage);

  return `
Generate 3 contextual sentences for each vocabulary word in ${targetLang}.
Provide natural, everyday usage examples that help learners understand the word in context.

Words:
${words.map((w) => `- [ID: ${w._id}] ${w.word} (${w.translation})`).join('\n')}

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
}

export function buildVocabularyListPrompt(
  prompt: string,
  targetLanguage: string,
  nativeLanguage: string,
  wordCount: number
): string {
  const targetLang = getLanguageName(targetLanguage);
  const nativeLang = getLanguageName(nativeLanguage);

  return `
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
}
