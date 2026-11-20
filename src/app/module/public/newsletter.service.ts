import httpStatus from "http-status";
import type { IQuery } from "../../interfaces/index.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";

const subscribe = async (email: string) => {
	const normalizedEmail = email.toLowerCase().trim();
	const existing = await prisma.newsletterSubscriber.findUnique({
		where: { email: normalizedEmail },
	});
	if (existing?.isActive)
		throw new AppError(
			httpStatus.CONFLICT,
			"This email is already subscribed to WellOra newsletter",
		);
	if (existing)
		return prisma.newsletterSubscriber.update({
			where: { email: normalizedEmail },
			data: { isActive: true },
		});
	return prisma.newsletterSubscriber.create({
		data: { email: normalizedEmail },
	});
};

const getSubscribers = async (query: IQuery) => {
	const limit = query.limit ? Number(query.limit) : 15;
	const page = query.page ? Number(query.page) : 1;
	const where = query.searchTerm
		? { email: { contains: query.searchTerm, mode: "insensitive" as const } }
		: {};
	const [data, total] = await Promise.all([
		prisma.newsletterSubscriber.findMany({
			where,
			take: limit,
			skip: (page - 1) * limit,
			orderBy: { createdAt: "desc" },
		}),
		prisma.newsletterSubscriber.count({ where }),
	]);
	return {
		data,
		meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
	};
};

export const NewsletterServices = { subscribe, getSubscribers };
