"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRateLimiter = exports.aiRateLimiter = exports.globalRateLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '900000', 10);
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? '100', 10);
const AI_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_AI_MAX ?? '20', 10);
const rateLimitResponse = (_req, res) => {
    res.status(429).json({
        success: false,
        error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests - please try again later',
        },
    });
};
exports.globalRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: WINDOW_MS,
    max: MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitResponse,
    skip: (req) => req.path === '/health',
});
exports.aiRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: WINDOW_MS,
    max: AI_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitResponse,
    keyGenerator: (req) => {
        const userId = req.userId;
        return userId ?? req.ip ?? 'unknown';
    },
});
exports.authRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitResponse,
});
//# sourceMappingURL=rateLimiter.js.map