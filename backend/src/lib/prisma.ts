import "dotenv/config";
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
  throw new Error("DATABASE_URL is not set. Add it to your environment or .env file.");
}

// Allow an opt-out for TLS verification in dev/behind proxies where the CA is not trusted.
// Set PGSSL_NO_VERIFY=true to disable rejectUnauthorized (not recommended for production).
const wantsNoVerify =
  process.env.PGSSL_NO_VERIFY === "true" ||
  process.env.PGSSL_NO_VERIFY === "1" ||
  (databaseUrl && /accept_invalid_certs/i.test(databaseUrl));

const ssl = wantsNoVerify ? { rejectUnauthorized: false } : undefined;

const pool = new Pool({ connectionString: databaseUrl, ssl });
const adapter = new PrismaPg(pool);

// Reuse a single Prisma client instance to avoid creating too many connections
// when the server reloads in development.
const prisma = globalThis.prisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}

export default prisma;
