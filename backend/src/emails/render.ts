// Branded transactional emails, rendered in code so they are versioned with the app (no dashboard templates to drift).
// Table layout + inline styles for every mail client, a bulletproof button for Outlook, and a plain-text twin.

const C = {
  bg: "#0f0f23",
  card: "#1e1c35",
  tile: "#27244a",
  border: "#34305a",
  text: "#e8e6f7",
  muted: "#a9a6c9",
  primary: "#7c3aed",
  secondary: "#a78bfa",
  accent: "#f43f5e",
};
const SITE = (process.env.FRONTEND_URL || "https://toppicgames.com").replace(/\/+$/, "");
const SUPPORT = "support@toppicgames.com";
const FONT = "'Trebuchet MS','Segoe UI',Helvetica,Arial,sans-serif";
/** The site's own background glow, rendered once as an image (public/email/bg.png). */
const BG_IMG = `${SITE}/email/bg.png`;
const TAGLINE = "Draft anything. Choose the top pic.";

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
const plainName = (name: string | null | undefined, to: string) => (name || to).split(/[\s@]/)[0] || "there";

function money(cents: number, currency: string): { short: string; long: string } {
  const cur = currency.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) || "USD";
  let short = `${(cents / 100).toFixed(2)} ${cur}`;
  try {
    short = new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(cents / 100);
  } catch {
    /* unknown currency code: keep the plain number */
  }
  return { short, long: `${(cents / 100).toFixed(2)} ${cur}` };
}

function button(href: string, label: string): string {
  const h = esc(href);
  return `
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${h}" style="height:52px;v-text-anchor:middle;width:260px;" arcsize="24%" stroke="f" fillcolor="${C.accent}">
<w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${esc(label)}</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<a href="${h}" target="_blank" style="display:inline-block;background-color:${C.accent};background-image:linear-gradient(135deg,${C.accent},${C.primary});color:#ffffff;font-family:${FONT};font-size:16px;font-weight:bold;line-height:52px;height:52px;padding:0 38px;border-radius:12px;text-decoration:none;mso-hide:all;">${esc(label)}</a>
<!--<![endif]-->`;
}

