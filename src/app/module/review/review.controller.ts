import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { ReviewServices } from "./review.service.js";

const createReview = catchAsync(async (req: Request, res: Response) => {
	const data = await ReviewServices.createReview(req.body, req.user!);
	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Review Created Successfully",
		data,
	});
});

const getDoctorReviews = catchAsync(async (req: Request, res: Response) => {
	const data = await ReviewServices.getDoctorReviews(
		req.params.doctorId as string,
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Reviews Retrieved Successfully",
		data,
	});
});

export const ReviewController = { createReview, getDoctorReviews };
