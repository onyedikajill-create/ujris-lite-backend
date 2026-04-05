import Redis from 'ioredis';
export declare const redis: Redis | null;
export declare function getRedisValue(key: string): Promise<string | null>;
export declare function setRedisValue(key: string, value: string, ttlSeconds?: number): Promise<void>;
export declare function deleteRedisKey(key: string): Promise<void>;
//# sourceMappingURL=redis.d.ts.map