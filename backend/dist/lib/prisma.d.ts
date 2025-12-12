import "dotenv/config";
import { PrismaClient } from "@prisma/client";
declare global {
    var prisma: PrismaClient | undefined;
}
declare const prisma: PrismaClient<import(".prisma/client").Prisma.PrismaClientOptions, import(".prisma/client").Prisma.LogLevel, import("@prisma/client/runtime/client").DefaultArgs>;
export default prisma;
//# sourceMappingURL=prisma.d.ts.map