import cookieParser from "cookie-parser";
import cors from "cors";
import express, {
	type Application,
	type NextFunction,
	type Request,
	type Response,
} from "express";
import httpStatus from "http-status";
import config from "./app/config/index.js";
import { getBkashIdToken } from "./app/lib/bkash.js";
import { globalErrorHandler } from "./app/middleware/globalErrorHandler.js";
import { notFound } from "./app/middleware/notFound.js";
import { auth } from "./app/middleware/checkAuth.js";
import { Role } from "./generated/prisma/enums.js";
import { AnalyticsRoutes } from "./app/module/analytics/analytics.route.js";
import { AppointementRoutes } from "./app/module/appointment/appointmentRoute.js";
import { AuthRoutes } from "./app/module/auth/auth.route.js";
import { DoctorRoutes } from "./app/module/doctor/doctor.route.js";
import { DepartmentRoutes } from "./app/module/department/department.route.js";
import { PaymentRoutes } from "./app/module/payments/payment.route.js";
import { PrescriptionRoutes } from "./app/module/prescription/prescription.route.js";
import { ScheduleRoutes } from "./app/module/schedule/schedule.route.js";
import { ReviewRoutes } from "./app/module/review/review.route.js";
import { UserRoutes } from "./app/module/user/user.route.js";

const app: Application = express();

app.use(
	cors({
		origin: config.frontend_url,
		credentials: true,
	}),
);

// Enable URL-encoded form data parsing
app.use(express.urlencoded({ extended: true }));

// Middleware to parse JSON bodies
app.use(express.json());
app.use(cookieParser());

app.use("/api/v1/auth", AuthRoutes);
app.use("/api/v1/user", UserRoutes);
app.use("/api/v1/appointment", AppointementRoutes);
app.use("/api/v1/doctor", DoctorRoutes);
app.use("/api/v1/department", DepartmentRoutes);
app.use("/api/v1/schedule", ScheduleRoutes);
app.use("/api/v1/payment", PaymentRoutes);
app.use("/api/v1/prescription", PrescriptionRoutes);
app.use("/api/v1/analytics", AnalyticsRoutes);
app.use("/api/v1/review", ReviewRoutes);

app.get(
	"/test",
	auth(Role.ADMIN, Role.SUPER_ADMIN),
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const grantIdTokenResult = await getBkashIdToken();

			res.status(httpStatus.OK).json({
				success: true,
				message: "Welcome to PH Healthcare System Backend",
				data: null,
			});
		} catch (error) {
			console.log(error);
			next(error);
		}
	},
);

// Basic route
app.get("/", async (req: Request, res: Response) => {
	res.status(httpStatus.OK).json({
		success: true,
		message: "Welcome to PH Healthcare System Backend",
	});
});

app.use(globalErrorHandler);
app.use(notFound);

export default app;
