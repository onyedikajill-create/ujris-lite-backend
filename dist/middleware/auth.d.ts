import { Request, Response, NextFunction } from 'express';
export interface JWTPayload {
    userId: string;
    email: string;
    role: string;
    iat: number;
    exp: number;
}
declare global {
    namespace Express {
        interface Request {
            userId?: string;
            userEmail?: string;
            userRole?: string;
            isAdmin?: boolean;
        }
    }
}
export declare function requireAuth(req: Request, _res: Response, next: NextFunction): void;
export declare function requireAdminKey(req: Request, _res: Response, next: NextFunction): void;
export declare function requireRole(role: string): (req: Request, _res: Response, next: NextFunction) => void;
export declare function requireCaseOwnership(req: Request, _res: Response, next: NextFunction): Promise<void>;
export declare function generateToken(payload: {
    userId: string;
    email: string;
    role: string;
}): string;
//# sourceMappingURL=auth.d.ts.map