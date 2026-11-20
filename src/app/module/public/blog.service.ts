import type { UploadApiResponse } from "cloudinary";
import httpStatus from "http-status";
import type { IQuery } from "../../interfaces/index.js";
import { cloudinary } from "../../lib/cloudinary.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { toSlug } from "../../utils/slug.js";

const uploadBlogCover = (buffer: Buffer): Promise<UploadApiResponse> =>
	new Promise((resolve, reject) => {
		cloudinary.uploader
			.upload_stream(
				{ resource_type: "image", folder: "wellora/blogs" },
				(error, result) => {
					if (error) return reject(error);
					if (!result) return reject(new Error("Cloudinary upload failed"));
					resolve(result);
				},
			)
			.end(buffer);
	});

const createBlog = async (
	authorId: string,
	payload: {
		title: string;
		excerpt?: string;
		content: string;
		category?: string;
		isPublished?: boolean;
	},
	fileBuffer?: Buffer,
) => {
	let coverImageUrl: string | undefined;
	let coverPublicId: string | undefined;

	if (fileBuffer) {
		const uploaded = await uploadBlogCover(fileBuffer);
		coverImageUrl = uploaded.secure_url;
		coverPublicId = uploaded.public_id;
	}

	return prisma.blog.create({
		data: {
			title: payload.title,
			slug: `${toSlug(payload.title)}-${Date.now().toString(36)}`,
			excerpt: payload.excerpt,
			content: payload.content,
			category: payload.category || "Health Tips",
			isPublished: payload.isPublished ?? true,
			coverImageUrl,
			coverPublicId,
			authorId,
		},
		include: {
			author: { select: { id: true, name: true, imageUrl: true } },
		},
	});
};

const getPublicBlogs = async (query: IQuery) => {
	const limit = query.limit ? Number(query.limit) : 9;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const where: { isPublished: true; category?: string; OR?: object[] } = {
		isPublished: true,
	};

	if (query.category && query.category !== "ALL")
		where.category = query.category;
	if (query.searchTerm) {
		where.OR = [
			{ title: { contains: query.searchTerm, mode: "insensitive" } },
			{ excerpt: { contains: query.searchTerm, mode: "insensitive" } },
		];
	}

	const [data, total] = await Promise.all([
		prisma.blog.findMany({
			where,
			take: limit,
			skip,
			orderBy: { createdAt: "desc" },
			include: { author: { select: { id: true, name: true, imageUrl: true } } },
		}),
		prisma.blog.count({ where }),
	]);

	return {
		data,
		meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
	};
};

const getAllBlogsForAdmin = async (query: IQuery) => {
	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const where = query.searchTerm
		? { title: { contains: query.searchTerm, mode: "insensitive" as const } }
		: {};
	const [data, total] = await Promise.all([
		prisma.blog.findMany({
			where,
			take: limit,
			skip,
			orderBy: { createdAt: "desc" },
			include: { author: { select: { id: true, name: true, email: true } } },
		}),
		prisma.blog.count({ where }),
	]);

	return {
		data,
		meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
	};
};

const getSingleBlogBySlug = async (slug: string) => {
	const blog = await prisma.blog.findUnique({
		where: { slug },
		include: { author: { select: { id: true, name: true, imageUrl: true } } },
	});
	if (!blog?.isPublished)
		throw new AppError(httpStatus.NOT_FOUND, "Blog post not found");
	return blog;
};

const updateBlog = async (
	id: string,
	payload: Record<string, unknown>,
	fileBuffer?: Buffer,
) => {
	const existing = await prisma.blog.findUnique({ where: { id } });
	if (!existing)
		throw new AppError(httpStatus.NOT_FOUND, "Blog post not found");

	let coverImageUrl = existing.coverImageUrl;
	let coverPublicId = existing.coverPublicId;
	if (fileBuffer) {
		const uploaded = await uploadBlogCover(fileBuffer);
		coverImageUrl = uploaded.secure_url;
		coverPublicId = uploaded.public_id;
		if (existing.coverPublicId)
			await cloudinary.uploader.destroy(existing.coverPublicId);
	}

	return prisma.blog.update({
		where: { id },
		data: {
			...(typeof payload.title === "string" && { title: payload.title }),
			...(payload.excerpt !== undefined && {
				excerpt: payload.excerpt as string,
			}),
			...(typeof payload.content === "string" && { content: payload.content }),
			...(typeof payload.category === "string" && {
				category: payload.category,
			}),
			...(typeof payload.isPublished === "boolean" && {
				isPublished: payload.isPublished,
			}),
			coverImageUrl,
			coverPublicId,
		},
	});
};

const deleteBlog = async (id: string) => {
	const existing = await prisma.blog.findUnique({ where: { id } });
	if (!existing)
		throw new AppError(httpStatus.NOT_FOUND, "Blog post not found");
	if (existing.coverPublicId)
		await cloudinary.uploader.destroy(existing.coverPublicId);
	await prisma.blog.delete({ where: { id } });
};

export const BlogServices = {
	createBlog,
	getPublicBlogs,
	getAllBlogsForAdmin,
	getSingleBlogBySlug,
	updateBlog,
	deleteBlog,
};
