import { z } from "zod";

export const SubscribeNewsletterZodSchema = z.object({
	email: z.string().trim().email("Please enter a valid email address"),
});
