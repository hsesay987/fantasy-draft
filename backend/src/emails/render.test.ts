import { describe, expect, it } from "vitest";
import { esc, receiptEmail, resetEmail, safeUrl, verifyEmail } from "./render";

describe("email rendering", () => {
  const verify = verifyEmail({ to: "ann@example.com", name: "Ann Lee", verifyUrl: "https://toppicgames.com/verify-email?token=abc123" });
  it("verify email has the link in the button, fallback link and plain text", () => {
    expect(verify.html).toContain('href="https://toppicgames.com/verify-email?token=abc123"');
    expect((verify.html.match(/token=abc123/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(verify.text).toContain("https://toppicgames.com/verify-email?token=abc123");
    expect(verify.subject).toMatch(/verify/i);
    expect(verify.html).toContain("Welcome to TopPic, Ann!");
    expect(verify.html).toContain("24 hours");
  });
  it("uses the part before the @ when there is no name", () => {
    expect(verifyEmail({ to: "zed@example.com", verifyUrl: "https://x.test/v" }).html).toContain("Welcome to TopPic, zed!");
  });
  it("escapes anything a user can control", () => {
    const m = resetEmail({ to: "a@b.c", name: '<script>alert(1)</script>"', resetUrl: "https://x.test/r?token=1&b=2" });
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&amp;b=2");
    expect(esc(`<a href="x">'&`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
  });
  it("refuses links that are not http(s)", () => {
    expect(() => safeUrl("javascript:alert(1)")).toThrow();
    expect(() => verifyEmail({ to: "a@b.c", verifyUrl: "javascript:alert(1)" })).toThrow();
    expect(() => resetEmail({ to: "a@b.c", resetUrl: "not a url" })).toThrow();
  });
  it("reset email states the 1 hour expiry and never prints undefined", () => {
    const m = resetEmail({ to: "a@b.c", resetUrl: "https://x.test/r" });
    expect(m.html).toContain("1 hour");
    expect(m.html + m.text).not.toMatch(/undefined|null|NaN/);
  });
  it("receipt shows formatted amount, cycle, date and optional invoice link", () => {
    const m = receiptEmail({ to: "a@b.c", name: "Ann", amountCents: 499, currency: "usd", billingCycle: "yearly", receiptId: "in_123", date: "2026-10-24T10:00:00Z", invoiceUrl: "https://x.test/inv" });
    expect(m.html).toContain("4.99 USD");
    expect(m.html).toContain("TopPic Yearly");
    expect(m.html).toContain("October 24, 2026");
    expect(m.html).toContain("View your invoice");
    expect(m.text).toContain("Invoice: https://x.test/inv");
    const noInv = receiptEmail({ to: "a@b.c", amountCents: 1000, currency: "eur" });
    expect(noInv.html).not.toContain("View your invoice");
    expect(noInv.html).toContain("10.00 EUR");
    expect(noInv.html + noInv.text).not.toMatch(/undefined|NaN|Invalid Date/);
  });
  it("is a complete, mobile-aware HTML document with a preheader", () => {
    expect(verify.html.startsWith("<!doctype html>")).toBe(true);
    expect(verify.html).toContain('name="viewport"');
    expect(verify.html).toContain("max-width:620px");
    expect(verify.html).toContain("Draft anything. Take the top pic.");
  });
});
