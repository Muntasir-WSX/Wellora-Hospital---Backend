import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { upload } from "../../lib/multer.js";
import { auth } from "../../middleware/checkAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { UserController } from "./user.controller.js";
import { UpdateMyProfileValidationZodSchema } from "./user.validation.js";

const router = Router();

router.patch(
	"/profile-image",
	auth(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.PATIENT),
	upload.single("profileImage"),
	UserController.uploadProfileImage,
);
router.get(
	"/my-profile",
	auth(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.PATIENT),
	UserController.getMyProfile,
);

router.patch(
	"/update-my-profile",
	auth(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.PATIENT),
	validateRequest(UpdateMyProfileValidationZodSchema),
	UserController.updateMyProfile,
);

export const UserRoutes = router;
