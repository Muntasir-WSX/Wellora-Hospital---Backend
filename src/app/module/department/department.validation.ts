import { z } from "zod";

export const CreateDepartmentSchema = z.object({
	name: z.string().trim().min(2).max(100),
	description: z.string().trim().max(500).optional(),
	imageUrl: z.url().optional(),
});

export const UpdateDepartmentSchema = CreateDepartmentSchema.partial();
