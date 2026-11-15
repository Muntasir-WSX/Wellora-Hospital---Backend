import httpStatus from "http-status";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { toSlug } from "../../utils/slug.js";

const generateSlug = (name: string) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const getDepartments = () =>
	prisma.department.findMany({
		orderBy: { name: "asc" },
		include: { _count: { select: { doctors: true } } },
	});

const createDepartment = (data: {
	name: string;
	description?: string;
	imageUrl?: string;
}) => prisma.department.create({ data: { ...data, slug: generateSlug(data.name) } });

const updateDepartment = async (
	id: string,
	data: { name?: string; description?: string; imageUrl?: string },
) => {
	const department = await prisma.department.findUnique({ where: { id } });
	if (!department)
		throw new AppError(httpStatus.NOT_FOUND, "Department Not Found");
	return prisma.department.update({
		where: { id },
		data: {
			...data,
			...(data.name ? { slug: generateSlug(data.name) } : {}),
		},
	});
};

const deleteDepartment = async (id: string) => {
	const department = await prisma.department.findUnique({
		where: { id },
		include: { _count: { select: { doctors: true } } },
	});
	if (!department)
		throw new AppError(httpStatus.NOT_FOUND, "Department Not Found");
	if (department._count.doctors > 0) {
		throw new AppError(httpStatus.CONFLICT, "Department Has Assigned Doctors");
	}
	return prisma.department.delete({ where: { id } });
};

export const DepartmentServices = {
	getDepartments,
	createDepartment,
	updateDepartment,
	deleteDepartment,
};
