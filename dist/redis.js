"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redis = void 0;
exports.getRedisValue = getRedisValue;
exports.setRedisValue = setRedisValue;
exports.deleteRedisKey = deleteRedisKey;
const ioredis_1 = __importDefault(require("ioredis"));
const logger_1 = require("./logger");
let redisClient = null;
if (process.env.REDIS_URL) {
    try {
        redisClient = new ioredis_1.default(process.env.REDIS_URL, {
            maxRetriesPerRequest: 3,
            lazyConnect: true,
            retryStrategy: (times) => {
                if (times > 5) {
                    logger_1.logger.error('Redis max retries reached - disabling Redis');
                    return null;
                }
                return Math.min(times * 200, 2000);
            },
        });
        redisClient.on('connect', () => logger_1.logger.info('Redis connected'));
        redisClient.on('error', (err) => logger_1.logger.warn({ err }, 'Redis error'));
        redisClient.on('close', () => logger_1.logger.warn('Redis connection closed'));
    }
    catch (err) {
        logger_1.logger.warn({ err }, 'Redis initialization failed - running without Redis');
        redisClient = null;
    }
}
else {
    logger_1.logger.info('REDIS_URL not set - running without Redis (in-memory rate limiting)');
}
exports.redis = redisClient;
async function getRedisValue(key) {
    if (!redisClient)
        return null;
    try {
        return await redisClient.get(key);
    }
    catch {
        return null;
    }
}
async function setRedisValue(key, value, ttlSeconds) {
    if (!redisClient)
        return;
    try {
        if (ttlSeconds) {
            await redisClient.setex(key, ttlSeconds, value);
        }
        else {
            await redisClient.set(key, value);
        }
    }
    catch {
    }
}
async function deleteRedisKey(key) {
    if (!redisClient)
        return;
    try {
        await redisClient.del(key);
    }
    catch {
    }
}
//# sourceMappingURL=redis.js.map