import httpStatus from "http-status";
import { AppointmentStatus } from "../../../generated/prisma/enums.js";
import { prisma } from "../../lib/prisma.js";
import type { RequestUser } from "../../middleware/checkAuth.js";
import { AppError } from "../../utils/AppError.js";

const createReview = async (
	data: { appointmentId: string; rating: number; comment?: string },
	user: RequestUser,
) => {
	const patient = await prisma.patient.findUnique({
		where: { userId: user.userId },
	});
	if (!patient)
		throw new AppError(httpStatus.NOT_FOUND, "Patient Profile Not Found");

	const appointment = await prisma.appointment.findUnique({
		where: { id: data.appointmentId },
	});
	if (!appointment || appointment.patientId !== patient.id) {
		throw new AppError(httpStatus.NOT_FOUND, "Appointment Not Found");
	}
	if (appointment.status !== AppointmentStatus.COMPLETED) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Only Completed Appointments Can Be Reviewed",
		);
	}

	const existing = await prisma.review.findUnique({
		where: { appointmentId: appointment.id },
	});
	if (existing)
		throw new AppError(httpStatus.CONFLICT, "Appointment Already Reviewed");

	return prisma.review.create({
		data: {
			appointmentId: appointment.id,
			patientId: patient.id,
			doctorId: appointment.doctorId,
			rating: data.rating,
			comment: data.comment,
		},
	});
};

const getDoctorReviews = (doctorId: string) =>
	prisma.review.findMany({
		where: { doctorId },
		orderBy: { createdAt: "desc" },
		include: {
			patient: {
				select: {
					id: true,
					name: true,
					user: { select: { imageUrl: true } },
				},
			},
		},
	});

export const ReviewServices = { createReview, getDoctorReviews };
