import { NextFunction, Request, Response, Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { AuthController } from "./auth.controller";
import { PatientValidation, } from "./auth.validation";

const router = Router();

router.post(
	"/register",
	(req : Request, res : Response, next : NextFunction) => {

		try {
			// const payload = req.body ? req.body : {}
			const payload = req.body ?? {}

			const result = PatientValidation.PatientRegistrationZodSchema.safeParse(payload);

			if (!result.success) {
				console.log(result.error);
				console.log(result.error.issues);

				throw new Error(result.error.issues[0].message)
			}

			req.body = result.data

			next()
		} catch (error) {

			next(error)
		}
	},

	validateRequest(PatientValidation.PatientRegistrationZodSchema),
	AuthController.registerPatient,
);
router.post(
	"/verify-email",
	validateRequest(PatientValidation.PatientEmailVerifyZodSchema),
	AuthController.verifyPatientEmail,
);
router.post(
	"/login",
	validateRequest(PatientValidation.LoginZodSchema),
	AuthController.loginUser,
);
router.get(
	"/me",
	auth(Role.ADMIN, Role.DOCTOR, Role.PATIENT, Role.SUPER_ADMIN),
	// validateRequest
	AuthController.getMe,
);
router.post("/refresh-token", AuthController.refreshToken);
router.post("/google", AuthController.googleLogin);
router.post(
	"/forgot-password",
	validateRequest(PatientValidation.ForgotPasswordZodSchema),
	AuthController.forgotPassword,
);
router.post(
	"/reset-password",
	validateRequest(PatientValidation.ResetPasswordZodSchema),
	AuthController.resetPassword,
);
export const AuthRoutes = router;
