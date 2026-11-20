import type { Request, Response } from "express";
import httpStatus from "http-status";
import type { IQuery } from "../../interfaces/index.js";
import { AppError } from "../../utils/AppError.js";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { BlogServices } from "./blog.service.js";

const createBlog = catchAsync(async (req: Request, res: Response) => {
	if (!req.user)
		throw new AppError(httpStatus.UNAUTHORIZED, "Authentication required");
	const data = await BlogServices.createBlog(
		req.user.userId,
		req.body,
		req.file?.buffer,
	);
	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Blog created successfully",
		data,
	});
});

const getPublicBlogs = catchAsync(async (req: Request, res: Response) => {
	const { data, meta } = await BlogServices.getPublicBlogs(req.query as IQuery);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Blogs retrieved successfully",
		data,
		meta,
	});
});

const getAllBlogsForAdmin = catchAsync(async (req: Request, res: Response) => {
	const { data, meta } = await BlogServices.getAllBlogsForAdmin(
		req.query as IQuery,
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Admin blogs retrieved successfully",
		data,
		meta,
	});
});

const getSingleBlog = catchAsync(async (req: Request, res: Response) => {
	const data = await BlogServices.getSingleBlogBySlug(
		req.params.slug as string,
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Blog retrieved successfully",
		data,
	});
});

const updateBlog = catchAsync(async (req: Request, res: Response) => {
	const data = await BlogServices.updateBlog(
		req.params.id as string,
		req.body,
		req.file?.buffer,
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Blog updated successfully",
		data,
	});
});

const deleteBlog = catchAsync(async (req: Request, res: Response) => {
	await BlogServices.deleteBlog(req.params.id as string);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Blog deleted successfully",
		data: null,
	});
});

export const BlogController = {
	createBlog,
	getPublicBlogs,
	getAllBlogsForAdmin,
	getSingleBlog,
	updateBlog,
	deleteBlog,
};
