import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { Prisma } from "../../generated/prisma/client.js";
import config from "../config/index.js";
import { AppError } from "../utils/AppError.js";

export const globalErrorHandler = async (
	err: unknown,
	_req: Request,
	res: Response,
	_next: NextFunction,
) => {
	if (config.node_env === "development") {
		console.log("Error from Global Error Handler", err);
	}

	let statusCode: number = httpStatus.INTERNAL_SERVER_ERROR;
	let errorMessage =
		err instanceof Error ? err.message : "Internal Server Error";
	const errorName = err instanceof Error ? err.name : "Internal Server Error";
	if (err instanceof AppError) {
		statusCode = err.statusCode;
	}
	// let errorDetails = err.stack

	if (err instanceof Prisma.PrismaClientValidationError) {
		statusCode = httpStatus.BAD_REQUEST;
		errorMessage = "You have provided incorrect field type or missing fields";
	} else if (err instanceof Prisma.PrismaClientKnownRequestError) {
		if (err.code === "P2002") {
			(statusCode = httpStatus.BAD_REQUEST),
				(errorMessage = "Duplicate Key Error");
		} else if (err.code === "P2003") {
			(statusCode = httpStatus.BAD_REQUEST),
				(errorMessage = "Foreign key constraint failed");
		} else if (err.code === "P2025") {
			(statusCode = httpStatus.BAD_REQUEST),
				(errorMessage =
					"An operation failed because it depends on one or more records that were required but not found.");
		}
	} else if (err instanceof Prisma.PrismaClientInitializationError) {
		if (err.errorCode === "P1000") {
			statusCode = httpStatus.UNAUTHORIZED;
			errorMessage =
				"Authentication failed against database server. Please Check Your Credentials";
		} else if (err.errorCode === "P1001") {
			statusCode = httpStatus.BAD_REQUEST;
			errorMessage = "Can't reach database server";
		}
	} else if (err instanceof Prisma.PrismaClientUnknownRequestError) {
		statusCode = httpStatus.INTERNAL_SERVER_ERROR;
		errorMessage = "Error occurred during query execution";
	} else if (err instanceof Error) {
		errorMessage = err.message;
	}

	const isOperationalError =
		err instanceof AppError ||
		err instanceof Prisma.PrismaClientValidationError ||
		err instanceof Prisma.PrismaClientKnownRequestError ||
		err instanceof Prisma.PrismaClientInitializationError;
	const isDev = config.node_env === "development";

	res.status(statusCode).json({
		success: false,
		statusCode,
		name: isDev || isOperationalError ? errorName : "Internal Server Error",
		message:
			isDev || isOperationalError || statusCode < 500
				? errorMessage
				: "Internal Server Error",
		error: isDev ? err : undefined,
		stack: isDev && err instanceof Error ? err.stack : undefined,
	});
};
