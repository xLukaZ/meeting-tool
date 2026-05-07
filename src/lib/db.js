import { PrismaClient } from "@prisma/client";

// Singleton – verhindert zu viele DB-Verbindungen in Next.js Dev-Mode
const globalForPrisma = globalThis;
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
