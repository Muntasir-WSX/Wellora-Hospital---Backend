import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { catchAsync } from "../utils/catchAsync.js";
import { AppError } from "../utils/AppError.js";

export const validateRequest = (zodSchema: ZodType) => {
	return catchAsync((req: Request, res: Response, next: NextFunction) => {
		// const payload = req.body ? req.body : {}
		const payload = req.body ?? {};

		const result = zodSchema.safeParse(payload);

		if (!result.success) {
			throw new AppError(
				400,
				result.error.issues[0]?.message ?? "Validation Error",
			);
		}

		req.body = result.data;

		next();
	});
};
