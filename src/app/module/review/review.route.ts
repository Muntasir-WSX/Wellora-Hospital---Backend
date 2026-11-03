import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { ReviewController } from "./review.controller";
import { CreateReviewSchema } from "./review.validation";

const router = Router();

router.post(
	"/",
	auth(Role.PATIENT),
	validateRequest(CreateReviewSchema),
	ReviewController.createReview,
);
router.get("/doctor/:doctorId", ReviewController.getDoctorReviews);

export const ReviewRoutes = router;
