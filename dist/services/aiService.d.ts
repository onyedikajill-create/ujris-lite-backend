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
export declare function callAI(options: AIRequestOptions): Promise<AIResponse>;
export declare function buildSystemPrompt(role: string, context: string): string;
//# sourceMappingURL=aiService.d.ts.map