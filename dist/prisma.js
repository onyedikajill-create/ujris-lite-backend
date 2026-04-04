"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
const logger_1 = require("./logger");
exports.prisma = global.__prisma ??
    new client_1.PrismaClient({
        log: [
            { level: 'query', emit: 'event' },
            { level: 'error', emit: 'event' },
            { level: 'warn', emit: 'event' },
        ],
    });
if (process.env.NODE_ENV === 'development') {
    global.__prisma = exports.prisma;
}
exports.prisma.$on('error', (e) => {
    logger_1.logger.error({ err: e }, 'Prisma error');
});
exports.prisma.$on('warn', (e) => {
    logger_1.logger.warn({ warn: e }, 'Prisma warning');
});
//# sourceMappingURL=prisma.js.map