/** Every container sets bgcolor AND background-color: some webmail strips <body> styles and the background shorthand. */
function layout(o: { preheader: string; title: string; eyebrow: string; hero: { file: string; alt: string }; body: string }): string {
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
  body{margin:0;padding:0;width:100%!important;background-color:${C.bg};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
  table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0;}
  img{border:0;outline:none;text-decoration:none;}
  a{color:${C.secondary};}
  @media (max-width:620px){
    .px{padding-left:22px!important;padding-right:22px!important;}
    .h1{font-size:26px!important;}
    .col{display:block!important;width:100%!important;padding:0 0 10px!important;}
  }
</style>
</head>
<body bgcolor="${C.bg}" style="margin:0;padding:0;background-color:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.bg};">${esc(o.preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bg}" background="${esc(BG_IMG)}" style="background-color:${C.bg};background-image:url('${esc(BG_IMG)}');background-repeat:no-repeat;background-position:top center;background-size:1200px 560px;">
<tr><td align="center" bgcolor="${C.bg}" style="padding:36px 12px 64px;background-color:transparent;">
  <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
    <tr><td align="center" style="padding:0 0 24px;">
      <a href="${esc(SITE)}" style="text-decoration:none;font-family:${FONT};font-size:40px;font-weight:bold;letter-spacing:.5px;color:#ffffff;">Top<span style="color:${C.accent};">Pic</span></a>
      <div style="font-family:${FONT};font-size:12px;letter-spacing:2.5px;text-transform:uppercase;color:${C.secondary};padding-top:8px;">${TAGLINE}</div>
    </td></tr>
    <tr><td bgcolor="${C.card}" style="background-color:${C.card};border:1px solid ${C.border};border-radius:20px;overflow:hidden;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td height="6" bgcolor="${C.primary}" style="height:6px;line-height:6px;font-size:0;background-color:${C.primary};background-image:linear-gradient(90deg,${C.primary},${C.accent});">&nbsp;</td></tr>
        <tr><td bgcolor="${C.card}" style="padding:0;background-color:${C.card};font-size:0;line-height:0;"><img src="${esc(SITE)}/email/${o.hero.file}" width="600" alt="${esc(o.hero.alt)}" style="display:block;width:100%;max-width:600px;height:auto;border:0;background-color:${C.card};"></td></tr>
        <tr><td class="px" bgcolor="${C.card}" style="padding:30px 40px 38px;background-color:${C.card};font-family:${FONT};color:${C.text};">
          <div style="margin:0 0 14px;"><span style="display:inline-block;font-family:${FONT};font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:${C.secondary};background-color:#2b2757;border:1px solid ${C.border};border-radius:999px;padding:5px 12px;">${esc(o.eyebrow)}</span></div>
          ${o.body}
        </td></tr>
      </table>
    </td></tr>
    <tr><td align="center" style="padding:26px 16px 0;font-family:${FONT};font-size:13px;line-height:20px;color:${C.muted};">
      <a href="${esc(SITE)}" style="color:${C.secondary};text-decoration:none;font-weight:bold;">Play</a> &nbsp;&middot;&nbsp;
      <a href="${esc(SITE)}/trivia" style="color:${C.secondary};text-decoration:none;font-weight:bold;">Trivia</a> &nbsp;&middot;&nbsp;
      <a href="${esc(SITE)}/online" style="color:${C.secondary};text-decoration:none;font-weight:bold;">Online rooms</a> &nbsp;&middot;&nbsp;
      <a href="mailto:${SUPPORT}" style="color:${C.secondary};text-decoration:none;font-weight:bold;">Support</a>
    </td></tr>
    <tr><td align="center" style="padding:14px 16px 0;font-family:${FONT};font-size:12px;line-height:19px;color:${C.muted};">
      Questions? Just reply to this email, a real person reads it.<br>
      TopPic Games &middot; <a href="${esc(SITE)}" style="color:${C.secondary};">toppicgames.com</a><br>
      <span style="color:#7e7ba3;">You are getting this because of activity on your TopPic account.</span>
    </td></tr>
  </table>
  <!--[if mso]></td></tr></table><![endif]-->
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
<p style="margin:0 0 20px;font-family:'Courier New',monospace;font-size:12px;line-height:18px;word-break:break-all;"><a href="${esc(href)}" style="color:${C.secondary};">${esc(href)}</a></p>`;
const cta = (href: string, label: string) => `<div style="margin:26px 0 26px;">${button(href, label)}</div>`;
const divider = `<div style="height:1px;line-height:1px;font-size:0;background-color:${C.border};margin:6px 0 20px;">&nbsp;</div>`;

/** Three side-by-side tiles that stack on phones. */
function tiles(items: { icon: string; title: string; text: string }[]): string {
  const cells = items
    .map(
      (t, i) => `<td class="col" width="33%" valign="top" style="padding:0 ${i === items.length - 1 ? 0 : 8}px 0 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="${C.tile}" style="background-color:${C.tile};border:1px solid ${C.border};border-radius:14px;padding:16px 14px;font-family:${FONT};">
<div style="font-size:24px;line-height:28px;">${t.icon}</div>
<div style="font-size:14px;font-weight:bold;color:#ffffff;padding:6px 0 4px;">${esc(t.title)}</div>
<div style="font-size:12px;line-height:18px;color:${C.muted};">${esc(t.text)}</div>
</td></tr></table></td>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 22px;"><tr>${cells}</tr></table>`;
}

export function verifyEmail(o: { to: string; name?: string | null; verifyUrl: string }): Email {
  const url = safeUrl(o.verifyUrl);
  const n = firstName(o.name, o.to);
  const body = [
    h1(`Oh hey, ${n} &#128075; welcome to TopPic`),
    p("You are one tap from your first draft. Choose a topic, build your team, and let the AI judge crown the winner."),
    p("First, confirm your email so we know it is really you:"),
    cta(url, "Verify my email"),
    divider,
    p(`<strong style="color:#ffffff;">What is waiting for you</strong>`),
    tiles([
      { icon: "&#127919;", title: "10 ways to draft", text: "Classic, auction, spin, blind rank and more." },
      { icon: "&#129504;", title: "Trivia boards", text: "Summit, Hot Air and Costimation for every topic." },
      { icon: "&#127760;", title: "Play with friends", text: "Share a room code and go head to head." },
    ]),
    linkBox(url),
    small("This link works for 24 hours."),
    small("Did not sign up? You can safely ignore this email and nothing will happen."),
  ].join("");
  return {
    subject: "Welcome to TopPic \u{1F3AF} Confirm your email",
    html: layout({ preheader: "One tap to confirm your email and choose your first top pic.", title: "Verify your email", eyebrow: "Welcome", hero: { file: "hero-welcome.jpg", alt: "A fan of TopPic draft cards" }, body }),
    text: [`Oh hey, ${plainName(o.name, o.to)}, welcome to TopPic!`, "", "You are one tap from your first draft. Confirm your email so we know it is really you:", url, "", "What is waiting for you: 10 ways to draft, trivia boards, and rooms to play with friends.", "", "This link works for 24 hours.", "Did not sign up? Ignore this email and nothing will happen.", "", TAGLINE, `Need help? ${SUPPORT}`].join("\n"),
  };
}

export function resetEmail(o: { to: string; name?: string | null; resetUrl: string }): Email {
  const url = safeUrl(o.resetUrl);
  const n = firstName(o.name, o.to);
  const body = [
    h1("Let&#8217;s get you back in &#128272;"),
    p(`Hi ${n}, we got a request to reset the password on your TopPic account. Choose a new one with the button below.`),
    cta(url, "Choose a new password"),
    linkBox(url),
    divider,
    small(`<strong style="color:#ffffff;">Good to know</strong>`),
    small("&bull; This link works for 1 hour and only once."),
    small("&bull; Did not ask for this? Your password has not changed. You can ignore this email."),
    small("&bull; Never share this link. TopPic will never ask for your password by email."),
  ].join("");
  return {
    subject: "Reset your TopPic password \u{1F510}",
    html: layout({ preheader: "Choose a new password. The link works for 1 hour.", title: "Reset your password", eyebrow: "Security", hero: { file: "hero-security.jpg", alt: "A shield with a lock" }, body }),
    text: [`Hi ${plainName(o.name, o.to)},`, "", "We got a request to reset your TopPic password. Choose a new one here:", url, "", "This link works for 1 hour and only once.", "Did not ask for this? Your password has not changed. Ignore this email.", "TopPic will never ask for your password by email.", "", TAGLINE, `Need help? ${SUPPORT}`].join("\n"),
  };
}

export function receiptEmail(o: { to: string; name?: string | null; amountCents: number; currency: string; invoiceUrl?: string; billingCycle?: string; receiptId?: string; date?: string }): Email {
  const n = firstName(o.name, o.to);
  const m = money(o.amountCents, o.currency);
  const cycle = o.billingCycle === "yearly" ? "Yearly" : "Monthly";
  const when = (() => {
    const d = o.date ? new Date(o.date) : new Date();
    return Number.isNaN(d.getTime()) ? new Date().toDateString() : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  })();
  const row = (k: string, v: string, last = false) =>
    `<tr><td style="padding:12px 0;${last ? "" : `border-bottom:1px solid ${C.border};`}font-family:${FONT};font-size:14px;color:${C.muted};">${k}</td><td align="right" style="padding:12px 0;${last ? "" : `border-bottom:1px solid ${C.border};`}font-family:${FONT};font-size:14px;color:#ffffff;font-weight:bold;">${v}</td></tr>`;
  const invoice = o.invoiceUrl ? safeUrl(o.invoiceUrl) : null;
  const body = [
    h1("You&#8217;re officially a backer &#127942;"),
    p(`Hi ${n}, your payment went through. You are helping us build more ways to draft, so thank you.`),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 20px;"><tr><td align="center" bgcolor="${C.tile}" style="background-color:${C.tile};border:1px solid ${C.border};border-radius:14px;padding:22px 16px;font-family:${FONT};">
<div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${C.secondary};">Amount paid</div>
<div style="font-size:40px;line-height:48px;font-weight:bold;color:#ffffff;padding:4px 0 2px;">${esc(m.short)}</div>
<div style="font-size:13px;color:${C.muted};">TopPic ${cycle} &middot; ${esc(when)}</div>
</td></tr></table>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 6px;">${row("Plan", `TopPic ${cycle}`)}${row("Amount", esc(m.long))}${row("Date", esc(when))}${row("Receipt", esc(o.receiptId || "N/A"), true)}</table>`,
    invoice ? cta(invoice, "View your invoice") : "",
    small("You can manage or cancel your subscription any time from your account page."),
  ].join("");
  return {
    subject: "Your TopPic receipt \u{1F3C6}",
    html: layout({ preheader: `Payment received: ${m.short}. Thank you!`, title: "Your TopPic receipt", eyebrow: "Receipt", hero: { file: "hero-receipt.jpg", alt: "A golden trophy on a podium" }, body }),
    text: [`Hi ${plainName(o.name, o.to)},`, "", "Your payment went through. Receipt:", `Plan: TopPic ${cycle}`, `Amount: ${m.long}`, `Date: ${when}`, `Receipt: ${o.receiptId || "N/A"}`, invoice ? `Invoice: ${invoice}` : "", "", "Manage or cancel any time from your account page.", TAGLINE, `Need help? ${SUPPORT}`].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n"),
  };
}
