import type { UploadApiResponse } from "cloudinary";
import httpStatus from "http-status";
import { Role } from "../../../generated/prisma/enums.js";
import type { IQuery } from "../../interfaces/index.js";
import { cloudinary } from "../../lib/cloudinary.js";
import { prisma } from "../../lib/prisma.js";
import type { RequestUser } from "../../middleware/checkAuth.js";
import { AppError } from "../../utils/AppError.js";

type UpdateMyProfilePayload = {
	name?: string;
	contactNumber?: string;
	address?: string;
	gender?: "MALE" | "FEMALE" | "OTHER";
	dateOfBirth?: string;
	bloodGroup?:
		| "A_POSITIVE"
		| "A_NEGATIVE"
		| "B_POSITIVE"
		| "B_NEGATIVE"
		| "AB_POSITIVE"
		| "AB_NEGATIVE"
		| "O_POSITIVE"
		| "O_NEGATIVE";
	qualifications?: string;
	experienceYears?: number;
	consultationFee?: number;
	bio?: string;
};

const getMyProfile = async (user: RequestUser) => {
	const userData = await prisma.user.findUnique({
		where: { id: user.userId },
		omit: { password: true },
		include: {
			doctor: {
				include: { department: { select: { id: true, name: true } } },
			},
			patient: true,
		},
	});

	if (!userData) {
		throw new AppError(httpStatus.NOT_FOUND, "User Not Found");
	}

	return userData;
};

const updateMyProfile = async (
	user: RequestUser,
	payload: UpdateMyProfilePayload,
) => {
	const existingUser = await prisma.user.findUnique({
		where: { id: user.userId },
		include: { doctor: true, patient: true },
	});

	if (!existingUser) {
		throw new AppError(httpStatus.NOT_FOUND, "User Not Found");
	}

	return await prisma.$transaction(async (tx) => {
		await tx.user.update({
			where: { id: user.userId },
			data: {
				...(payload.name !== undefined && { name: payload.name }),
			},
		});
		if (user.role === Role.DOCTOR && existingUser.doctor) {
			await tx.doctor.update({
				where: { userId: user.userId },
				data: {
					...(payload.name !== undefined && { name: payload.name }),
					...(payload.contactNumber !== undefined && {
						contactNumber: payload.contactNumber,
					}),
					...(payload.address !== undefined && { address: payload.address }),
					...(payload.qualifications !== undefined && {
						qualifications: payload.qualifications,
					}),
					...(payload.experienceYears !== undefined && {
						experienceYears: payload.experienceYears,
					}),
					...(payload.consultationFee !== undefined && {
						consultationFee: payload.consultationFee,
					}),
					...(payload.bio !== undefined && { bio: payload.bio }),
				},
			});
		} else if (user.role === Role.PATIENT && existingUser.patient) {
			await tx.patient.update({
				where: { userId: user.userId },
				data: {
					...(payload.name !== undefined && { name: payload.name }),
					...(payload.contactNumber !== undefined && {
						contactNumber: payload.contactNumber,
					}),
					...(payload.address !== undefined && { address: payload.address }),
					...(payload.gender !== undefined && { gender: payload.gender }),
					...(payload.bloodGroup !== undefined && {
						bloodGroup: payload.bloodGroup,
					}),
					...(payload.dateOfBirth !== undefined && {
						dateOfBirth: new Date(payload.dateOfBirth),
					}),
				},
			});
		}

		const updatedUser = await tx.user.findUnique({
			where: { id: user.userId },
			omit: { password: true },
			include: {
				doctor: {
					include: { department: { select: { id: true, name: true } } },
				},
				patient: true,
			},
		});

		if (!updatedUser) {
			throw new AppError(httpStatus.NOT_FOUND, "User Not Found");
		}

		return updatedUser;
	});
};

