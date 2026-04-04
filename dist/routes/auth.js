"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const rateLimiter_1 = require("../middleware/rateLimiter");
const errorHandler_1 = require("../middleware/errorHandler");
const auditEngine_1 = require("../engines/auditEngine");
const router = (0, express_1.Router)();
const RegisterSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(100),
    email: zod_1.z.string().email().max(255),
    password: zod_1.z
        .string()
        .min(8)
        .max(128)
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain uppercase, lowercase, and number'),
});
const LoginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
});
router.post('/register', rateLimiter_1.authRateLimiter, async (req, res, next) => {
    try {
        const body = RegisterSchema.parse(req.body);
        const existing = await prisma_1.prisma.user.findUnique({
            where: { email: body.email.toLowerCase() },
            select: { id: true },
        });
        if (existing) {
            throw new errorHandler_1.ConflictError('An account with this email already exists');
        }
        const passwordHash = await bcryptjs_1.default.hash(body.password, 12);
        const user = await prisma_1.prisma.user.create({
            data: {
                name: body.name,
                email: body.email.toLowerCase(),
                passwordHash,
            },
            select: { id: true, name: true, email: true, role: true, createdAt: true },
        });
        const token = (0, auth_1.generateToken)({
            userId: user.id,
            email: user.email,
            role: user.role,
        });
        const meta = (0, auditEngine_1.extractRequestMeta)(req);
        await (0, auditEngine_1.createAuditLog)({
            userId: user.id,
            action: auditEngine_1.AuditActions.USER_REGISTERED,
            entityType: 'User',
            entityId: user.id,
            ...meta,
        });
        res.status(201).json({
            success: true,
            data: { user, token },
        });
    }
    catch (err) {
        next(err);
    }
});
router.post('/login', rateLimiter_1.authRateLimiter, async (req, res, next) => {
    try {
        const body = LoginSchema.parse(req.body);
        const user = await prisma_1.prisma.user.findUnique({
            where: { email: body.email.toLowerCase() },
        });
        if (!user || !user.isActive) {
            throw new errorHandler_1.AuthenticationError('Invalid credentials');
        }
        const passwordValid = await bcryptjs_1.default.compare(body.password, user.passwordHash);
        if (!passwordValid) {
            throw new errorHandler_1.AuthenticationError('Invalid credentials');
        }
        const token = (0, auth_1.generateToken)({
            userId: user.id,
            email: user.email,
            role: user.role,
        });
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await prisma_1.prisma.authToken.create({
            data: { userId: user.id, token, expiresAt },
        });
        const meta = (0, auditEngine_1.extractRequestMeta)(req);
        await (0, auditEngine_1.createAuditLog)({
            userId: user.id,
            action: auditEngine_1.AuditActions.USER_LOGIN,
            entityType: 'User',
            entityId: user.id,
            ...meta,
        });
        res.status(200).json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                },
                token,
            },
        });
    }
    catch (err) {
        next(err);
    }
});
router.post('/logout', auth_1.requireAuth, async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (token) {
            await prisma_1.prisma.authToken.updateMany({
                where: { token, userId: req.userId },
                data: { revokedAt: new Date() },
            });
        }
        const meta = (0, auditEngine_1.extractRequestMeta)(req);
        await (0, auditEngine_1.createAuditLog)({
            userId: req.userId,
            action: auditEngine_1.AuditActions.USER_LOGOUT,
            entityType: 'User',
            entityId: req.userId,
            ...meta,
        });
        res.status(200).json({ success: true, data: { message: 'Logged out successfully' } });
    }
    catch (err) {
        next(err);
    }
});
router.get('/me', auth_1.requireAuth, async (req, res, next) => {
    try {
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: req.userId },
            select: { id: true, name: true, email: true, role: true, createdAt: true },
        });
        if (!user)
            throw new errorHandler_1.NotFoundError('User');
        res.status(200).json({ success: true, data: { user } });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=auth.js.map