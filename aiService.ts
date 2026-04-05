import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../lib/logger';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const AI_MODEL = process.env.AI_MODEL ?? 'claude-opus-4-5';
const AI_MAX_TOKENS = parseInt(process.env.AI_MAX_TOKENS ?? '4096', 10);
const AI_TEMPERATURE = parseFloat(process.env.AI_TEMPERATURE ?? '0.3');
const AI_MAX_RETRIES = parseInt(process.env.AI_MAX_RETRIES ?? '3', 10);
const AI_RETRY_DELAY_MS = parseInt(process.env.AI_RETRY_DELAY_MS ?? '1000', 10);

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIRequestOptions {
  systemPrompt: string;
  messages: AIMessage[];
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

export interface AIResponse {
  content: string;
  tokensUsed: number;
  model: string;
  processingTimeMs: number;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callAI(options: AIRequestOptions): Promise<AIResponse> {
  const {
    systemPrompt,
    messages,
    maxTokens = AI_MAX_TOKENS,
    temperature = AI_TEMPERATURE,
    model = AI_MODEL,
  } = options;

  let lastError: Error | null = null;
  const startTime = Date.now();

  for (let attempt = 1; attempt <= AI_MAX_RETRIES; attempt++) {
    try {
      logger.debug({ attempt, model, maxTokens }, 'AI request attempt');

      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      });

      const textContent = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');

      const tokensUsed =
        (response.usage.input_tokens ?? 0) + (response.usage.output_tokens ?? 0);
      const processingTimeMs = Date.now() - startTime;

      logger.info({ tokensUsed, processingTimeMs, model, attempt }, 'AI request succeeded');

      return {
        content: textContent,
        tokensUsed,
        model: response.model,
        processingTimeMs,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const isRetryable =
        lastError.message.includes('overloaded') ||
        lastError.message.includes('timeout') ||
        lastError.message.includes('529') ||
        lastError.message.includes('500');

      if (!isRetryable || attempt === AI_MAX_RETRIES) {
        logger.error({ err: lastError, attempt }, 'AI request failed - not retrying');
        break;
      }

      const delay = AI_RETRY_DELAY_MS * attempt;
      logger.warn({ attempt, delay, err: lastError.message }, 'AI request failed - retrying');
      await sleep(delay);
    }
  }

  throw lastError ?? new Error('AI request failed after all retries');
}

export function buildSystemPrompt(role: string, context: string): string {
  return `You are ${role} for UJRIS Lite (Unified Justice & Rights Intelligence System).

${context}

CRITICAL REQUIREMENTS:
- Respond ONLY in valid JSON unless explicitly instructed otherwise
- Be precise, factual, and legally informed
- Do not fabricate case law, statutes, or legal authorities
- Acknowledge uncertainty where it exists
- Structure all outputs deterministically
- Use UK English and UK legal conventions unless jurisdiction specifies otherwise`;
}
