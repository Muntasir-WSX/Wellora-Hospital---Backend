import type { IncomingMessage, ServerResponse } from "node:http";
import {
	DoctorVerificationStatus,
	Role,
} from "../../src/generated/prisma/enums";
import { prisma } from "../../src/app/lib/prisma";

const handler = async (req: IncomingMessage, res: ServerResponse) => {
	if (req.method !== "GET") {
		res.statusCode = 405;
		res.end("Method Not Allowed");
		return;
	}

	const authorization = req.headers.authorization;
	if (
		!process.env.CRON_SECRET ||
		authorization !== `Bearer ${process.env.CRON_SECRET}`
	) {
		res.statusCode = 401;
		res.end("Unauthorized");
		return;
	}

	try {
		const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
		const deletedDoctors = await prisma.user.deleteMany({
			where: {
				role: Role.DOCTOR,
				emailVerified: false,
				createdAt: { lt: oneHourAgo },
				doctor: {
					verificationStatus: DoctorVerificationStatus.PENDING,
				},
			},
		});

		res.setHeader("Content-Type", "application/json");
		res.statusCode = 200;
		res.end(JSON.stringify({ success: true, deleted: deletedDoctors.count }));
	} catch (error) {
		console.error("Cron Error: Failed to delete unverified doctors", error);
		res.statusCode = 500;
		res.end(JSON.stringify({ success: false, message: "Cron job failed" }));
	}
};

export default handler;
