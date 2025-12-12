import { Request, Response, NextFunction } from "express";
export interface AuthedRequest extends Request {
    userId?: string;
}
export declare function authOptional(req: AuthedRequest, _res: Response, next: NextFunction): void;
export declare function authRequired(req: AuthedRequest, res: Response, next: NextFunction): Response<any, Record<string, any>>;
//# sourceMappingURL=auth.d.ts.map