const uploadProfileImage = async (buffer: Buffer, userId: string) => {
	const currentUser = await prisma.user.findUnique({
		where: { id: userId },
		select: { imagePublicId: true, imageUrl: true },
	});

	const cloudinaryResult = await new Promise<UploadApiResponse>(
		(resolve, reject) => {
			cloudinary.uploader
				.upload_stream(
					{ resource_type: "auto", folder: "wellora/profiles" },
					(error, result) => {
						if (error) return reject(error);
						if (!result)
							return reject(new Error("No result returned from Cloudinary"));
						resolve(result);
					},
				)
				.end(buffer);
		},
	);

	const updatedUser = await prisma.user.update({
		where: { id: userId },
		data: {
			imageUrl: cloudinaryResult.secure_url,
			imagePublicId: cloudinaryResult.public_id,
		},
		omit: { password: true },
	});

	await prisma.doctor.updateMany({
		where: { userId },
		data: { profilePhoto: cloudinaryResult.secure_url },
	});
	if (currentUser?.imagePublicId && currentUser.imageUrl) {
		try {
			await cloudinary.uploader.destroy(currentUser.imagePublicId);
		} catch (error) {
			console.error(
				"Failed to delete previous profile image from Cloudinary:",
				error,
			);
		}
	}

	return updatedUser;
};

const getAllUsers = async (query: IQuery) => {
	const parsedLimit = query.limit ? Number(query.limit) : 12;
	const parsedPage = query.page ? Number(query.page) : 1;
	const limit =
		Number.isFinite(parsedLimit) && parsedLimit > 0
			? Math.min(parsedLimit, 100)
			: 12;
	const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
	const skip = (page - 1) * limit;

	const where: Record<string, unknown> = {};
	where.isDeleted = false;

	if (
		query.role &&
		query.role !== "ALL" &&
		["SUPER_ADMIN", "ADMIN", "DOCTOR", "PATIENT"].includes(query.role)
	) {
		where.role = query.role;
	}

	if (query.status && ["ACTIVE", "BLOCKED", "DELETED"].includes(query.status)) {
		where.status = query.status;
	}

	if (query.searchTerm) {
		where.OR = [
			{ name: { contains: query.searchTerm, mode: "insensitive" } },
			{ email: { contains: query.searchTerm, mode: "insensitive" } },
		];
	}

	const [data, total] = await Promise.all([
		prisma.user.findMany({
			where,
			take: limit,
			skip,
			orderBy: { createdAt: "desc" },
			omit: { password: true },
			include: {
				doctor: {
					select: {
						id: true,
						specialization: true,
						verificationStatus: true,
						department: { select: { name: true } },
					},
				},
				patient: {
					select: { id: true, contactNumber: true },
				},
			},
		}),
		prisma.user.count({ where }),
	]);

	return {
		data,
		meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
	};
};

const toggleBanUser = async (
	adminUser: RequestUser,
	targetUserId: string,
	payload?: { isBanned?: boolean; status?: "ACTIVE" | "BLOCKED" },
) => {
	if (adminUser.userId === targetUserId) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"You cannot ban or unban your own account",
		);
	}

	const targetUser = await prisma.user.findUnique({
		where: { id: targetUserId },
	});

	if (!targetUser) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found");
	}

	if (
		targetUser.role === Role.SUPER_ADMIN &&
		adminUser.role !== Role.SUPER_ADMIN
	) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You cannot modify a Super Admin account",
		);
	}

	const currentStatus = (targetUser as { status?: string }).status;
	const nextStatus =
		payload?.status ??
		(payload?.isBanned !== undefined
			? payload.isBanned
				? "BLOCKED"
				: "ACTIVE"
			: currentStatus === "BLOCKED"
				? "ACTIVE"
				: "BLOCKED");

	return prisma.user.update({
		where: { id: targetUserId },
		data: { status: nextStatus as never },
		omit: { password: true },
	});
};

// Admin: Permanently Delete User
const deleteUser = async (adminUser: RequestUser, targetUserId: string) => {
	if (adminUser.userId === targetUserId) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"You cannot delete your own account",
		);
	}

	const targetUser = await prisma.user.findUnique({
		where: { id: targetUserId },
	});

	if (!targetUser) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found");
	}

	if (
		targetUser.role === Role.SUPER_ADMIN &&
		adminUser.role !== Role.SUPER_ADMIN
	) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You cannot delete a Super Admin account",
		);
	}

	if (targetUser.imagePublicId) {
		await cloudinary.uploader.destroy(targetUser.imagePublicId).catch(() => {});
	}

	await prisma.user.delete({
		where: { id: targetUserId },
	});

	return null;
};

export const UserServices = {
	getMyProfile,
	updateMyProfile,
	uploadProfileImage,
	getAllUsers,
	toggleBanUser,
	deleteUser,
};
