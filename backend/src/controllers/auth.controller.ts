// src/controllers/auth.controller.ts
import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import prisma from "../lib/prisma";
import { sendVerificationEmail, sendPasswordResetEmail } from "../lib/email";
import { OAuth2Client } from "google-auth-library";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

function signToken(userId: string) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
}

async function createVerificationToken(userId: string) {
  await prisma.verificationToken.deleteMany({ where: { userId } });

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24h

  await prisma.verificationToken.create({
    data: {
      userId,
      token,
      expiresAt,
    },
  });

  return token;
}

export async function signup(req: Request, res: Response) {
  const { email, password, name } = req.body;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(400).json({ error: "Email already in use" });

  const passwordHash = await bcrypt.hash(password, 10);

  const userCount = await prisma.user.count();

  const isFounder = userCount < 250;

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      isFounder,
      subscriptionTier: isFounder ? "founder" : null,
    },
  });

  // create verification token
  const token = await createVerificationToken(user.id);

  const verifyUrl = `${FRONTEND_URL}/verify-email?token=${token}`;

  try {
    await sendVerificationEmail({
      to: email,
      name,
      verifyUrl,
    });
  } catch (err) {
    console.error("Failed to send verification email", err);
    try {
      await prisma.verificationToken.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    } catch (cleanupErr) {
      console.error("Failed to clean up user after email failure", cleanupErr);
    }
    return res
      .status(500)
      .json({ error: "Could not send verification email. Please try again." });
  }

  return res.status(201).json({
    message: "Signup successful. Check your email to verify.",
  });
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(400).json({ error: "Invalid credentials" });

  if (!user.passwordHash) {
    return res.status(400).json({
      error: "Account uses Google sign-in. Please continue with Google.",
    });
  }

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
      emailVerified: user.emailVerified,
      isAdmin: user.isAdmin,
      isFounder: user.isFounder,
      subscriptionTier: user.subscriptionTier,
      subscriptionEnds: user.subscriptionEnds,
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
    select: {
      id: true,
      email: true,
      name: true,
      emailVerified: true,
      isAdmin: true,
      isFounder: true,
      subscriptionTier: true,
      subscriptionEnds: true,
    },
  });

  return res.json({ user });
}

export async function forgotPassword(req: Request, res: Response) {
  const { email } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user)
    return res.json({ message: "If the email exists, a reset link was sent." });

  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60);

  await prisma.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt },
  });

  const resetUrl = `${FRONTEND_URL}/reset-password?token=${token}`;

  try {
    await sendPasswordResetEmail({ to: email, name: user.name, resetUrl });
  } catch (err) {
    console.error("Failed to send password reset email", err);
    return res
      .status(500)
      .json({ error: "Unable to send password reset email." });
  }

  res.json({ message: "Check your email for reset instructions." });
}

export async function resetPassword(req: Request, res: Response) {
  const { token, password } = req.body;

  const record = await prisma.passwordResetToken.findUnique({
    where: { token },
  });
  if (!record || record.expiresAt < new Date())
    return res.status(400).json({ error: "Invalid or expired token" });

  const user = await prisma.user.findUnique({
    where: { id: record.userId },
  });

  if (!user) return res.status(400).json({ error: "User no longer exists." });

  const hash = await bcrypt.hash(password, 10);

  await prisma.user.update({
    where: { id: record.userId },
    data: { passwordHash: hash },
  });

  await prisma.passwordResetToken.deleteMany({
    where: { userId: record.userId },
  });

  res.json({ message: "Password reset successful" });
}

const client = new OAuth2Client(GOOGLE_CLIENT_ID);

export async function googleAuth(req: Request, res: Response) {
  const { credential } = req.body;

  if (!GOOGLE_CLIENT_ID) {
    return res
      .status(500)
      .json({ error: "Google login not configured on the server." });
  }

  const ticket = await client.verifyIdToken({
    idToken: credential,
    audience: GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload?.email)
    return res.status(400).json({ error: "Invalid Google token" });

  let user = await prisma.user.findUnique({ where: { email: payload.email } });

  if (!user) {
    const userCount = await prisma.user.count();
    const isFounder = userCount < 250;

    user = await prisma.user.create({
      data: {
        email: payload.email,
        name: payload.name,
        googleId: payload.sub,
        emailVerified: true,
        isFounder,
        subscriptionTier: isFounder ? "founder" : null,
      },
    });
  } else if (!user.emailVerified) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    });
  }

  const token = signToken(user.id);

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
      isAdmin: user.isAdmin,
      isFounder: user.isFounder,
      subscriptionTier: user.subscriptionTier,
      subscriptionEnds: user.subscriptionEnds,
    },
  });
}

export async function resendVerification(req: Request, res: Response) {
  const { email } = req.body;

  if (!email) return res.status(400).json({ error: "Email is required" });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.json({
      message: "If the email exists, a verification link was sent.",
    });
  }

  if (user.emailVerified) {
    return res.status(400).json({ error: "Email already verified." });
  }

  const token = await createVerificationToken(user.id);
  const verifyUrl = `${FRONTEND_URL}/verify-email?token=${token}`;

  try {
    await sendVerificationEmail({
      to: user.email,
      name: user.name,
      verifyUrl,
    });
  } catch (err) {
    console.error("Failed to resend verification email", err);
    return res
      .status(500)
      .json({ error: "Unable to send verification email right now." });
  }

  return res.json({
    message: "Verification email sent if the address is valid.",
  });
}

export async function updateProfile(
  req: Request & { userId?: string },
  res: Response
) {
  const { name } = req.body;

  if (!req.userId) return res.status(401).json({ error: "Unauthorized" });

  const updated = await prisma.user.update({
    where: { id: req.userId },
    data: { name },
    select: {
      id: true,
      email: true,
      name: true,
      emailVerified: true,
      isAdmin: true,
      isFounder: true,
      subscriptionTier: true,
      subscriptionEnds: true,
    },
  });

  res.json({ user: updated });
}

export async function changePassword(
  req: Request & { userId?: string },
  res: Response
) {
  const { currentPassword, newPassword } = req.body;

  if (!req.userId) return res.status(401).json({ error: "Unauthorized" });
  if (!newPassword || newPassword.length < 6) {
    return res
      .status(400)
      .json({ error: "New password must be at least 6 characters." });
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: "User not found" });

  if (user.passwordHash) {
    if (!currentPassword) {
      return res
        .status(400)
        .json({ error: "Current password is required to change it." });
    }
    const match = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!match) return res.status(400).json({ error: "Incorrect password." });
  }

  const newHash = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: newHash },
  });

  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

  res.json({ message: "Password updated." });
}
