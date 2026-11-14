import bcrypt from "bcryptjs";
import {
  Role,
  UserStatus,
} from "../../generated/prisma/enums.js";
import config from "../config/index.js";
import { prisma } from "../lib/prisma.js";

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

    const existingAdmin = await prisma.user.findFirst({
      where: { role: Role.SUPER_ADMIN },
    });

    if (existingAdmin) {
      await prisma.user.update({
        where: { id: existingAdmin.id },
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
      console.log("Admin Synced Successfully!");
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

    console.log("Admin Created:", superAdmin.email);
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

    const existingModerator =
      (await prisma.user.findUnique({ where: { email } })) ??
      (await prisma.user.findFirst({ where: { role: Role.ADMIN } }));

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


export const COMMON_DEPARTMENTS = [
  {
    name: "Cardiology",
    description: "Comprehensive heart, cardiovascular, and hypertension care.",
  },
  {
    name: "Neurology",
    description: "Diagnosis and treatment of brain, spinal cord, and nervous system disorders.",
  },
  {
    name: "Orthopaedics & Joint Replacement Surgery",
    description: "Bone, joint, spine, sports injury, and joint replacement care.",
  },
  {
    name: "Obstetrics and Gynaecology",
    description: "Women's reproductive health, pregnancy, and maternity care.",
  },
  {
    name: "Paediatrics",
    description: "Complete medical care for infants, children, and adolescents.",
  },
  {
    name: "Dermatology & Venereology",
    description: "Skin, hair, nail, allergy, and cosmetic dermatology treatments.",
  },
  {
    name: "Gastroenterology & Hepatology",
    description: "Digestive tract, stomach, liver, and pancreatic disorder management.",
  },
  {
    name: "ENT & Head Neck Surgery",
    description: "Ear, nose, throat, sinus, and head-neck surgical care.",
  },
  {
    name: "Ophthalmology",
    description: "Comprehensive eye care, vision testing, and cataract surgery.",
  },
  {
    name: "Endocrinology & Diabetology",
    description: "Diabetes, thyroid, hormone, and metabolic disorder care.",
  },
  {
    name: "Internal Medicine",
    description: "Adult primary care and complex multi-system disease management.",
  },
  {
    name: "General & Laparoscopic Surgery",
    description: "Minimally invasive laparoscopic and general surgical procedures.",
  },
  {
    name: "Nephrology",
    description: "Kidney disease, dialysis, and renal health management.",
  },
  {
    name: "Respiratory Medicine",
    description: "Asthma, COPD, lung infection, and pulmonary care.",
  },
  {
    name: "Psychiatry & Mental Health",
    description: "Mental wellness, anxiety, depression, and behavioral therapy.",
  },
];

export const seedDepartments = async () => {
  try {
    for (const dept of COMMON_DEPARTMENTS) {
      await prisma.department.upsert({
        where: { name: dept.name },
        update: { isDeleted: false },
        create: {
          name: dept.name,
          description: dept.description,
        },
      });
    }
    console.log("15 Common Departments Synced Successfully!");
  } catch (error) {
    console.error("Error Seeding Departments:", error);
  }
};