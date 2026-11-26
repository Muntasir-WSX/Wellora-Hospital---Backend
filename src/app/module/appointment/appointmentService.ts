import { addMinutes, isBefore, subHours } from "date-fns";
import httpStatus from "http-status";
import PDFDocument from "pdfkit";
import {
	AppointmentStatus,
	PaymentStatus,
	Role,
	ScheduleStatus,
} from "../../../generated/prisma/enums.js";
import { AppointmentWhereInput } from "../../../generated/prisma/models.js";
import config from "../../config/index.js";
import { IQuery } from "../../interfaces/index.js";
import { getBkashIdToken } from "../../lib/bkash.js";
import { transporter } from "../../lib/nodemailer.js";
import { prisma } from "../../lib/prisma.js";
import type { RequestUser } from "../../middleware/checkAuth.js";
import { AppError } from "../../utils/AppError.js";
import { isSameDhakaDay } from "../../utils/dateTime.js";
import {
	IBookAppointmentPayload,
	ICancelAppointmentPayload,
	IPayAppointmentPayload,
	IUpdateAppointmentStatusPayload,
} from "./appoitment.interface.js";

const getAppointmentStatus = (status: string | undefined) => {
	if (!status) {
		return undefined;
	}

	if (!Object.values(AppointmentStatus).includes(status as AppointmentStatus)) {
		throw new AppError(httpStatus.BAD_REQUEST, "Invalid appointment status");
	}

	return status as AppointmentStatus;
};

const getValidatedBkashCallbackUrl = (): string => {
	const cleanCallbackBase = (config.bkash_callback_url || "")
		.trim()
		.replace(/[\r\n]/g, "")
		.replace(/\/+$/, "");

	if (!cleanCallbackBase || !cleanCallbackBase.startsWith("https://")) {
		throw new AppError(
			httpStatus.INTERNAL_SERVER_ERROR,
			`BKASH_CALLBACK_URL must be a valid public HTTPS URL (Received: "${cleanCallbackBase || "empty"}")`,
		);
	}

	return `${cleanCallbackBase}/appointment/book-appointment/payment/callback`;
};

const bookAppointment = async (
	payload: IBookAppointmentPayload,
	user: RequestUser,
) => {
	// 1. Fast DB validation & PENDING appointment creation
	const { appointment, amount } = await prisma.$transaction(async (tx) => {
		const patient = await tx.patient.findUnique({
			where: { userId: user.userId },
		});

		if (!patient) {
			throw new AppError(httpStatus.NOT_FOUND, "Patient Profile Not Found");
		}

		const schedule = await tx.schedule.findUnique({
			where: { id: payload.scheduleId },
			include: { doctor: true },
		});

		if (!schedule || schedule.isDeleted) {
			throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found");
		}

		if (schedule.status !== ScheduleStatus.PUBLISHED) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"This Schedule Is Not Published Yet",
			);
		}

		const now = new Date();

		if (!isSameDhakaDay(now, schedule.startDateTime)) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"This Schedule Is Not Available Today",
			);
		}

		if (!isBefore(now, schedule.startDateTime)) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"This Schedule Has Already Started",
			);
		}

		const existingAppointment = await tx.appointment.findFirst({
			where: {
				patientId: patient.id,
				scheduleId: schedule.id,
				status: { not: AppointmentStatus.CANCELLED },
			},
		});

		if (existingAppointment?.status === AppointmentStatus.PENDING) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"You Already Have A Pending Appointment. Please Pay For That",
			);
		}
		if (existingAppointment?.status === AppointmentStatus.CONFIRMED) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"You Already Have A Confirmed Appointment.",
			);
		}
		if (existingAppointment?.status === AppointmentStatus.ONGOING) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"You Already Have An Ongoing Appointment",
			);
		}
		if (existingAppointment?.status === AppointmentStatus.COMPLETED) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"You Already Have Completed An Appointment On This Schedule. Please Try Again Another Day",
			);
		}

		if (schedule.availableSlots <= 0) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"This Schedule Is Fully Booked",
			);
		}

		if (!schedule.doctor.consultationFee) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Doctor Has Not Set A Consultation Fee Yet",
			);
		}

		const feeAmount = schedule.doctor.consultationFee.toString();

		const createdAppointment = await tx.appointment.create({
			data: {
				type: payload.type,
				status: AppointmentStatus.PENDING,
				patientId: patient.id,
				doctorId: schedule.doctor.id,
				scheduleId: schedule.id,
			},
		});

		return { appointment: createdAppointment, amount: feeAmount };
	});

	// 2. Initiate bKash payment outside DB transaction
	try {
		const bkashIdToken = await getBkashIdToken();
		const callbackURL = getValidatedBkashCallbackUrl();

		const bkashCreatePaymentResponse = await fetch(
			`${config.bkash_base_url}/tokenized/checkout/create`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
					Authorization: bkashIdToken,
					"X-App-Key": config.bkash_app_key,
				},
				body: JSON.stringify({
					mode: "0011",
					payerReference: user.email,
					callbackURL,
					amount,
					currency: "BDT",
					intent: "sale",
					merchantInvoiceNumber: appointment.id,
				}),
			},
		);

		const bkashCreatePaymentResult = await bkashCreatePaymentResponse.json();

		if (
			!bkashCreatePaymentResponse.ok ||
			bkashCreatePaymentResult.statusCode !== "0000" ||
			!bkashCreatePaymentResult.bkashURL ||
			!bkashCreatePaymentResult.paymentID
		) {
			const gatewayMsg =
				bkashCreatePaymentResult?.statusMessage ||
				bkashCreatePaymentResult?.message ||
				"Failed to initiate bKash payment";

			throw new AppError(
				httpStatus.BAD_GATEWAY,
				`${gatewayMsg} (callbackURL: ${callbackURL})`,
			);
		}

		await prisma.payment.create({
			data: {
				merchantInvoiceNumber:
					bkashCreatePaymentResult.merchantInvoiceNumber || appointment.id,
				appointmentId: appointment.id,
				amount,
				gatewayResponse: bkashCreatePaymentResult,
				bkashPaymentId: bkashCreatePaymentResult.paymentID,
				payerReference: user.email,
			},
		});

		return {
			paymentUrl: bkashCreatePaymentResult.bkashURL,
		};
	} catch (error) {
		// Clean up orphan PENDING appointment if bKash initiation fails
		await prisma.appointment
			.delete({ where: { id: appointment.id } })
			.catch(() => {});
		throw error;
	}
};

