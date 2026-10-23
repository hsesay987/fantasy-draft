// Branded transactional emails, rendered in code so they are versioned with the app (no dashboard templates to drift).
// Table layout + inline styles for every mail client, a bulletproof button for Outlook, and a plain-text twin.

const C = {
  bg: "#0f0f23",
  card: "#1e1c35",
  border: "#34305a",
  text: "#e8e6f7",
  muted: "#a9a6c9",
  primary: "#7c3aed",
  secondary: "#a78bfa",
  accent: "#f43f5e",
};
const SITE = process.env.FRONTEND_URL || "https://toppicgames.com";
const SUPPORT = "support@toppicgames.com";
const FONT = "'Trebuchet MS','Segoe UI',Helvetica,Arial,sans-serif";

export type Email = { subject: string; html: string; text: string };

export const esc = (v: unknown): string =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Only http(s) links go into an email, so a bad value can never become a javascript: link. */
export function safeUrl(u: string): string {
  const url = new URL(u);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Unsafe URL in email");
  return url.toString();
}

const firstName = (name: string | null | undefined, to: string) => esc((name || to).split(/[\s@]/)[0] || "there");

function button(href: string, label: string): string {
  const h = esc(href);
  return `
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${h}" style="height:50px;v-text-anchor:middle;width:240px;" arcsize="24%" stroke="f" fillcolor="${C.accent}">
<w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${esc(label)}</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<a href="${h}" target="_blank" style="display:inline-block;background:${C.accent};background-image:linear-gradient(135deg,${C.accent},${C.primary});color:#ffffff;font-family:${FONT};font-size:16px;font-weight:bold;line-height:50px;height:50px;padding:0 34px;border-radius:12px;text-decoration:none;mso-hide:all;">${esc(label)}</a>
<!--<![endif]-->`;
}

