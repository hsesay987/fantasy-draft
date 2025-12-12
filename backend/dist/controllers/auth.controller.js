"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signup = signup;
exports.login = login;
exports.verifyEmail = verifyEmail;
exports.me = me;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = __importDefault(require("../lib/prisma"));
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
function signToken(userId) {
    return jsonwebtoken_1.default.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
}
async function signup(req, res) {
    const { email, password, name } = req.body;
    const existing = await prisma_1.default.user.findUnique({ where: { email } });
    if (existing)
        return res.status(400).json({ error: "Email already in use" });
    const passwordHash = await bcryptjs_1.default.hash(password, 10);
    const user = await prisma_1.default.user.create({
        data: { email, passwordHash, name },
    });
    // create verification token
    const token = crypto_1.default.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24h
    await prisma_1.default.verificationToken.create({
        data: {
            userId: user.id,
            token,
            expiresAt,
        },
    });
    // TODO: send actual email via nodemailer / provider
    const verifyUrl = `${FRONTEND_URL}/verify-email?token=${token}`;
    console.log("Verify email link:", verifyUrl);
    return res.status(201).json({
        message: "Signup successful. Check your email to verify.",
    });
}
async function login(req, res) {
    const { email, password } = req.body;
    const user = await prisma_1.default.user.findUnique({ where: { email } });
    if (!user)
        return res.status(400).json({ error: "Invalid credentials" });
    const match = await bcryptjs_1.default.compare(password, user.passwordHash);
    if (!match)
        return res.status(400).json({ error: "Invalid credentials" });
    if (!user.emailVerified) {
        return res.status(403).json({
            error: "Email not verified. Please verify before logging in.",
        });
    }
    const token = signToken(user.id);
    return res.json({
        token,
        user: {
            id: user.id,
            email: user.email,
            name: user.name,
        },
    });
}
async function verifyEmail(req, res) {
    const token = req.query.token;
    if (!token)
        return res.status(400).json({ error: "Missing token" });
    const record = await prisma_1.default.verificationToken.findUnique({
        where: { token },
        include: { user: true },
    });
    if (!record)
        return res.status(400).json({ error: "Invalid token" });
    if (record.expiresAt < new Date())
        return res.status(400).json({ error: "Token expired" });
    await prisma_1.default.user.update({
        where: { id: record.userId },
        data: { emailVerified: true },
    });
    await prisma_1.default.verificationToken.delete({ where: { id: record.id } });
    // You can redirect to frontend
    return res.json({ message: "Email verified. You can now log in." });
}
async function me(req, res) {
    if (!req.userId)
        return res.status(200).json({ user: null });
    const user = await prisma_1.default.user.findUnique({
        where: { id: req.userId },
        select: { id: true, email: true, name: true, emailVerified: true },
    });
    return res.json({ user });
}
//# sourceMappingURL=auth.controller.js.map