const payAppointment = async (
	payload: IPayAppointmentPayload,
	user: RequestUser,
) => {
	const appointmentId = payload.appointmentId;

	const existingAppointment = await prisma.appointment.findUnique({
		where: {
			id: appointmentId,
			patient: {
				userId: user.userId,
			},
		},
		include: {
			payment: true,
			schedule: {
				include: {
					doctor: true,
				},
			},
		},
	});

	if (!existingAppointment) {
		throw new AppError(httpStatus.NOT_FOUND, "Appointment Does Not Exists");
	}

	if (existingAppointment.status !== AppointmentStatus.PENDING) {
		throw new AppError(httpStatus.BAD_REQUEST, "Appointment Is Not Pending!");
	}

	if (!isBefore(new Date(), existingAppointment.schedule.startDateTime)) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"This Schedule Has Already Started",
		);
	}

	if (!existingAppointment.schedule.doctor.consultationFee) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Doctor Has Not Set A Consultation Fee Yet",
		);
	}

	const amount = existingAppointment.schedule.doctor.consultationFee.toString();
	const bkashIdToken = await getBkashIdToken();
	const callbackURL = getValidatedBkashCallbackUrl();

	const bkashCreatePaymentResponse = await fetch(
		`${config.bkash_base_url}/tokenized/checkout/create`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				Authorization: bkashIdToken,
				"X-App-Key": config.bkash_app_key,
			},
			body: JSON.stringify({
				mode: "0011",
				payerReference: user.email,
				callbackURL,
				amount,
				currency: "BDT",
				intent: "sale",
				merchantInvoiceNumber: existingAppointment.id,
			}),
		},
	);

	const bkashCreatePaymentResult = await bkashCreatePaymentResponse.json();

	if (
		!bkashCreatePaymentResponse.ok ||
		bkashCreatePaymentResult.statusCode !== "0000" ||
		!bkashCreatePaymentResult.bkashURL ||
		!bkashCreatePaymentResult.paymentID
	) {
		const gatewayMsg =
			bkashCreatePaymentResult?.statusMessage ||
			bkashCreatePaymentResult?.message ||
			"Failed to initiate bKash payment";

		throw new AppError(
			httpStatus.BAD_GATEWAY,
			`${gatewayMsg} (callbackURL: ${callbackURL})`,
		);
	}

	await prisma.payment.upsert({
		where: {
			appointmentId: existingAppointment.id,
		},
		update: {
			merchantInvoiceNumber:
				bkashCreatePaymentResult.merchantInvoiceNumber ||
				existingAppointment.id,
			gatewayResponse: bkashCreatePaymentResult,
			bkashPaymentId: bkashCreatePaymentResult.paymentID,
		},
		create: {
			merchantInvoiceNumber:
				bkashCreatePaymentResult.merchantInvoiceNumber ||
				existingAppointment.id,
			appointmentId: existingAppointment.id,
			amount,
			gatewayResponse: bkashCreatePaymentResult,
			bkashPaymentId: bkashCreatePaymentResult.paymentID,
			payerReference: user.email,
		},
	});

	return {
		paymentUrl: bkashCreatePaymentResult.bkashURL,
	};
};

