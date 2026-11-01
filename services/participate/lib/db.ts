import { PrismaClient } from "@prisma/client";

const createClient = () =>
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    // The private production database is reached over an encrypted network hop.
    // Keep transactions bounded while allowing complete profile/credit snapshots.
    transactionOptions: { maxWait: 5000, timeout: 15000 }
  });

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
