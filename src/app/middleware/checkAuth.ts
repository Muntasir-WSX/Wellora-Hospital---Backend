import type { NextFunction, Request, Response } from "express";
import type { Role } from "../../generated/prisma/enums.js";
import config from "../config/index.js";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { catchAsync } from "../utils/catchAsync.js";
import { jwtUtils } from "../utils/jwt.js";

declare global {
	namespace Express {
		interface Request {
			user?: {
				email: string;
				name: string;
				userId: string;
				role: Role;
			};
		}
	}
}

export type RequestUser = {
	email: string;
	name: string;
	userId: string;
	role: Role;
};

// auth(Role.ADMIN, Role.USER, Role.Author)
// auth() => ...requiredRoles => [Role.ADMIN, Role.USER, Role.AUTHOR]
export const auth = (...requiredRoles: Role[]) => {
	return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
		const token = req.cookies.accessToken
			? req.cookies.accessToken
			: req.headers.authorization?.startsWith("Bearer ")
				? req.headers.authorization?.split(" ")[1]
				: req.headers.authorization;

		if (!token) {
			throw new AppError(
				401,
				"You are not logged in. Please log in to access this resource.",
			);
		}

		const verifiedToken = jwtUtils.verifyToken(token, config.jwt_access_secret);

		if (!verifiedToken.success) {
			throw new AppError(401, verifiedToken.error);
		}

		const { userId } = verifiedToken.data as { userId?: unknown };

		if (typeof userId !== "string") {
			throw new AppError(401, "Invalid token payload");
		}

		const user = await prisma.user.findUnique({
			where: { id: userId },
		});

		if (!user) {
			throw new AppError(401, "User not found. Please log in again.");
		}

		if (
			user.status === "BLOCKED" ||
			user.status === "DELETED" ||
			user.isDeleted
		) {
			throw new AppError(
				403,
				"Your account has been blocked. Please contact support.",
			);
		}

		if (requiredRoles.length && !requiredRoles.includes(user.role)) {
			throw new AppError(
				403,
				"Forbidden. You don't have permission to access this resource.",
			);
		}

		req.user = {
			email: user.email,
			name: user.name,
			userId: user.id,
			role: user.role,
		};

		next();
	});
};
