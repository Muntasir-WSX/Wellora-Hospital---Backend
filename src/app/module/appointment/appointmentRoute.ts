import { type NextFunction, type Request, type Response, Router } from "express";
import { AppointmentController } from "./appointmentController";

const router = Router();

router.post("/book-appointment", AppointmentController.bookAppointment);

export const AppointmentRoutes = router;
