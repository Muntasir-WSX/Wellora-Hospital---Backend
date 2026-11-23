import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { auth } from "../../middleware/checkAuth.js";
import { PaymentController } from "./payments.controller.js";

const router = Router();

router.get("/my-payments", auth(Role.PATIENT), PaymentController.getMyPayments);
router.get("/doctor-payments", auth(Role.DOCTOR), PaymentController.getDoctorPayments);
router.get("/:paymentId",auth(Role.PATIENT, Role.ADMIN, Role.SUPER_ADMIN),PaymentController.getSinglePayment,);

router.get("/all-payments", auth(Role.ADMIN, Role.SUPER_ADMIN), PaymentController.getAllPayments);

export const PaymentRoutes = router;
