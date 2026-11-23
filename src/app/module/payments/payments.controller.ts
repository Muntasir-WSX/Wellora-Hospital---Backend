import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { PaymentServices } from "./payment.service.js";
import type { IQuery } from "../../interfaces/index.js";

const getMyPayments = catchAsync(async (req: Request, res: Response) => {
    const user = req.user!;

    const { data, meta } = await PaymentServices.getMyPayments(req.query as IQuery, user);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Payments Retrieved Successfully",
        data,
        meta,
    });
});

const getAllPayments = catchAsync(async (req: Request, res: Response) => {
    const { data, meta } = await PaymentServices.getAllPayments(req.query as IQuery);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Payments Retrieved Successfully",
        data,
        meta,
    });
});

const getSinglePayment = catchAsync(async (req: Request, res: Response) => {
    const paymentId = req.params.paymentId as string;
    const user = req.user!;

    const result = await PaymentServices.getSinglePayment(paymentId, user);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Payment Retrieved Successfully",
        data: result,
    });
});

const getDoctorPayments = catchAsync(async (req: Request, res: Response) => {
    const user = req.user!;

    const { data, meta } = await PaymentServices.getDoctorPayments(req.query as IQuery, user);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Doctor Payments Retrieved Successfully",
        data,
        meta,
    });
});

export const PaymentController = {
    getMyPayments,
    getAllPayments,
    getSinglePayment,
    getDoctorPayments,
};