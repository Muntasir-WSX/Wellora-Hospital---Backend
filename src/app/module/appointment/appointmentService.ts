import { addMinutes, isBefore, subHours } from "date-fns";
import httpStatus from "http-status";
import PDFDocument from "pdfkit";
import {
	AppointmentStatus,
	PaymentGateway,
	PaymentStatus,
	Role,
	ScheduleStatus,
} from "../../../generated/prisma/enums.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { AppointmentWhereInput } from "../../../generated/prisma/models.js";
import config from "../../config/index.js";
import { IQuery } from "../../interfaces/index.js";
import {
	createSslcommerzSession,
	createSslcommerzTransactionId,
	requestSslcommerzRefund,
	validateSslcommerzPayment,
} from "../../lib/sslcommerz.js";
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

const getSslcommerzCallbackUrls = () => {
	const cleanBackendUrl = (config.backend_url || "")
		.trim()
		.replace(/[\r\n]/g, "")
		.replace(/\/+$/, "");

	try {
		const parsedUrl = new URL(cleanBackendUrl);
		if (
			parsedUrl.protocol !== "https:" ||
			parsedUrl.username ||
			parsedUrl.password ||
			parsedUrl.search ||
			parsedUrl.hash
		) {
			throw new Error("Invalid backend URL");
		}
	} catch {
		throw new AppError(
			httpStatus.INTERNAL_SERVER_ERROR,
			"BACKEND_URL must be a valid public HTTPS URL for SSLCOMMERZ callbacks",
		);
	}

	const apiBaseUrl = `${cleanBackendUrl}/api/v1`;
	return {
		success: `${apiBaseUrl}/appointment/book-appointment/payment/callback`,
		fail: `${apiBaseUrl}/appointment/book-appointment/payment/callback`,
		cancel: `${apiBaseUrl}/appointment/book-appointment/payment/callback`,
		ipn: `${apiBaseUrl}/appointment/payment/ipn`,
	};
};

const createAppointmentPaymentSession = async ({
	appointmentId,
	amount,
	patient,
}: {
	appointmentId: string;
	amount: string;
	patient: { name: string; email: string; contactNumber: string | null; address: string | null };
}) => {
	if (!patient.contactNumber?.trim()) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Please add a contact number to your patient profile before paying",
		);
	}

	const callbackUrls = getSslcommerzCallbackUrls();
	const transactionId = createSslcommerzTransactionId();
	const session = await createSslcommerzSession({
		total_amount: amount,
		currency: "BDT",
		tran_id: transactionId,
		success_url: callbackUrls.success,
		fail_url: callbackUrls.fail,
		cancel_url: callbackUrls.cancel,
		ipn_url: callbackUrls.ipn,
		product_name: "Doctor Consultation",
		product_category: "Healthcare",
		product_profile: "healthcare",
		cus_name: patient.name.slice(0, 50),
		cus_email: patient.email.slice(0, 50),
		cus_add1: (patient.address?.trim() || "Not provided").slice(0, 50),
		cus_city: "Dhaka",
		cus_country: "Bangladesh",
		cus_postcode: "1200",
		cus_phone: patient.contactNumber.trim().slice(0, 20),
		shipping_method: "NO",
		num_of_item: "1",
		value_a: appointmentId,
	});

	return { session, transactionId };
};

