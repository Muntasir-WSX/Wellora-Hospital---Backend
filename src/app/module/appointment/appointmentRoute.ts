import { type NextFunction, type Request, type Response, Router } from "express";
import { AppointmentController } from "./appointmentController";

const router = Router();

router.post("/book-appointment", AppointmentController.bookAppointment);

router.get("/book-appointment/payment/callback", ()=> {

})

export const AppointmentRoutes = router;
