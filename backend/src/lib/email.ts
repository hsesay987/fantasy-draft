// backend/src/lib/email.ts
import { Resend } from "resend";
import { receiptEmail, resetEmail, verifyEmail, type Email } from "../emails/render";

const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL || "admin@toppicgames.com";
const replyTo = process.env.RESEND_REPLY_TO || "support@toppicgames.com";

const resend = resendApiKey ? new Resend(resendApiKey) : null;

async function deliver(to: string, mail: Email, tag: string) {
  if (!resend) throw new Error("Resend not configured");
  const { error } = await resend.emails.send({
    from: `TopPic <${fromEmail}>`,
    to,
    replyTo,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    tags: [{ name: "kind", value: tag }],
  });
  if (error) throw new Error(error.message || `Failed to send ${tag} email via Resend.`);
}

export const sendVerificationEmail = (o: { to: string; name?: string | null; verifyUrl: string }) => deliver(o.to, verifyEmail(o), "verify");

export const sendPasswordResetEmail = (o: { to: string; name?: string | null; resetUrl: string }) => deliver(o.to, resetEmail(o), "reset");

export const sendReceiptEmail = (o: { to: string; name?: string | null; amountCents: number; currency: string; invoiceUrl?: string; billingCycle?: string; receiptId?: string; date?: string }) => deliver(o.to, receiptEmail(o), "receipt");
