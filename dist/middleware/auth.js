"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.requireAdminKey = requireAdminKey;
exports.requireRole = requireRole;
exports.requireCaseOwnership = requireCaseOwnership;
exports.generateToken = generateToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = require("../lib/prisma");
const errorHandler_1 = require("./errorHandler");
function requireAuth(req, _res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next(new errorHandler_1.AuthenticationError('Bearer token required'));
    }
    const token = authHeader.split(' ')[1];
    try {
        const secret = process.env.JWT_SECRET;
        if (!secret)
            throw new Error('JWT_SECRET not configured');
        const payload = jsonwebtoken_1.default.verify(token, secret);
        req.userId = payload.userId;
        req.userEmail = payload.email;
        req.userRole = payload.role;
        next();
    }
    catch (err) {
        if (err instanceof jsonwebtoken_1.default.TokenExpiredError) {
            return next(new errorHandler_1.AuthenticationError('Token expired'));
        }
        if (err instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            return next(new errorHandler_1.AuthenticationError('Invalid token'));
        }
        next(err);
    }
}
function requireAdminKey(req, _res, next) {
    const adminKey = req.headers['x-admin-key'];
    const expectedKey = process.env.ADMIN_API_KEY;
    if (!expectedKey) {
        return next(new Error('ADMIN_API_KEY not configured'));
    }
    if (!adminKey || adminKey !== expectedKey) {
        return next(new errorHandler_1.AuthorizationError('Valid admin key required'));
    }
    req.isAdmin = true;
    next();
}
function requireRole(role) {
    return (req, _res, next) => {
        if (req.userRole !== role && !req.isAdmin) {
            return next(new errorHandler_1.AuthorizationError(`Role '${role}' required`));
        }
        next();
    };
}
async function requireCaseOwnership(req, _res, next) {
    const { caseId } = req.params;
    const userId = req.userId;
    if (!userId) {
        return next(new errorHandler_1.AuthenticationError());
    }
    if (req.isAdmin) {
        return next();
    }
    const caseRecord = await prisma_1.prisma.case.findFirst({
        where: { id: caseId, userId },
        select: { id: true },
    });
    if (!caseRecord) {
        return next(new errorHandler_1.AuthorizationError('You do not have access to this case'));
    }
    next();
}
function generateToken(payload) {
    const secret = process.env.JWT_SECRET;
    if (!secret)
        throw new Error('JWT_SECRET not configured');
    const expiresIn = (process.env.JWT_EXPIRES_IN ?? '7d');
    return jsonwebtoken_1.default.sign(payload, secret, {
        expiresIn,
    });
}
//# sourceMappingURL=auth.js.map