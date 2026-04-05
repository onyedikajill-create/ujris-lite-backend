"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.callAI = callAI;
exports.buildSystemPrompt = buildSystemPrompt;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const logger_1 = require("../lib/logger");
const client = new sdk_1.default({
    apiKey: process.env.ANTHROPIC_API_KEY,
});
const AI_MODEL = process.env.AI_MODEL ?? 'claude-opus-4-5';
const AI_MAX_TOKENS = parseInt(process.env.AI_MAX_TOKENS ?? '4096', 10);
const AI_TEMPERATURE = parseFloat(process.env.AI_TEMPERATURE ?? '0.3');
const AI_MAX_RETRIES = parseInt(process.env.AI_MAX_RETRIES ?? '3', 10);
const AI_RETRY_DELAY_MS = parseInt(process.env.AI_RETRY_DELAY_MS ?? '1000', 10);
async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function callAI(options) {
    const { systemPrompt, messages, maxTokens = AI_MAX_TOKENS, temperature = AI_TEMPERATURE, model = AI_MODEL, } = options;
    let lastError = null;
    const startTime = Date.now();
    for (let attempt = 1; attempt <= AI_MAX_RETRIES; attempt++) {
        try {
            logger_1.logger.debug({ attempt, model, maxTokens }, 'AI request attempt');
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
                .filter((block) => block.type === 'text')
                .map((block) => block.text)
                .join('');
            const tokensUsed = (response.usage.input_tokens ?? 0) + (response.usage.output_tokens ?? 0);
            const processingTimeMs = Date.now() - startTime;
            logger_1.logger.info({ tokensUsed, processingTimeMs, model, attempt }, 'AI request succeeded');
            return {
                content: textContent,
                tokensUsed,
                model: response.model,
                processingTimeMs,
            };
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            const isRetryable = lastError.message.includes('overloaded') ||
                lastError.message.includes('timeout') ||
                lastError.message.includes('529') ||
                lastError.message.includes('500');
            if (!isRetryable || attempt === AI_MAX_RETRIES) {
                logger_1.logger.error({ err: lastError, attempt }, 'AI request failed - not retrying');
                break;
            }
            const delay = AI_RETRY_DELAY_MS * attempt;
            logger_1.logger.warn({ attempt, delay, err: lastError.message }, 'AI request failed - retrying');
            await sleep(delay);
        }
    }
    throw lastError ?? new Error('AI request failed after all retries');
}
function buildSystemPrompt(role, context) {
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
//# sourceMappingURL=aiService.js.map