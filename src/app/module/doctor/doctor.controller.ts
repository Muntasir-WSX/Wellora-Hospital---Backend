import type { Request, Response } from "express";
import httpStatus from "http-status";
import { AppError } from "../../utils/AppError.js";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { DoctorServices } from "./doctor.service.js";
import {
	ApplyAsDoctorValidationZodSchema,
} from "./doctor.validation.js";

const applyAsDoctor = catchAsync(async (req: Request, res: Response) => {
  const files = req.files as {
    [fieldname: string]: Express.Multer.File[];
  } | undefined;

  const resume = files?.resume?.[0];
  const additionalFiles = files?.additionalFiles || [];
  const profilePhoto = files?.profilePhoto?.[0];

  if (!resume) {
    throw new AppError(httpStatus.BAD_REQUEST, "Resume file is required");
  }

  const parsedBody =
    typeof req.body.data === "string" ? JSON.parse(req.body.data) : req.body;

  const validatedData = ApplyAsDoctorValidationZodSchema.parse(parsedBody);

  const result = await DoctorServices.applyAsDoctor(
    validatedData,
    resume,
    additionalFiles,
    profilePhoto,
  );

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Doctor application submitted. Please verify your email via OTP.",
    data: result,
  });
});
const verifyDoctorEmail = catchAsync(async (req: Request, res: Response) => {
    const payload = req.body;

    const result = await DoctorServices.verifyDoctorEmail(payload);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Doctor Email Verified Successfully",
        data: result,
    });
});

const approveDoctor = catchAsync(async (req: Request, res: Response) => {
	
	const payload = req.body;
	const user = req.user!

	const result = await DoctorServices.approveDoctor(payload, user)
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Doctor Email Verified Successfully",
		data: result,
	});
});
const getAllDoctors = catchAsync(async (req: Request, res: Response) => {
	

	const {data, meta} = await DoctorServices.getAllDoctors(req.query)
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Doctors Retrieved Successfully",
		data: data,
		meta : meta,
	});
});
const updateDoctorProfile = catchAsync(
	async (req: Request, res: Response) => {
		const payload = req.body;
		const user = req.user!;

		const result = await DoctorServices.updateDoctorProfile(payload, user);
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Doctor Profile Updated Successfully",
			data: result,
		});
	},
);



const getAvailableDoctorByTodaysSchedule = catchAsync(
	async (req: Request, res: Response) => {
	

		const { data, meta } = await DoctorServices.getAvailableDoctorByTodaysSchedule(
			req.query
		);
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Today's Available Doctors Retrieved Successfully",
			data,
			meta,
		});
	},
);

const getAllDoctorsListPublic = catchAsync(async (req: Request, res: Response) => {


	const { data, meta } = await DoctorServices.getAllDoctorsListPublic(
		req.query
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Doctors Retrieved Successfully",
		data,
		meta,
	});
});

const getSingleDoctorPublicProfile = catchAsync(
	async (req: Request, res: Response) => {

		const doctorId = req.params.doctorId as string
		
		const result = await DoctorServices.getSingleDoctorPublicProfile(
			doctorId
		);
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Doctor Profile Retrieved Successfully",
			data: result,
		});
	},
);

export const DoctorController = {
	applyAsDoctor,
	verifyDoctorEmail,
	approveDoctor,
	getAllDoctors,
	updateDoctorProfile,
	getAvailableDoctorByTodaysSchedule,
	getAllDoctorsListPublic,
	getSingleDoctorPublicProfile,
};