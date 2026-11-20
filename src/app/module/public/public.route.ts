import { Router, type Request, type Response } from "express";
import httpStatus from "http-status";
import { Role } from "../../../generated/prisma/enums.js";
import type { IQuery } from "../../interfaces/index.js";
import { auth } from "../../middleware/checkAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { BlogController } from "./blog.controller.js";
import { CreateBlogZodSchema, UpdateBlogZodSchema } from "./blog.validation.js";
import { NewsletterServices } from "./newsletter.service.js";
import { SubscribeNewsletterZodSchema } from "./newsletter.validation.js";
import { upload } from "../../lib/multer.js";

const router = Router();

router.get(
	"/blogs/admin/all",
	auth(Role.ADMIN, Role.SUPER_ADMIN),
	BlogController.getAllBlogsForAdmin,
);
router.get("/blogs", BlogController.getPublicBlogs);
router.get("/blogs/:slug", BlogController.getSingleBlog);
router.post(
	"/newsletter/subscribe",
	validateRequest(SubscribeNewsletterZodSchema),
	catchAsync(async (req: Request, res: Response) => {
		const data = await NewsletterServices.subscribe(req.body.email);
		sendResponse(res, {
			statusCode: httpStatus.CREATED,
			success: true,
			message: "Subscribed to WellOra newsletter successfully!",
			data,
		});
	}),
);
router.post(
	"/blogs",
	auth(Role.ADMIN, Role.SUPER_ADMIN),
	upload.single("coverImage"),
	validateRequest(CreateBlogZodSchema),
	BlogController.createBlog,
);
router.patch(
	"/blogs/:id",
	auth(Role.ADMIN, Role.SUPER_ADMIN),
	upload.single("coverImage"),
	validateRequest(UpdateBlogZodSchema),
	BlogController.updateBlog,
);
router.delete(
	"/blogs/:id",
	auth(Role.ADMIN, Role.SUPER_ADMIN),
	BlogController.deleteBlog,
);
router.get(
	"/newsletter/subscribers",
	auth(Role.ADMIN, Role.SUPER_ADMIN),
	catchAsync(async (req: Request, res: Response) => {
		const { data, meta } = await NewsletterServices.getSubscribers(
			req.query as IQuery,
		);
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Newsletter subscribers retrieved successfully",
			data,
			meta,
		});
	}),
);

export const PublicRoutes = router;
