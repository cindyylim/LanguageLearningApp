import OpenAI from 'openai';
import logger from './logger';
import { AppError } from './AppError';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODERATION_MODEL = process.env.OPENAI_MODERATION_MODEL || 'omni-moderation-latest';
const SCORE_THRESHOLD = Number(process.env.MODERATION_SCORE_THRESHOLD ?? '0.2');

const FLAGGED_CATEGORIES = [
  'hate',
  'hate/threatening',
  'harassment',
  'harassment/threatening',
  'violence',
  'violence/graphic',
  'sexual',
  'sexual/minors',
  'self-harm',
  'self-harm/intent',
  'self-harm/instructions',
  'illicit',
  'illicit/violent',
] as const;

export class ModerationError extends AppError {
  readonly code = 'MODERATION_BLOCKED';

  constructor(label: 'Input' | 'Generated content') {
    const message =
      label === 'Input'
        ? "Your topic contains content that isn't allowed. Please choose a different subject, such as travel, food, or hobbies."
        : "We couldn't generate safe content from that request. Please try a different topic or vocabulary list.";

    super(message, 400);
    this.name = 'ModerationError';
  }
}

function getOpenAiViolation(result: OpenAI.Moderations.Moderation): string | null {
  if (result.flagged) {
    return 'OpenAI moderation flagged this content';
  }

  for (const category of FLAGGED_CATEGORIES) {
    if (result.categories[category]) {
      return `category "${category}"`;
    }

    const score = result.category_scores[category];
    if (typeof score === 'number' && score >= SCORE_THRESHOLD) {
      return `category "${category}" score ${score.toFixed(3)} >= ${SCORE_THRESHOLD}`;
    }
  }

  return null;
}

export async function assertContentAllowed(
  input: string,
  label: 'Input' | 'Generated content'
): Promise<void> {
  const text = input.trim();
  if (!text) {
    return;
  }

  const moderation = await openai.moderations.create({
    input: text,
    model: MODERATION_MODEL,
  });

  const result = moderation.results[0];
  if (!result) {
    throw new Error('Moderation check returned no result.');
  }

  const violation = getOpenAiViolation(result);
  if (violation) {
    logger.warn('Content blocked by OpenAI moderation', {
      label,
      violation,
      model: MODERATION_MODEL,
      categories: result.categories,
    });
    throw new ModerationError(label);
  }
}

/** Moderate combined text and each segment individually (avoids diluted scores in long JSON). */
export async function assertAllContentAllowed(
  segments: string[],
  label: 'Input' | 'Generated content'
): Promise<void> {
  const nonEmpty = segments.map((s) => s.trim()).filter(Boolean);
  if (nonEmpty.length === 0) {
    return;
  }

  await assertContentAllowed(nonEmpty.join('\n'), label);

  for (const segment of nonEmpty) {
    await assertContentAllowed(segment, label);
  }
}
