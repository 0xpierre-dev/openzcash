import {
  CommunityMembershipRole,
  CommunityMembershipStatus,
  PrismaClient,
  UserRole,
  UserStatus
} from "@prisma/client";
import { hashSync } from "bcryptjs";

const prisma = new PrismaClient();

function readRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for db:seed`);
  }
  return value;
}

async function main() {
  const adminNick = readRequiredEnv("SEED_ADMIN_NICK");
  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim() || undefined;
  const adminPassword = readRequiredEnv("SEED_ADMIN_PASSWORD");
  const communityName = readRequiredEnv("SEED_COMMUNITY_NAME");
  const communitySlug = readRequiredEnv("SEED_COMMUNITY_SLUG");

  if (communityName.length < 3 || communityName.length > 100 ||
      communitySlug.length < 3 || communitySlug.length > 64 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(communitySlug)) {
    throw new Error("Seed community requires a name of 3–100 characters and a lowercase hyphenated slug of 3–64 characters");
  }

  await prisma.$transaction(async (tx) => {
    let admin = await tx.user.findUnique({ where: { nick: adminNick } });
    if (admin) {
      if (admin.role !== UserRole.ADMIN || admin.status !== UserStatus.ACTIVE) {
        throw new Error("Existing seed user must already be an active administrator; review access manually");
      }
    } else {
      admin = await tx.user.create({
        data: {
          nick: adminNick,
          email: adminEmail,
          passwordHash: hashSync(adminPassword, 10),
          role: UserRole.ADMIN
        }
      });
    }

    const existing = await tx.community.findUnique({
      where: { slug: communitySlug },
      include: { memberships: { where: { userId: admin.id } } }
    });
    if (existing) {
      const membership = existing.memberships[0];
      if (existing.createdById !== admin.id ||
          membership?.role !== CommunityMembershipRole.OWNER ||
          membership?.status !== CommunityMembershipStatus.ACTIVE) {
        throw new Error("Existing seed community does not have the expected active owner; review access manually");
      }
      return;
    }

    await tx.community.create({
      data: {
        name: communityName,
        slug: communitySlug,
        createdById: admin.id,
        memberships: {
          create: {
            userId: admin.id,
            role: CommunityMembershipRole.OWNER,
            status: CommunityMembershipStatus.ACTIVE
          }
        }
      }
    });
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
