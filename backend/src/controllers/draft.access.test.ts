import { describe, it, expect, vi } from "vitest";

const findUnique = vi.fn();
vi.mock("../lib/prisma", () => ({ default: { draft: { findUnique } } }));

const { canEditDraft } = await import("./draft.controller");

describe("canEditDraft", () => {
  it("lets anyone play an anonymous (ownerless) draft", async () => {
    findUnique.mockResolvedValue({ ownerId: null, rules: {} });
    expect(await canEditDraft("d", null)).toEqual({ ok: true });
    expect(await canEditDraft("d", "u1")).toEqual({ ok: true });
  });

  it("protects owned drafts: owner and seated online players only", async () => {
    findUnique.mockResolvedValue({ ownerId: "owner", rules: { online: true, seatAssignments: ["owner", "friend"] } });
    expect(await canEditDraft("d", "owner")).toEqual({ ok: true });
    expect(await canEditDraft("d", "friend")).toEqual({ ok: true });
    expect(await canEditDraft("d", "stranger")).toMatchObject({ ok: false, status: 403 });
    expect(await canEditDraft("d", null)).toMatchObject({ ok: false, status: 401 });
  });

  it("an offline owned draft is owner-only; missing drafts 404", async () => {
    findUnique.mockResolvedValue({ ownerId: "owner", rules: {} });
    expect(await canEditDraft("d", "friend")).toMatchObject({ ok: false, status: 403 });
    findUnique.mockResolvedValue(null);
    expect(await canEditDraft("d", "owner")).toMatchObject({ ok: false, status: 404 });
  });
});
