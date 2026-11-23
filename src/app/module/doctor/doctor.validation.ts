import { z } from "zod";

export const ApplyAsDoctorValidationZodSchema = z.object({
  user: z.object({
    name: z.string().trim().min(2, "Name must be at least 2 characters long"),
    email: z.email("Invalid email address").trim().toLowerCase(),
    password: z
      .string()
      .min(8, "Password Must Minimum 8 Characters Long.")
      .regex(/[a-z]/, "Password must contain atleast 1 Lowercase Letter")
      .regex(/[A-Z]/, "Password must contain atleast 1 Uppercase Letter")
      .regex(/[0-9]/, "Password must contain atleast 1 Number")
      .regex(/[^A-Za-z0-9]/, "Password must contain atleast 1 Special Character"),
  }),

  doctor: z.object({
    address: z
      .string()
      .trim()
      .min(5, "Address must be at least 5 characters long")
      .optional(),

    specialization: z.string().trim().min(2, "Specialization is required"),

    licenseNumber: z.string().trim().min(3, "License number is required"),

    qualifications: z.string().trim().min(2, "Qualifications are required"),

    experienceYears: z
      .number()
      .int("Experience years must be an integer")
      .min(0, "Experience years cannot be negative"),

    bio: z
      .string()
      .trim()
      .max(1000, "Bio cannot exceed 1000 characters")
      .optional(),

    consultationFee: z
      .number()
      .min(0, "Consultation fee cannot be negative")
      .optional(),

    contactNumber: z
      .string()
      .trim()
      .min(5, "Contact number is invalid")
      .optional(),

    departmentId: z
      .string({ error: "Department is required" })
      .uuid("Invalid Department ID"),
  }),
});

export const UpdateDoctorProfileValidationZodSchema = z.object({
  departmentId: z.uuid("Invalid Department ID").optional(),

  address: z
    .string()
    .trim()
    .min(5, "Address must be at least 5 characters long")
    .optional(),

  bio: z
    .string()
    .trim()
    .max(1000, "Bio cannot exceed 1000 characters")
    .optional(),

  consultationFee: z
    .number()
    .min(0, "Consultation fee cannot be negative")
    .optional(),

  contactNumber: z
    .string()
    .trim()
    .min(5, "Contact number is invalid")
    .optional(),
});

export const ApproveDoctorValidationZodSchema = z.object({
  doctorId: z.uuid("Invalid Doctor ID"),
  verificationStatus: z.enum(["APPROVED", "REJECTED"]),
  rejectionReason: z.string().trim().min(5, "Rejection reason must be at least 5 characters").optional(),
});