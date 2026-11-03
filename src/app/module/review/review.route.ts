import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { auth } from "../../middleware/checkAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { ReviewController } from "./review.controller.js";
import { CreateReviewSchema } from "./review.validation.js";

const router = Router();

router.post(
	"/",
	auth(Role.PATIENT),
	validateRequest(CreateReviewSchema),
	ReviewController.createReview,
);
router.get("/doctor/:doctorId", ReviewController.getDoctorReviews);

export const ReviewRoutes = router;