const bookAppointmentCallback = async (query: Record<string, any>) => {
	const paymentId = query.paymentID as string | undefined;
	const status = query.status as string | undefined;

	if (!paymentId) {
		throw new AppError(httpStatus.BAD_REQUEST, "Payment Id Missing");
	}

	if (!status) {
		throw new AppError(httpStatus.BAD_REQUEST, "Payment Status is Missing");
	}

	const cleanFrontendUrl = (config.frontend_url || "http://localhost:3000")
		.trim()
		.replace(/[\r\n]/g, "")
		.replace(/\/+$/, "");

	// Execute payment with bKash outside DB transaction
	let executedPaymentResult: Record<string, any> = {};
	let callbackStatus: "success" | "cancel" | "failure" =
		status === "cancel" ? "cancel" : "failure";

	if (status === "success") {
		const bkashIdToken = await getBkashIdToken();

		if (!bkashIdToken) {
			throw new AppError(
				httpStatus.BAD_GATEWAY,
				"No Bkash Access Token Found!",
			);
		}

		const executedPaymentResponse = await fetch(
			`${config.bkash_base_url}/tokenized/checkout/execute`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
					Authorization: bkashIdToken,
					"X-App-Key": config.bkash_app_key,
				},
				body: JSON.stringify({
					paymentID: paymentId,
				}),
			},
		);

		executedPaymentResult = await executedPaymentResponse.json();
		callbackStatus =
			executedPaymentResult.statusCode === "0000" &&
			executedPaymentResult.transactionStatus === "Completed"
				? "success"
				: "failure";
	}

	if (callbackStatus === "success") {
		const confirmedData = await prisma.$transaction(
			async (tx) => {
				const payment = await tx.payment.findUnique({
					where: { bkashPaymentId: paymentId },
					include: {
						appointment: {
							include: {
								schedule: true,
								patient: true,
								doctor: true,
							},
						},
					},
				});

				const appointment = payment?.appointment;

				if (!payment || !appointment) {
					throw new AppError(
						httpStatus.NOT_FOUND,
						"Payment or appointment not found",
					);
				}

				if (
					executedPaymentResult.merchantInvoiceNumber !== appointment.id ||
					Number(executedPaymentResult.amount) !== Number(payment.amount)
				) {
					throw new AppError(
						httpStatus.BAD_REQUEST,
						"Payment details could not be verified",
					);
				}

				const alreadyBookedSlots =
					appointment.schedule.totalSlots - appointment.schedule.availableSlots;
				const serialNumber = alreadyBookedSlots + 1;
				const joiningTime = addMinutes(
					appointment.schedule.startDateTime,
					(serialNumber - 1) * 20,
				);

				await tx.appointment.update({
					where: {
						id: appointment.id,
					},
					data: {
						status: AppointmentStatus.CONFIRMED,
						joiningTime,
						serialNumber,
					},
				});

				await tx.schedule.update({
					where: {
						id: appointment.schedule.id,
					},
					data: {
						availableSlots: Math.max(
							0,
							appointment.schedule.availableSlots - 1,
						),
					},
				});

				await tx.payment.update({
					where: {
						appointmentId: appointment.id,
						bkashPaymentId: paymentId,
					},
					data: {
						status: PaymentStatus.PAID,
						bkashTrxId: executedPaymentResult.trxID,
						paidAt: executedPaymentResult.paymentExecuteTime
							? new Date(executedPaymentResult.paymentExecuteTime)
							: new Date(),
						gatewayResponse: executedPaymentResult,
					},
				});

				return { appointment, serialNumber, joiningTime };
			},
			{
				maxWait: 10000,
				timeout: 20000,
			},
		);

		// Generate PDF invoice & send email outside DB transaction
		try {
			const { appointment, serialNumber, joiningTime } = confirmedData;
			const pdfDocument = new PDFDocument({ margin: 50 });
			const pdfChunks: Buffer[] = [];

			pdfDocument.on("data", (chunk: Buffer) => {
				pdfChunks.push(chunk);
			});

			const pdfReadyPromise = new Promise<Buffer>((resolve) => {
				pdfDocument.on("end", () => {
					resolve(Buffer.concat(pdfChunks));
				});
			});

			pdfDocument.fontSize(20).text("WellOra", { align: "center" });
			pdfDocument
				.fontSize(14)
				.text("Appointment Invoice", { align: "center" });
			pdfDocument.moveDown(2);

			pdfDocument
				.fontSize(12)
				.text(`Patient Name: ${appointment.patient?.name}`);
			pdfDocument.text(`Patient Email: ${appointment.patient?.email}`);
			pdfDocument.moveDown();

			pdfDocument.text(`Doctor Name: ${appointment.doctor?.name}`);
			pdfDocument.text(
				`Specialization: ${appointment.doctor?.specialization}`,
			);
			pdfDocument.moveDown();

			pdfDocument.text(
				`Appointment Date: ${appointment.schedule.startDateTime.toDateString()}`,
			);
			pdfDocument.text(`Your Joining Time: ${joiningTime.toString()}`);
			pdfDocument.text(`Your Serial Number: ${serialNumber}`);
			pdfDocument.text(`Meeting Link: ${appointment.schedule.meetingLink}`);
			pdfDocument.moveDown();

			pdfDocument.text(`Amount Paid: ${executedPaymentResult.amount} BDT`);
			pdfDocument.text(`Payment Method: bKash`);
			pdfDocument.text(`Transaction Id: ${executedPaymentResult.trxID}`);
			pdfDocument.text(
				`Paid At: ${executedPaymentResult.paymentExecuteTime}`,
			);

			pdfDocument.end();

			const pdfBuffer = await pdfReadyPromise;

			await transporter.sendMail({
				from: config.email_sender,
				to: appointment.patient.email,
				subject: "Your Appointment Invoice - WellOra",
				text: "Thank you for booking an appointment. Please find your invoice attached.",
				attachments: [
					{
						filename: "invoice.pdf",
						content: pdfBuffer,
					},
				],
			});
		} catch (emailError) {
			console.error("Failed to send appointment invoice email:", emailError);
		}

		return {
			redirectUrl: `${cleanFrontendUrl}/dashboard/my-appointments?status=success`,
		};
	}

	if (callbackStatus === "cancel") {
		await prisma.payment
			.update({
				where: { bkashPaymentId: paymentId },
				data: {
					status: PaymentStatus.CANCELLED,
					gatewayResponse: executedPaymentResult,
				},
			})
			.catch(() => {});

		return {
			executedPaymentResult,
			redirectUrl: `${cleanFrontendUrl}/dashboard/my-appointments?status=cancel`,
		};
	}

	await prisma.payment
		.update({
			where: { bkashPaymentId: paymentId },
			data: {
				status: PaymentStatus.FAILED,
				gatewayResponse: executedPaymentResult,
			},
		})
		.catch(() => {});

	return {
		executedPaymentResult,
		redirectUrl: `${cleanFrontendUrl}/dashboard/my-appointments?status=failure`,
	};
};

