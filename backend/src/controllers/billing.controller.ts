// backend/src/controllers/billing.controller.ts
import { Request, Response } from "express";
import Stripe from "stripe";
import prisma from "../lib/prisma";
import { AuthedRequest } from "../middleware/auth";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const PRICE_MONTHLY = process.env.STRIPE_PRICE_MONTHLY;
const PRICE_YEARLY = process.env.STRIPE_PRICE_YEARLY;
const stripe = stripeSecret
  ? new Stripe(stripeSecret, { apiVersion: "2024-11-20" } as any)
  : null;

function requireStripe(res: Response) {
  if (!stripe) {
    res.status(500).json({ error: "Stripe is not configured on the server." });
    return false;
  }
  return true;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function getTrialDaysForUserPosition(userCount: number) {
  if (userCount < 250) return 3650; // founders are handled separately, but keep huge buffer
  if (userCount < 500) return 365;
  if (userCount < 750) return 90;
  if (userCount < 1000) return 30;
  return 7;
}

async function ensureStripeCustomer(
  userId: string,
  email: string,
  name?: string | null
) {
  if (!stripe) return null;
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeCustomerId: true },
  });
  if (existing?.stripeCustomerId) return existing.stripeCustomerId;

  const found = await stripe.customers.list({ email, limit: 1 });
  const customerId =
    found.data[0]?.id ||
    (
      await stripe.customers.create({
        email,
        name: name || undefined,
        metadata: { userId },
      })
    ).id;

  await prisma.user.update({
    where: { id: userId },
    data: { stripeCustomerId: customerId },
  });

  return customerId;
}

export async function getStatus(req: AuthedRequest, res: Response) {
  if (!req.userId) return res.status(401).json({ error: "Unauthorized" });

  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: {
      id: true,
      email: true,
      name: true,
      isFounder: true,
      subscriptionTier: true,
      subscriptionEnds: true,
      createdAt: true,
    },
  });

  if (!user) return res.status(404).json({ error: "User not found" });

  const userCount = await prisma.user.count();
  const trialDays = getTrialDaysForUserPosition(userCount);
  const isActiveSubscription =
    !!user.subscriptionTier &&
    (!user.subscriptionEnds || user.subscriptionEnds.getTime() > Date.now());

  const entitlement = user.isFounder || isActiveSubscription;

  return res.json({
    user: {
      subscriptionTier: user.subscriptionTier,
      subscriptionEnds: user.subscriptionEnds,
      isFounder: user.isFounder,
      entitlement,
    },
    offer: {
      trialDays,
      monthlyPrice: PRICE_MONTHLY ? "$3.99/mo" : null,
      yearlyPrice: PRICE_YEARLY ? "$30/yr" : null,
    },
  });
}

export async function createCheckoutSession(req: AuthedRequest, res: Response) {
  if (!req.userId) return res.status(401).json({ error: "Unauthorized" });
  if (!requireStripe(res)) return;

  const { plan } = req.body as { plan?: "monthly" | "yearly" };
  if (!plan || (plan !== "monthly" && plan !== "yearly")) {
    return res.status(400).json({ error: "Invalid plan" });
  }

  const priceId = plan === "yearly" ? PRICE_YEARLY : PRICE_MONTHLY;
  if (!priceId) {
    return res.status(500).json({ error: "Stripe prices not configured." });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: {
      id: true,
      email: true,
      name: true,
      isFounder: true,
      subscriptionTier: true,
      subscriptionEnds: true,
    },
  });

  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.isFounder) {
    return res
      .status(400)
      .json({ error: "Founders already have lifetime access." });
  }

  const trialDays = getTrialDaysForUserPosition(await prisma.user.count());
  const customerId = await ensureStripeCustomer(user.id, user.email, user.name);

  const session = await stripe!.checkout.sessions.create({
    mode: "subscription",
    customer: customerId || undefined,
    customer_email: user.email,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    subscription_data: {
      trial_period_days: trialDays,
      metadata: {
        userId: user.id,
        plan,
      },
    },
    metadata: { userId: user.id, plan },
    success_url: `${FRONTEND_URL}/account/subscription?success=1`,
    cancel_url: `${FRONTEND_URL}/account/subscription?cancel=1`,
  });

  // Optimistically set local trial window so UI updates immediately
  const subscriptionEnds = addDays(new Date(), trialDays);
  await prisma.user.update({
    where: { id: user.id },
    data: { subscriptionTier: plan, subscriptionEnds },
  });

  return res.json({ url: session.url });
}

export async function createPortalSession(req: AuthedRequest, res: Response) {
  if (!req.userId) return res.status(401).json({ error: "Unauthorized" });
  if (!requireStripe(res)) return;

  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { email: true, name: true, stripeCustomerId: true },
  });
  if (!user) return res.status(404).json({ error: "User not found" });

  const customerId =
    user.stripeCustomerId ||
    (await ensureStripeCustomer(req.userId, user.email, user.name));

  if (!customerId) {
    return res
      .status(400)
      .json({ error: "No Stripe customer found for this account." });
  }

  const session = await stripe!.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${FRONTEND_URL}/account/subscription`,
  });

  res.json({ url: session.url });
}

async function applySubscriptionFromStripe(
  userId: string,
  tier: string | null,
  currentPeriodEnd?: number,
  customerId?: string | null
) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionTier: tier,
      subscriptionEnds: currentPeriodEnd
        ? new Date(currentPeriodEnd * 1000)
        : null,
      stripeCustomerId: customerId || undefined,
    },
  });
}

export async function webhook(req: Request, res: Response) {
  if (!stripeSecret) {
    return res.status(400).json({ error: "Stripe not configured" });
  }

  const sig = req.headers["stripe-signature"];
  if (!sig) return res.status(400).send("Missing signature");

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event: Stripe.Event;

  try {
    const rawBody = (req as any).rawBody || req.body;
    event = stripe!.webhooks.constructEvent(rawBody, sig, webhookSecret || "");
  } catch (err: any) {
    console.error("Webhook signature verification failed", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const plan = (session.metadata?.plan as string | null) || null;
        if (userId) {
          await applySubscriptionFromStripe(
            userId,
            plan,
            undefined,
            session.customer as string
          );
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.userId;
        const tier =
          (sub.metadata?.plan as string | null) ||
          (sub.items.data[0]?.price.recurring?.interval === "year"
            ? "yearly"
            : "monthly");
        if (userId) {
          await applySubscriptionFromStripe(
            userId,
            tier,
            sub.current_period_end,
            sub.customer as string
          );
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.userId;
        if (userId) {
          await applySubscriptionFromStripe(
            userId,
            null,
            undefined,
            sub.customer as string
          );
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("Webhook processing failed", err);
    return res.status(500).json({ error: "Failed to process webhook" });
  }

  res.json({ received: true });
}
