import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as typeof globalThis & { goctroPrisma?: PrismaClient };

export const prisma = globalForPrisma.goctroPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.goctroPrisma = prisma;