function layout(o: { preheader: string; title: string; body: string }): string {
  return `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>${esc(o.title)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
  body{margin:0;padding:0;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
  table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0;}
  a{color:${C.secondary};}
  @media (max-width:620px){ .px{padding-left:22px!important;padding-right:22px!important;} .h1{font-size:26px!important;} }
</style>
</head>
<body style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.bg};">${esc(o.preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};">
<tr><td align="center" style="padding:32px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
    <tr><td align="center" style="padding:0 0 22px;">
      <a href="${esc(SITE)}" style="text-decoration:none;font-family:${FONT};font-size:34px;font-weight:bold;letter-spacing:.5px;color:#ffffff;">Top<span style="color:${C.accent};">Pic</span></a>
      <div style="font-family:${FONT};font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${C.secondary};padding-top:6px;">Draft anything. Take the top pic.</div>
    </td></tr>
    <tr><td style="background:${C.card};border:1px solid ${C.border};border-radius:18px;overflow:hidden;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td height="5" style="height:5px;line-height:5px;font-size:0;background:${C.primary};background-image:linear-gradient(90deg,${C.primary},${C.accent});">&nbsp;</td></tr>
        <tr><td class="px" style="padding:34px 40px 36px;font-family:${FONT};color:${C.text};">${o.body}</td></tr>
      </table>
    </td></tr>
    <tr><td align="center" style="padding:24px 16px 0;font-family:${FONT};font-size:12px;line-height:19px;color:${C.muted};">
      Need a hand? Just reply to this email or write to <a href="mailto:${SUPPORT}" style="color:${C.secondary};">${SUPPORT}</a>.<br>
      TopPic Games &middot; <a href="${esc(SITE)}" style="color:${C.secondary};">toppicgames.com</a><br>
      <span style="color:#7e7ba3;">You are getting this because of activity on your TopPic account.</span>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

const h1 = (t: string) => `<h1 class="h1" style="margin:0 0 14px;font-family:${FONT};font-size:30px;line-height:1.2;color:#ffffff;">${t}</h1>`;
const p = (t: string) => `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:25px;color:${C.text};">${t}</p>`;
const small = (t: string) => `<p style="margin:0 0 10px;font-family:${FONT};font-size:13px;line-height:20px;color:${C.muted};">${t}</p>`;
const linkBox = (href: string) =>
  `<p style="margin:0 0 6px;font-family:${FONT};font-size:12px;color:${C.muted};">Button not working? Paste this link into your browser:</p>
<p style="margin:0 0 18px;font-family:'Courier New',monospace;font-size:12px;line-height:18px;word-break:break-all;"><a href="${esc(href)}" style="color:${C.secondary};">${esc(href)}</a></p>`;
const cta = (href: string, label: string) => `<div style="margin:26px 0 24px;">${button(href, label)}</div>`;

export function verifyEmail(o: { to: string; name?: string | null; verifyUrl: string }): Email {
  const url = safeUrl(o.verifyUrl);
  const n = firstName(o.name, o.to);
  const body = [
    h1(`Welcome to TopPic, ${n}!`),
    p("You are one tap away from drafting superheroes, anime icons, football legends and more, then letting the AI judge crown the winner."),
    p("Confirm your email so we know it is really you:"),
    cta(url, "Verify my email"),
    linkBox(url),
    small("This link works for 24 hours."),
    small("Did not sign up? You can safely ignore this email and nothing will happen."),
  ].join("");
  return {
    subject: "Verify your email to start playing TopPic",
    html: layout({ preheader: "One tap to confirm your email and start drafting.", title: "Verify your email", body }),
    text: [`Welcome to TopPic, ${(o.name || o.to).split(/[\s@]/)[0]}!`, "", "Confirm your email so we know it is really you:", url, "", "This link works for 24 hours.", "Did not sign up? Ignore this email and nothing will happen.", "", `Need help? ${SUPPORT}`].join("\n"),
  };
}

export function resetEmail(o: { to: string; name?: string | null; resetUrl: string }): Email {
  const url = safeUrl(o.resetUrl);
  const n = firstName(o.name, o.to);
  const body = [
    h1("Reset your password"),
    p(`Hi ${n}, we got a request to reset the password on your TopPic account.`),
    p("Choose a new one with the button below:"),
    cta(url, "Choose a new password"),
    linkBox(url),
    small("For your security this link works for 1 hour and only once."),
    small("Did not ask for this? Your password has not changed. You can ignore this email, or write to us if it keeps happening."),
  ].join("");
  return {
    subject: "Reset your TopPic password",
    html: layout({ preheader: "Choose a new password. The link works for 1 hour.", title: "Reset your password", body }),
    text: [`Hi ${(o.name || o.to).split(/[\s@]/)[0]},`, "", "We got a request to reset your TopPic password. Choose a new one here:", url, "", "This link works for 1 hour and only once.", "Did not ask for this? Your password has not changed. Ignore this email.", "", `Need help? ${SUPPORT}`].join("\n"),
  };
}

export function receiptEmail(o: { to: string; name?: string | null; amountCents: number; currency: string; invoiceUrl?: string; billingCycle?: string; receiptId?: string; date?: string }): Email {
  const n = firstName(o.name, o.to);
  const currency = o.currency.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) || "USD";
  const amount = `${(o.amountCents / 100).toFixed(2)} ${currency}`;
  const cycle = o.billingCycle === "yearly" ? "Yearly" : "Monthly";
  const when = (() => {
    const d = o.date ? new Date(o.date) : new Date();
    return Number.isNaN(d.getTime()) ? new Date().toDateString() : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  })();
  const row = (k: string, v: string, last = false) =>
    `<tr><td style="padding:12px 0;${last ? "" : `border-bottom:1px solid ${C.border};`}font-family:${FONT};font-size:14px;color:${C.muted};">${k}</td><td align="right" style="padding:12px 0;${last ? "" : `border-bottom:1px solid ${C.border};`}font-family:${FONT};font-size:14px;color:#ffffff;font-weight:bold;">${v}</td></tr>`;
  const invoice = o.invoiceUrl ? safeUrl(o.invoiceUrl) : null;
  const body = [
    h1("Thanks for backing TopPic"),
    p(`Hi ${n}, your payment went through. Here is your receipt.`),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 6px;">${row("Plan", `TopPic ${cycle}`)}${row("Amount", esc(amount))}${row("Date", esc(when))}${row("Receipt", esc(o.receiptId || "N/A"), true)}</table>`,
    invoice ? cta(invoice, "View your invoice") : "",
    small("You can manage or cancel your subscription any time from your account page."),
  ].join("");
  return {
    subject: "Your TopPic receipt",
    html: layout({ preheader: `Payment received: ${amount}. Thank you!`, title: "Your TopPic receipt", body }),
    text: [`Hi ${(o.name || o.to).split(/[\s@]/)[0]},`, "", "Your payment went through. Receipt:", `Plan: TopPic ${cycle}`, `Amount: ${amount}`, `Date: ${when}`, `Receipt: ${o.receiptId || "N/A"}`, invoice ? `Invoice: ${invoice}` : "", "", "Manage or cancel any time from your account page.", `Need help? ${SUPPORT}`].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n"),
  };
}
