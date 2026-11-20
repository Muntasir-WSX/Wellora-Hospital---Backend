import { z } from "zod";

export const CreateBlogZodSchema = z.object({
	title: z
		.string()
		.trim()
		.min(5, "Title must be at least 5 characters")
		.max(200),
	excerpt: z.string().trim().max(400).optional(),
	content: z.string().trim().min(20, "Content is too short"),
	category: z.string().trim().min(2).max(60).optional(),
	isPublished: z
		.union([z.boolean(), z.string()])
		.transform((value) => value === true || value === "true")
		.optional(),
});

export const UpdateBlogZodSchema = CreateBlogZodSchema.partial();
