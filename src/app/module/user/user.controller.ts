import type { Request, Response } from "express";
import httpStatus from "http-status";
import { AppError } from "../../utils/AppError.js";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { UserServices } from "./user.service.js";

const uploadProfileImage = catchAsync(async (req: Request, res: Response) => {
	if (!req.file) {
		throw new Error("No File Provided.");
	}

	if (!req.user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in.");
	}

	const result = await UserServices.uploadProfileImage(
		req.file.buffer,
		req.user.userId,
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "New tokens generated successfully",
		data: result,
	});
});

const getMyProfile = catchAsync(async (req: Request, res: Response) => {
	if (!req.user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in.");
	}

	const result = await UserServices.getMyProfile(req.user);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Profile retrieved successfully",
		data: result,
	});
});

const updateMyProfile = catchAsync(async (req: Request, res: Response) => {
	if (!req.user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in.");
	}

	const result = await UserServices.updateMyProfile(req.user, req.body);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Profile updated successfully",
		data: result,
	});
});

export const UserController = {
	uploadProfileImage,
	getMyProfile,
	updateMyProfile,
};