const cancelAppointment = async (
	payload: ICancelAppointmentPayload,
	user: RequestUser,
) => {
	const existingAppointment = await prisma.appointment.findUnique({
		where: {
			id: payload.appointmentId,
			patient: user.role === Role.PATIENT ? { email: user.email } : undefined,
		},
		include: {
			payment: true,
			schedule: true,
		},
	});

	if (!existingAppointment) {
		throw new AppError(httpStatus.NOT_FOUND, "Appointment Does Not Exists");
	}

	if (
		existingAppointment.status === "ONGOING" ||
		existingAppointment.status === "COMPLETED"
	) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Appointment Ongoing or Completed",
		);
	}

	if (existingAppointment.status === "CANCELLED") {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Appointment Already Cancelled",
		);
	}

	const now = new Date();
	const refundCutOffTime = subHours(
		existingAppointment.schedule.startDateTime,
		1,
	);

	const isEligibleForRefund =
		existingAppointment.payment?.status === PaymentStatus.PAID &&
		Boolean(existingAppointment.payment?.bkashPaymentId) &&
		Boolean(existingAppointment.payment?.bkashTrxId) &&
		isBefore(now, refundCutOffTime);

	// Execute bKash refund outside DB transaction if eligible
	let bkashRefundPaymentResult: Record<string, any> | null = null;

	if (isEligibleForRefund) {
		const bkashIdToken = await getBkashIdToken();

		if (!bkashIdToken) {
			throw new AppError(
				httpStatus.BAD_GATEWAY,
				"No Bkash Access Token Found!",
			);
		}

		const bkashRefundPaymentResponse = await fetch(
			`${config.bkash_base_url}/tokenized/checkout/payment/refund`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
					Authorization: bkashIdToken,
					"X-App-Key": config.bkash_app_key,
				},
				body: JSON.stringify({
					paymentID: existingAppointment.payment?.bkashPaymentId,
					trxID: existingAppointment.payment?.bkashTrxId,
					amount: existingAppointment.payment?.amount.toString(),
					sku: "Appointment Cancellation",
					reason: "Patient Cancelled The Appointment",
				}),
			},
		);

		bkashRefundPaymentResult = await bkashRefundPaymentResponse.json();
	}

	return prisma.$transaction(async (tx) => {
		const updatedAppointment = await tx.appointment.update({
			where: {
				id: existingAppointment.id,
			},
			data: {
				status: AppointmentStatus.CANCELLED,
			},
		});

		if (existingAppointment.payment?.status === PaymentStatus.PAID) {
			await tx.schedule.update({
				where: { id: existingAppointment.schedule.id },
				data: { availableSlots: { increment: 1 } },
			});
		}

		if (isEligibleForRefund && bkashRefundPaymentResult) {
			await tx.payment.update({
				where: {
					appointmentId: existingAppointment.id,
				},
				data: {
					refundTrxId: bkashRefundPaymentResult.refundTrxID,
					refundedAt: bkashRefundPaymentResult.completedTime
						? new Date(bkashRefundPaymentResult.completedTime)
						: new Date(),
					refundAmount: bkashRefundPaymentResult.amount,
					refundReason: "Patient Cancelled The Appointment",
					status: PaymentStatus.REFUNDED,
					gatewayResponse: bkashRefundPaymentResult,
				},
			});
		}

		const newPaymentInfo = await tx.payment.findUnique({
			where: {
				appointmentId: existingAppointment.id,
			},
		});

		return {
			appointment: updatedAppointment,
			payment: newPaymentInfo,
		};
	});
};

