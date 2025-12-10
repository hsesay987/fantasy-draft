// src/controllers/auth.controller.ts
import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import prisma from "../lib/prisma";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

function signToken(userId: string) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
}

export async function signup(req: Request, res: Response) {
  const { email, password, name } = req.body;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(400).json({ error: "Email already in use" });

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: { email, passwordHash, name },
  });

  // create verification token
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24h

  await prisma.verificationToken.create({
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

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(400).json({ error: "Invalid credentials" });

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return res.status(400).json({ error: "Invalid credentials" });

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

export async function verifyEmail(req: Request, res: Response) {
  const token = req.query.token as string | undefined;
  if (!token) return res.status(400).json({ error: "Missing token" });

  const record = await prisma.verificationToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!record) return res.status(400).json({ error: "Invalid token" });
  if (record.expiresAt < new Date())
    return res.status(400).json({ error: "Token expired" });

  await prisma.user.update({
    where: { id: record.userId },
    data: { emailVerified: true },
  });

  await prisma.verificationToken.delete({ where: { id: record.id } });

  // You can redirect to frontend
  return res.json({ message: "Email verified. You can now log in." });
}

export async function me(req: Request & { userId?: string }, res: Response) {
  if (!req.userId) return res.status(200).json({ user: null });

  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, email: true, name: true, emailVerified: true },
  });

  return res.json({ user });
}
