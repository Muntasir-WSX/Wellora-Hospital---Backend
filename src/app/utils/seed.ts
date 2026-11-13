import bcrypt from "bcryptjs";
import {
  Role,
  UserStatus,
} from "../../generated/prisma/enums.js";
import config from "../config/index.js";
import { prisma } from "../lib/prisma.js";

export const seedSuperAdmin = async () => {
  try {
    const name = config.super_admin_name;
    const email = config.super_admin_email?.trim().toLowerCase();
    const password = config.super_admin_password;

    if (!name || !email || !password) {
      throw new Error("Super Admin Name, Email, or Password Missing In Env File!");
    }

    const hashedPassword = await bcrypt.hash(
      password,
      Number(config.bcrypt_salt_rounds),
    );

    const existingSuperAdmin = await prisma.user.findFirst({
      where: { role: Role.SUPER_ADMIN },
    });

    if (existingSuperAdmin) {
      await prisma.user.update({
        where: { id: existingSuperAdmin.id },
        data: {
          name,
          email,
          password: hashedPassword,
          status: UserStatus.ACTIVE,
          needPasswordChange: false,
          emailVerified: true,
          isDeleted: false,
        },
      });
      console.log("Super Admin Synced Successfully!");
      return;
    }

    const superAdmin = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: Role.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
        needPasswordChange: false,
        emailVerified: true,
      },
    });

    console.log("Super Admin Created:", superAdmin.email);
  } catch (error) {
    console.error("Error Seeding Super Admin:", error);
  }
};

// Create / Sync Admin
export const seedAdmin = async () => {
  try {
    const name = config.admin_name;
    const email = config.admin_email?.trim().toLowerCase();
    const password = config.admin_password;

    if (!name || !email || !password) {
      throw new Error("Admin Name, Email, or Password Missing In Env File!");
    }

    const hashedPassword = await bcrypt.hash(
      password,
      Number(config.bcrypt_salt_rounds),
    );

    const existingAdmin = await prisma.user.findUnique({
      where: { email },
    });

    if (existingAdmin) {
      await prisma.user.update({
        where: { id: existingAdmin.id },
        data: {
          name,
          password: hashedPassword,
          role: Role.ADMIN,
          status: UserStatus.ACTIVE,
          needPasswordChange: false,
          emailVerified: true,
          isDeleted: false,
        },
      });
      console.log("Admin Synced Successfully!");
      return;
    }

    const testerAdmin = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: Role.ADMIN,
        status: UserStatus.ACTIVE,
        needPasswordChange: false,
        emailVerified: true,
      },
    });

    console.log("Admin Created:", testerAdmin.email);
  } catch (error) {
    console.error("Error Seeding Admin:", error);
  }
};

// Create / Sync Moderator. Moderators use the existing ADMIN role.
export const seedModerator = async () => {
  try {
    const name = config.moderator_name;
    const email = config.moderator_email?.trim().toLowerCase();
    const password = config.moderator_password;

    if (!name || !email || !password) {
      throw new Error("Moderator Name, Email, or Password Missing In Env File!");
    }

    const hashedPassword = await bcrypt.hash(
      password,
      Number(config.bcrypt_salt_rounds),
    );

    const existingModerator = await prisma.user.findUnique({
      where: { email },
    });

    if (existingModerator) {
      await prisma.user.update({
        where: { id: existingModerator.id },
        data: {
          name,
          password: hashedPassword,
          role: Role.ADMIN,
          status: UserStatus.ACTIVE,
          needPasswordChange: false,
          emailVerified: true,
          isDeleted: false,
        },
      });
      console.log("Moderator Synced Successfully!");
      return;
    }

    const moderator = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: Role.ADMIN,
        status: UserStatus.ACTIVE,
        needPasswordChange: false,
        emailVerified: true,
      },
    });

    console.log("Moderator Created:", moderator.email);
  } catch (error) {
    console.error("Error Seeding Moderator:", error);
  }
};