// DOCTOR ONLY CONFIRMED => ONGOING => COMPLETED
const updateAppointmentStatus = async (
	appointmentId: string,
	payload: IUpdateAppointmentStatusPayload,
	user: RequestUser,
) => {
	const doctor = await prisma.doctor.findUnique({
		where: { userId: user.userId },
	});

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
	}

	const appointment = await prisma.appointment.findUnique({
		where: { id: appointmentId, doctorId: doctor.id },
	});

	if (!appointment) {
		throw new AppError(httpStatus.NOT_FOUND, "Appointment Not Found");
	}

	if (appointment.status === AppointmentStatus.COMPLETED) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Appointment is already completed",
		);
	}

	if (appointment.status === AppointmentStatus.CANCELLED) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Appointment is already cancelled",
		);
	}
	if (appointment.status === AppointmentStatus.PENDING) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Appointment is Pending. You can change the status after appointment is confirmed",
		);
	}

	if (appointment.status === AppointmentStatus.CONFIRMED) {
		if (payload.status !== "ONGOING") {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Confirmed Appointment Must Be Ongoing At First",
			);
		}

		await prisma.appointment.update({
			where: {
				id: appointment.id,
			},
			data: {
				status: AppointmentStatus.ONGOING,
			},
		});
	}

	if (appointment.status === AppointmentStatus.ONGOING) {
		if (payload.status !== "COMPLETED") {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Ongoing Appointment Must Be Completed.",
			);
		}

		await prisma.appointment.update({
			where: {
				id: appointment.id,
			},
			data: {
				status: AppointmentStatus.COMPLETED,
			},
		});
	}

	const updatedAppointment = await prisma.appointment.findUnique({
		where: {
			id: appointment.id,
		},
	});

	return updatedAppointment;
};

