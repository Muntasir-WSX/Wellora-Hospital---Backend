import { z } from "zod";

export const CreateReviewSchema = z.object({
	appointmentId: z.string().min(1),
	rating: z.number().int().min(1).max(5),
	comment: z.string().trim().max(1000).optional(),
});
