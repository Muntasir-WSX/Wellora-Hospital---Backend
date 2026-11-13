import bcrypt from "bcryptjs";
import {
  DoctorVerificationStatus,
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

// Create / Sync Tester Admin
export const seedTesterAdmin = async () => {
  try {
    const name = config.tester_admin_name;
    const email = config.tester_admin_email?.trim().toLowerCase();
    const password = config.tester_admin_password; // Fixed: tester_admin_password

    if (!name || !email || !password) {
      throw new Error("Tester Admin Name, Email, or Password Missing In Env File!");
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
      console.log("Tester Admin Synced Successfully!");
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

    console.log("Tester Admin Created:", testerAdmin.email);
  } catch (error) {
    console.error("Error Seeding Tester Admin:", error);
  }
};

// Create / Sync Tester Doctor (with APPROVED Doctor profile)
export const seedTesterDoctor = async () => {
  try {
    const name = config.tester_doctor_name;
    const email = config.tester_doctor_email?.trim().toLowerCase();
    const password = config.tester_doctor_password; // Fixed: tester_doctor_password

    if (!name || !email || !password) {
      throw new Error("Tester Doctor Name, Email, or Password Missing In Env File!");
    }

    const hashedPassword = await bcrypt.hash(
      password,
      Number(config.bcrypt_salt_rounds),
    );

    const existingDoctorUser = await prisma.user.findUnique({
      where: { email },
      include: { doctor: true },
    });

    if (existingDoctorUser) {
      await prisma.user.update({
        where: { id: existingDoctorUser.id },
        data: {
          name,
          password: hashedPassword,
          role: Role.DOCTOR,
          status: UserStatus.ACTIVE,
          needPasswordChange: false,
          emailVerified: true,
          isDeleted: false,
          doctor: existingDoctorUser.doctor
            ? {
                update: {
                  verificationStatus: DoctorVerificationStatus.APPROVED,
                },
              }
            : {
                create: {
                  name,
                  email,
                  contactNumber: "01700000000",
                  specialization: "Internal Medicine",
                  licenseNumber: "BMDC-TEST-001",
                  qualifications: "MBBS, FCPS",
                  experienceYears: 10,
                  consultationFee: 500,
                  verificationStatus: DoctorVerificationStatus.APPROVED,
                },
              },
        },
      });
      console.log("Tester Doctor Synced Successfully!");
      return;
    }

    const testerDoctor = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: Role.DOCTOR,
        status: UserStatus.ACTIVE,
        needPasswordChange: false,
        emailVerified: true,
        doctor: {
          create: {
            name,
            email,
            contactNumber: "01700000000",
            specialization: "Internal Medicine",
            licenseNumber: "BMDC-TEST-001",
            qualifications: "MBBS, FCPS",
            experienceYears: 10,
            consultationFee: 500,
            verificationStatus: DoctorVerificationStatus.APPROVED,
          },
        },
      },
    });

    console.log("Tester Doctor Created:", testerDoctor.email);
  } catch (error) {
    console.error("Error Seeding Tester Doctor:", error);
  }
};