//patient appointments
const getMyAppointments = async (query: IQuery, user: RequestUser) => {
	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc";

	const patient = await prisma.patient.findUnique({
		where: { userId: user.userId },
	});

	if (!patient) {
		throw new AppError(httpStatus.NOT_FOUND, "Patient Profile Not Found");
	}

	const andConditions: AppointmentWhereInput[] = [
		{
			patientId: patient.id,
		},
	];

	const status = getAppointmentStatus(query.status);
	if (status) {
		andConditions.push({ status });
	}

	const appointments = await prisma.appointment.findMany({
		where: { AND: andConditions },
		take: limit,
		skip,
		orderBy: { [sortBy]: sortOrder },
		include: {
			doctor: { select: { id: true, name: true, specialization: true } },
			schedule: true,
			payment: true,
		},
	});

	const total = await prisma.appointment.count({
		where: { AND: andConditions },
	});

	return {
		data: appointments,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	};
};

//doctor appointments
const getDoctorAppointments = async (query: IQuery, user: RequestUser) => {
	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc";

	const doctor = await prisma.doctor.findUnique({
		where: { userId: user.userId },
	});

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
	}

	const andConditions: AppointmentWhereInput[] = [
		{
			doctorId: doctor.id,
		},
	];

	const status = getAppointmentStatus(query.status);
	if (status) {
		andConditions.push({ status });
	}

	const appointments = await prisma.appointment.findMany({
		where: { AND: andConditions },
		take: limit,
		skip,
		orderBy: { [sortBy]: sortOrder },
		include: {
			patient: {
				select: { id: true, name: true, email: true, contactNumber: true },
			},
			schedule: true,
			payment: true,
		},
	});

	const total = await prisma.appointment.count({
		where: { AND: andConditions },
	});

	return {
		data: appointments,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	};
};

//admin super admin
const getAllAppointments = async (query: IQuery) => {
	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc";

	const andConditions: AppointmentWhereInput[] = [];

	const status = getAppointmentStatus(query.status);
	if (status) {
		andConditions.push({ status });
	}

	if (query.doctorId) {
		andConditions.push({ doctorId: query.doctorId });
	}

	if (query.patientId) {
		andConditions.push({ patientId: query.patientId });
	}

	if (query.doctorEmail) {
		andConditions.push({
			doctor: {
				email: query.doctorEmail,
			},
		});
	}
	if (query.patientEmail) {
		andConditions.push({
			patient: {
				email: query.patientEmail,
			},
		});
	}

	const appointments = await prisma.appointment.findMany({
		where: { AND: andConditions },
		take: limit,
		skip,
		orderBy: { [sortBy]: sortOrder },
		include: {
			patient: { select: { id: true, name: true, email: true } },
			doctor: { select: { id: true, name: true, specialization: true } },
			schedule: true,
			payment: true,
		},
	});

	const total = await prisma.appointment.count({
		where: { AND: andConditions },
	});

	return {
		data: appointments,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	};
};

// for all loggedin user
const getSingleAppointment = async (
	appointmentId: string,
	user: RequestUser,
) => {
	const appointment = await prisma.appointment.findUnique({
		where: { id: appointmentId },
		include: {
			patient: { select: { id: true, name: true, email: true, userId: true } },
			doctor: {
				select: { id: true, name: true, specialization: true, userId: true },
			},
			schedule: true,
			payment: true,
		},
	});

	if (!appointment) {
		throw new AppError(httpStatus.NOT_FOUND, "Appointment Not Found");
	}

	if (user.role === Role.PATIENT) {
		if (appointment.patient.userId !== user.userId) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You Are Not Allowed To View This Appointment",
			);
		}
	}
	if (user.role === Role.DOCTOR) {
		if (appointment.doctor.userId !== user.userId) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You Are Not Allowed To View This Appointment",
			);
		}
	}

	return appointment;
};

export const AppointmentServices = {
	bookAppointment,
	payAppointment,
	bookAppointmentCallback,
	cancelAppointment,
	updateAppointmentStatus,
	getMyAppointments,
	getDoctorAppointments,
	getAllAppointments,
	getSingleAppointment,
};