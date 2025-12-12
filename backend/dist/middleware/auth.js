"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authOptional = authOptional;
exports.authRequired = authRequired;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
function authOptional(req, _res, next) {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer "))
        return next();
    const token = auth.slice("Bearer ".length);
    try {
        const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.userId = payload.userId;
    }
    catch {
        // ignore invalid tokens for optional middleware
    }
    next();
}
function authRequired(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    const token = auth.slice("Bearer ".length);
    try {
        const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.userId = payload.userId;
        next();
    }
    catch {
        return res.status(401).json({ error: "Invalid token" });
    }
}
//# sourceMappingURL=auth.js.map