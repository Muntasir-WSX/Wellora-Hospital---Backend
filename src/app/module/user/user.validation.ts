import { z } from "zod";

export const UpdateMyProfileValidationZodSchema = z.object({
	name: z.string().trim().min(2).max(100).optional(),
	contactNumber: z.string().trim().min(6).max(20).optional(),
	address: z.string().trim().max(255).optional(),
	gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
	dateOfBirth: z.string().optional(),
	bloodGroup: z
		.enum([
			"A_POSITIVE",
			"A_NEGATIVE",
			"B_POSITIVE",
			"B_NEGATIVE",
			"AB_POSITIVE",
			"AB_NEGATIVE",
			"O_POSITIVE",
			"O_NEGATIVE",
		])
		.optional(),
	qualifications: z.string().trim().optional(),
	experienceYears: z.coerce.number().min(0).optional(),
	consultationFee: z.coerce.number().min(0).optional(),
	bio: z.string().trim().max(1000).optional(),
});
