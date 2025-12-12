import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail =
  process.env.RESEND_FROM_EMAIL || "admin@toppicgames.com";

const resendClient = resendApiKey ? new Resend(resendApiKey) : null;

interface VerificationEmailParams {
  to: string;
  name?: string | null;
  verifyUrl: string;
}

export async function sendVerificationEmail({
  to,
  name,
  verifyUrl,
}: VerificationEmailParams) {
  if (!resendClient) {
    throw new Error("Resend is not configured. Missing RESEND_API_KEY.");
  }

  const displayName = name || to;

  const { error } = await resendClient.emails.send({
    from: `Toppic Games <${fromEmail}>`,
    to,
    subject: "Verify your email for Toppic Games",
    text: [
      `Hi ${displayName},`,
      "",
      "Thanks for creating an account on Toppic Games.",
      "Please verify your email so you can log in:",
      verifyUrl,
      "",
      "If you didn't request this, you can ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
        <p>Hi ${displayName},</p>
        <p>Thanks for creating an account on <strong>Toppic Games</strong>.</p>
        <p>Click the button below to verify your email and finish setting up your account.</p>
        <p style="margin: 24px 0;">
          <a href="${verifyUrl}" style="display: inline-block; padding: 12px 18px; background: #4f46e5; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600;">
            Verify email
          </a>
        </p>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="word-break: break-all;"><a href="${verifyUrl}">${verifyUrl}</a></p>
        <p style="color: #64748b; font-size: 12px;">If you didn't request this, you can ignore this email.</p>
      </div>
    `,
  });

  if (error) {
    throw new Error(
      error.message || "Failed to send verification email via Resend."
    );
  }
}
