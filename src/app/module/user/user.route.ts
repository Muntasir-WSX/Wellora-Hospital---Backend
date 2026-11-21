import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { upload } from "../../lib/multer.js";
import { auth } from "../../middleware/checkAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { UserController } from "./user.controller.js";
import {
	UpdateMyProfileValidationZodSchema,
	UpdateUserStatusZodSchema,
} from "./user.validation.js";

const router = Router();

// Profile Routes
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

// Admin User Management Routes
router.get("/", auth(Role.SUPER_ADMIN, Role.ADMIN), UserController.getAllUsers);
router.patch(
	"/:id/ban",
	auth(Role.SUPER_ADMIN, Role.ADMIN),
	validateRequest(UpdateUserStatusZodSchema),
	UserController.toggleBanUser,
);
router.delete(
	"/:id",
	auth(Role.SUPER_ADMIN, Role.ADMIN),
	UserController.deleteUser,
);

export const UserRoutes = router;
