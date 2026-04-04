"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const app_1 = require("./app");
const logger_1 = require("./lib/logger");
const prisma_1 = require("./lib/prisma");
const redis_1 = require("./lib/redis");
const PORT = parseInt(process.env.PORT ?? '3000', 10);
async function bootstrap() {
    try {
        await prisma_1.prisma.$connect();
        logger_1.logger.info('Database connected');
        const app = (0, app_1.createApp)();
        const server = app.listen(PORT, "0.0.0.0", () => {
            logger_1.logger.info({ port: PORT, env: process.env.NODE_ENV }, 'UJRIS Lite v3.0.0 started');
        });
        const shutdown = async (signal) => {
            logger_1.logger.info({ signal }, 'Shutdown signal received');
            server.close(async () => {
                await prisma_1.prisma.$disconnect();
                if (redis_1.redis) {
                    redis_1.redis.disconnect();
                }
                logger_1.logger.info('Graceful shutdown complete');
                process.exit(0);
            });
            setTimeout(() => {
                logger_1.logger.error('Forced shutdown after timeout');
                process.exit(1);
            }, 10000);
        };
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('unhandledRejection', (reason) => {
            logger_1.logger.error({ reason }, 'Unhandled rejection');
        });
        process.on('uncaughtException', (error) => {
            logger_1.logger.error({ error }, 'Uncaught exception');
            process.exit(1);
        });
    }
    catch (error) {
        logger_1.logger.error({ error }, 'Bootstrap failed');
        process.exit(1);
    }
}
bootstrap();
//# sourceMappingURL=server.js.map