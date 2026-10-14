import "dotenv/config";
import dotenv from "dotenv";
// backend/.env.local (git-ignored) overrides .env, e.g. to use a local Postgres when the remote database is down.
dotenv.config({ path: ".env.local", override: true });
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Prisma 7 defaults to the "client" engine in some contexts, which expects
// Accelerate/adapter options. Force the Node "library" engine when not set.
if (!process.env.PRISMA_CLIENT_ENGINE_TYPE) {
  process.env.PRISMA_CLIENT_ENGINE_TYPE = "library";
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not set. Add it to your environment or .env file."
  );
}

// Allow an opt-out for TLS verification in dev/behind proxies where the CA is not trusted.
// Set PGSSL_NO_VERIFY=true to disable rejectUnauthorized (not recommended for production).
const wantsNoVerify =
  process.env.PGSSL_NO_VERIFY === "true" ||
  process.env.PGSSL_NO_VERIFY === "1" ||
  (databaseUrl && /accept_invalid_certs/i.test(databaseUrl));

const isLocalDb = (() => {
  try {
    return ["localhost", "127.0.0.1", "::1"].includes(new URL(databaseUrl).hostname);
  } catch {
    return false;
  }
})();

// Local Postgres has no TLS; remote ones (Supabase) need it.
const ssl = isLocalDb ? undefined : wantsNoVerify ? { rejectUnauthorized: false } : undefined;

const pool = new Pool({ connectionString: databaseUrl, ssl });
const adapter = new PrismaPg(pool);

// Reuse a single Prisma client instance to avoid creating too many connections
// when the server reloads in development.
const prisma = globalThis.prisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}

// Fail loudly and helpfully at startup instead of with an opaque 500 on the first request.
pool.query("select 1").catch((e: Error & { code?: string; hostname?: string }) => {
  const host = (() => {
    try {
      return new URL(databaseUrl).host;
    } catch {
      return "the database";
    }
  })();
  const hint = e.code === "ENOTFOUND" ? " (the hostname does not resolve — a paused Supabase project is the usual cause)" : "";
  console.error(`⚠ Database unreachable at ${host}: ${e.message}${hint}. Drafts will not work until it is back. For local dev, point DATABASE_URL at a local Postgres in backend/.env.local.`);
});

export default prisma;