const bookAppointment = async (
	payload: IBookAppointmentPayload,
	user: RequestUser,
) => {
	// 1. Fast DB validation & PENDING appointment creation
	const { appointment, amount, patient } = await prisma.$transaction(async (tx) => {
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

		return { appointment: createdAppointment, amount: feeAmount, patient };
	});

	// 2. Initiate SSLCOMMERZ payment outside the DB transaction
	try {
		const { session, transactionId } = await createAppointmentPaymentSession({
			appointmentId: appointment.id,
			amount,
			patient,
		});

		await prisma.payment.create({
			data: {
				paymentGateway: PaymentGateway.SSLCOMMERZ,
				merchantInvoiceNumber: transactionId,
				appointmentId: appointment.id,
				amount,
				gatewayResponse: session as Prisma.InputJsonValue,
				gatewayPaymentId:
					typeof session.sessionkey === "string" ? session.sessionkey : null,
				payerReference: user.email,
			},
		});

		return {
			paymentUrl: session.GatewayPageURL,
		};
	} catch (error) {
		// Clean up the orphan PENDING appointment if checkout initialization fails.
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
			patient: true,
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
	const { session, transactionId } = await createAppointmentPaymentSession({
		appointmentId: existingAppointment.id,
		amount,
		patient: existingAppointment.patient,
	});

	await prisma.payment.upsert({
		where: {
			appointmentId: existingAppointment.id,
		},
		update: {
			status: PaymentStatus.UNPAID,
			paymentGateway: PaymentGateway.SSLCOMMERZ,
			merchantInvoiceNumber: transactionId,
			amount,
			gatewayResponse: session as Prisma.InputJsonValue,
			gatewayPaymentId:
				typeof session.sessionkey === "string" ? session.sessionkey : null,
			gatewayTransactionId: null,
			paidAt: null,
		},
		create: {
			paymentGateway: PaymentGateway.SSLCOMMERZ,
			merchantInvoiceNumber: transactionId,
			appointmentId: existingAppointment.id,
			amount,
			gatewayResponse: session as Prisma.InputJsonValue,
			gatewayPaymentId:
				typeof session.sessionkey === "string" ? session.sessionkey : null,
			payerReference: user.email,
		},
	});

	return {
		paymentUrl: session.GatewayPageURL,
	};
};

const processSslcommerzNotification = async (notification: unknown) => {
	if (!notification || typeof notification !== "object") {
		throw new AppError(httpStatus.BAD_REQUEST, "Invalid payment notification");
	}

	const body = notification as Record<string, unknown>;
	const transactionId =
		typeof body.tran_id === "string" ? body.tran_id : undefined;
	const status = typeof body.status === "string" ? body.status.toUpperCase() : "";

	if (!transactionId) {
		throw new AppError(httpStatus.BAD_REQUEST, "Payment transaction ID missing");
	}

	const payment = await prisma.payment.findUnique({
		where: { merchantInvoiceNumber: transactionId },
	});

	if (!payment) {
		throw new AppError(httpStatus.NOT_FOUND, "Payment Not Found");
	}

	if (["FAILED", "FAIL", "INVALID"].includes(status)) {
		await prisma.payment.updateMany({
			where: { id: payment.id, status: PaymentStatus.UNPAID },
			data: {
				status: PaymentStatus.FAILED,
				gatewayResponse: {
					status,
					tran_id: transactionId,
				} as Prisma.InputJsonValue,
			},
		});
		return "failure" as const;
	}

	if (["CANCELLED", "CANCELED"].includes(status)) {
		await prisma.payment.updateMany({
			where: { id: payment.id, status: PaymentStatus.UNPAID },
			data: {
				status: PaymentStatus.CANCELLED,
				gatewayResponse: {
					status,
					tran_id: transactionId,
				} as Prisma.InputJsonValue,
			},
		});
		return "cancel" as const;
	}

	if (!["VALID", "VALIDATED", "SUCCESS"].includes(status)) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Unsupported SSLCOMMERZ payment status",
		);
	}

	const validationId =
		typeof body.val_id === "string" ? body.val_id : undefined;
	if (!validationId) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"SSLCOMMERZ validation ID missing",
		);
	}

	const validation = await validateSslcommerzPayment(validationId);
	const validationStatus =
		typeof validation.status === "string"
			? validation.status.toUpperCase()
			: "";
	const validatedTransactionId =
		typeof validation.tran_id === "string" ? validation.tran_id : "";
	const bankTransactionId =
		typeof validation.bank_tran_id === "string"
			? validation.bank_tran_id
			: "";
	const validatedAmount = Number(validation.amount);
	const expectedAmount = Number(payment.amount);
	const validatedCurrency =
		typeof validation.currency === "string"
			? validation.currency.toUpperCase()
			: "";

	if (
		!["VALID", "VALIDATED"].includes(validationStatus) ||
		validatedTransactionId !== transactionId ||
		!bankTransactionId ||
		!Number.isFinite(validatedAmount) ||
		validatedAmount.toFixed(2) !== expectedAmount.toFixed(2) ||
		validatedCurrency !== payment.currency.toUpperCase()
	) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"SSLCOMMERZ payment details could not be verified",
		);
	}

	const gatewayResponse = {
		val_id: validationId,
		tran_id: validatedTransactionId,
		bank_tran_id: bankTransactionId,
		status: validationStatus,
		amount: validatedAmount,
		currency: validatedCurrency,
		validated_on:
			typeof validation.validated_on === "string"
				? validation.validated_on
				: null,
	} as Prisma.InputJsonValue;

	const confirmedData = await prisma.$transaction(
		async (tx) => {
			const currentPayment = await tx.payment.findUnique({
				where: { id: payment.id },
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
			const appointment = currentPayment?.appointment;

			if (!currentPayment || !appointment) {
				throw new AppError(
					httpStatus.NOT_FOUND,
					"Payment or appointment not found",
				);
			}

			if (currentPayment.paymentGateway !== PaymentGateway.SSLCOMMERZ) {
				throw new AppError(
					httpStatus.BAD_REQUEST,
					"Payment gateway does not match the notification",
				);
			}

			if (currentPayment.status === PaymentStatus.PAID) {
				return {
					appointment,
					serialNumber: appointment.serialNumber ?? 0,
					joiningTime: appointment.joiningTime ?? appointment.schedule.startDateTime,
					shouldSendInvoice: false,
				};
			}

			if (currentPayment.status !== PaymentStatus.UNPAID) {
				throw new AppError(
					httpStatus.CONFLICT,
					"Payment is no longer awaiting confirmation",
				);
			}

			const claimedPayment = await tx.payment.updateMany({
				where: {
					id: currentPayment.id,
					status: PaymentStatus.UNPAID,
				},
				data: {
					status: PaymentStatus.PAID,
					gatewayPaymentId: validationId,
					gatewayTransactionId: bankTransactionId,
					paidAt: new Date(),
					gatewayResponse,
				},
			});

			if (claimedPayment.count !== 1) {
				const latestAppointment = await tx.appointment.findUnique({
					where: { id: appointment.id },
					include: {
						schedule: true,
						patient: true,
						doctor: true,
					},
				});
				if (!latestAppointment) {
					throw new AppError(httpStatus.NOT_FOUND, "Appointment Not Found");
				}
				return {
					appointment: latestAppointment,
					serialNumber: latestAppointment.serialNumber ?? 0,
					joiningTime:
						latestAppointment.joiningTime ??
						latestAppointment.schedule.startDateTime,
					shouldSendInvoice: false,
				};
			}

			const reservedSlot = await tx.schedule.updateMany({
				where: {
					id: appointment.schedule.id,
					availableSlots: { gt: 0 },
				},
				data: { availableSlots: { decrement: 1 } },
			});

			if (reservedSlot.count !== 1) {
				throw new AppError(
					httpStatus.CONFLICT,
					"No appointment slots are available",
				);
			}

			const updatedSchedule = await tx.schedule.findUniqueOrThrow({
				where: { id: appointment.schedule.id },
			});
			const serialNumber =
				updatedSchedule.totalSlots - updatedSchedule.availableSlots;
			const joiningTime = addMinutes(
				updatedSchedule.startDateTime,
				(serialNumber - 1) * 20,
			);

			const updatedAppointment = await tx.appointment.update({
				where: { id: appointment.id },
				data: {
					status: AppointmentStatus.CONFIRMED,
					joiningTime,
					serialNumber,
				},
				include: {
					schedule: true,
					patient: true,
					doctor: true,
				},
			});

			return {
				appointment: updatedAppointment,
				serialNumber,
				joiningTime,
				shouldSendInvoice: true,
			};
		},
		{
			maxWait: 10000,
			timeout: 20000,
		},
	);

	if (confirmedData.shouldSendInvoice) {
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
				.text(`Patient Name: ${appointment.patient.name}`);
			pdfDocument.text(`Patient Email: ${appointment.patient.email}`);
			pdfDocument.moveDown();

			pdfDocument.text(`Doctor Name: ${appointment.doctor.name}`);
			pdfDocument.text(
				`Specialization: ${appointment.doctor.specialization}`,
			);
			pdfDocument.moveDown();

			pdfDocument.text(
				`Appointment Date: ${appointment.schedule.startDateTime.toDateString()}`,
			);
			pdfDocument.text(`Your Joining Time: ${joiningTime.toString()}`);
			pdfDocument.text(`Your Serial Number: ${serialNumber}`);
			pdfDocument.text(`Meeting Link: ${appointment.schedule.meetingLink}`);
			pdfDocument.moveDown();

			pdfDocument.text(`Amount Paid: ${validatedAmount.toFixed(2)} BDT`);
			pdfDocument.text("Payment Method: SSLCOMMERZ");
			pdfDocument.text(`Transaction Id: ${bankTransactionId}`);
			pdfDocument.text(`Paid At: ${new Date().toISOString()}`);
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
	}

	return "success" as const;
};

const bookAppointmentCallback = async (notification: unknown) => {
	const callbackStatus = await processSslcommerzNotification(notification);
	const cleanFrontendUrl = (config.frontend_url || "http://localhost:3000")
		.trim()
		.replace(/[\r\n]/g, "")
		.replace(/\/+$/, "");

	return {
		redirectUrl: `${cleanFrontendUrl}/patient/appointments?status=${callbackStatus}`,
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
		Boolean(existingAppointment.payment?.gatewayTransactionId) &&
		isBefore(now, refundCutOffTime);

	let sslcommerzRefundResult: Record<string, unknown> | null = null;

	if (isEligibleForRefund) {
		const bankTransactionId =
			existingAppointment.payment?.gatewayTransactionId;
		if (!bankTransactionId || !existingAppointment.payment) {
			throw new AppError(
				httpStatus.BAD_GATEWAY,
				"SSLCOMMERZ transaction details are missing for the refund",
			);
		}

		const refundTransactionId = `RF${existingAppointment.id
			.replace(/-/g, "")
			.slice(0, 28)}`;
		sslcommerzRefundResult = await requestSslcommerzRefund(
			bankTransactionId,
			refundTransactionId,
			existingAppointment.payment.amount.toString(),
			"Patient cancelled the appointment",
		);

		const refundStatus =
			typeof sslcommerzRefundResult.status === "string"
				? sslcommerzRefundResult.status.toLowerCase()
				: "";
		if (!["success", "processing"].includes(refundStatus)) {
			console.error("SSLCOMMERZ refund request was rejected", {
				status: refundStatus,
				errorReason: sslcommerzRefundResult.errorReason,
			});
			throw new AppError(
				httpStatus.BAD_GATEWAY,
				"SSLCOMMERZ could not initiate the refund",
			);
		}
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

		if (isEligibleForRefund && sslcommerzRefundResult) {
			const refundReferenceId =
				typeof sslcommerzRefundResult.refund_ref_id === "string"
					? sslcommerzRefundResult.refund_ref_id
					: null;
			await tx.payment.update({
				where: {
					appointmentId: existingAppointment.id,
				},
				data: {
					gatewayRefundId: refundReferenceId,
					refundedAt: null,
					refundAmount: existingAppointment.payment?.amount,
					refundReason: "Patient Cancelled The Appointment",
					status: PaymentStatus.REFUND_PENDING,
					gatewayResponse: sslcommerzRefundResult as Prisma.InputJsonValue,
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
	processSslcommerzNotification,
	cancelAppointment,
	updateAppointmentStatus,
	getMyAppointments,
	getDoctorAppointments,
	getAllAppointments,
	getSingleAppointment,
};
