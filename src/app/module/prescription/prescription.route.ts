import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { auth } from "../../middleware/checkAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { PrescriptionController } from "./prescription.controller.js";
import { CreatePrescriptionValidationZodSchema } from "./prescription.validation.js";

const router = Router();

router.post(
    "/create-prescription",
    auth(Role.DOCTOR),
    validateRequest(CreatePrescriptionValidationZodSchema),
    PrescriptionController.createPrescription,
);

router.get(
    "/:appointmentId",
    auth(Role.PATIENT, Role.DOCTOR, Role.ADMIN, Role.SUPER_ADMIN),
    PrescriptionController.getSinglePrescription,
);

export const PrescriptionRoutes = router;