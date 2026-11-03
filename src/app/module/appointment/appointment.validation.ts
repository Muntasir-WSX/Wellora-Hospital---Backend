import z from "zod";

export const BookAppointmentValidationZodSchema = z.object({
	scheduleId: z.string().min(1, "Schedule Id Is Required"),
	type: z.enum(["ONLINE", "IN_PERSON"]).default("ONLINE"),
});

export const UpdateAppointmentStatusValidationZodSchema = z.object({
	status: z.enum(
		["ONGOING", "COMPLETED"],
		"Status Must Be Either ONGOING Or COMPLETED",
	),
});
