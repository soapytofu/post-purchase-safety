import { PrismaClient } from "@prisma/client";
import { databaseConnectionUrl } from "./database-config";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const datasourceUrl = databaseConnectionUrl(process.env.DATABASE_URL);
export const prisma = globalForPrisma.prisma ?? new PrismaClient(datasourceUrl ? { datasourceUrl } : undefined);
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
