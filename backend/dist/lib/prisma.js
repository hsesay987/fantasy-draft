"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const client_1 = require("@prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const pg_1 = require("pg");
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
const wantsNoVerify = process.env.PGSSL_NO_VERIFY === "true" ||
    process.env.PGSSL_NO_VERIFY === "1" ||
    (databaseUrl && /accept_invalid_certs/i.test(databaseUrl));
const ssl = wantsNoVerify ? { rejectUnauthorized: false } : undefined;
const pool = new pg_1.Pool({ connectionString: databaseUrl, ssl });
const adapter = new adapter_pg_1.PrismaPg(pool);
// Reuse a single Prisma client instance to avoid creating too many connections
// when the server reloads in development.
const prisma = globalThis.prisma || new client_1.PrismaClient({ adapter });
if (process.env.NODE_ENV !== "production") {
    globalThis.prisma = prisma;
}
exports.default = prisma;
//# sourceMappingURL=prisma.js.map