import httpStatus from "http-status";
import { Role } from "../../../generated/prisma/enums.js";
import { PaymentWhereInput } from "../../../generated/prisma/models.js";
import { IQuery } from "../../interfaces/index.js";
import { prisma } from "../../lib/prisma.js";
import { RequestUser } from "../../middleware/checkAuth.js";
import { AppError } from "../../utils/AppError.js";


const getMyPayments = async (query : IQuery, user : RequestUser) => {

    const limit = query.limit ? Number(query.limit) : 10;
    const page = query.page ? Number(query.page) : 1;
    const skip = (page - 1) * limit;
    const sortBy = query.sortBy ? query.sortBy : "createdAt";
    const sortOrder = query.sortOrder ? query.sortOrder : "desc"

    const patient = await prisma.patient.findUnique({
        where: { userId: user.userId },
    });

    if (!patient) {
        throw new AppError(httpStatus.NOT_FOUND, "Patient Profile Not Found");
    }

    const andConditions : PaymentWhereInput[] = [
        {
            appointment: { patientId: patient.id }
        }
    ]

    const payments = await prisma.payment.findMany({
        where: { AND : andConditions },
        take: limit,
        skip,
        orderBy: { [sortBy] : sortOrder },
        include: {
            appointment: {
                include: {
                    doctor: { select: { id: true, name: true, specialization: true } },
                    schedule: true,
                },
            },
        },
    });

    const total = await prisma.payment.count({
        where: { AND : andConditions },
    });

    return {
        data: payments,
        meta: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };


}

const getAllPayments = async (query: IQuery) => {
    const limit = query.limit ? Number(query.limit) : 10;
    const page = query.page ? Number(query.page) : 1;
    const skip = (page - 1) * limit;
    const sortBy = query.sortBy ? query.sortBy : "createdAt";
    const sortOrder = query.sortOrder ? query.sortOrder : "desc"

    const andConditions: PaymentWhereInput[] = []

    if(query.patientEmail) {
        andConditions.push({
          status: query.status as any,
        })
    }

    const payments = await prisma.payment.findMany({
        where: { AND: andConditions },
        take: limit,
        skip,
        orderBy: { [sortBy]: sortOrder },
        include: {
            appointment: {
                include: {
                    doctor: { select: { id: true, name: true, specialization: true } },
                    patient: { select: { id: true, name: true, email: true, userId: true } },
                    schedule: true,
                },
            },
        },
    });

    const total = await prisma.payment.count({
        where: { AND: andConditions },
    });

    return {
        data: payments,
        meta: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };

}

const getSinglePayment = async (paymentId: string, user: RequestUser) => {
    const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: {
            appointment: {
                include: {
                    patient: {
                        select: { id: true, name: true, email: true, userId: true },
                    },
                    doctor: { select: { id: true, name: true, specialization: true } },
                    schedule: true,
                },
            },
        },
    });

    if (!payment) {
        throw new AppError(httpStatus.NOT_FOUND, "Payment Not Found");
    }

    if (user.role === Role.PATIENT) {
        if (payment.appointment.patient.userId !== user.userId) {
            throw new AppError(
                httpStatus.FORBIDDEN,
                "You Are Not Allowed To View This Payment",
            );
        }
    }

    if (user.role === Role.DOCTOR) {
        if (payment.appointment.doctor.userId !== user.userId) {
            throw new AppError(
                httpStatus.FORBIDDEN,
                "You Are Not Allowed To View This Payment",
            );
        }
    }

    return payment
}

const getDoctorPayments = async (query: IQuery, user: RequestUser) => {
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

    const andConditions: PaymentWhereInput[] = [
        {
            appointment: { doctorId: doctor.id },
        },
    ];

    const payments = await prisma.payment.findMany({
        where: { AND: andConditions },
        take: limit,
        skip,
        orderBy: { [sortBy]: sortOrder },
        include: {
            appointment: {
                include: {
                    doctor: { select: { id: true, name: true, specialization: true, userId: true } },
                    patient: { select: { id: true, name: true, email: true, userId: true } },
                    schedule: true,
                },
            },
        },
    });

    const total = await prisma.payment.count({
        where: { AND: andConditions },
    });

    return {
        data: payments,
        meta: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
};



export const PaymentServices = {
    getAllPayments,
    getMyPayments,
    getSinglePayment,
    getDoctorPayments,
}