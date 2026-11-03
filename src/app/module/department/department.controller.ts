import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { DepartmentServices } from "./department.service.js";

const getDepartments = catchAsync(async (_req: Request, res: Response) => {
	const data = await DepartmentServices.getDepartments();
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Departments Retrieved Successfully",
		data,
	});
});

const createDepartment = catchAsync(async (req: Request, res: Response) => {
	const data = await DepartmentServices.createDepartment(req.body);
	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Department Created Successfully",
		data,
	});
});

const updateDepartment = catchAsync(async (req: Request, res: Response) => {
	const data = await DepartmentServices.updateDepartment(
		req.params.departmentId as string,
		req.body,
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Department Updated Successfully",
		data,
	});
});

const deleteDepartment = catchAsync(async (req: Request, res: Response) => {
	const data = await DepartmentServices.deleteDepartment(
		req.params.departmentId as string,
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Department Deleted Successfully",
		data,
	});
});

export const DepartmentController = {
	getDepartments,
	createDepartment,
	updateDepartment,
	deleteDepartment,
};
