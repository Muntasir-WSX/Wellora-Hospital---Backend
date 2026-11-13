import type { Request, Response } from "express";
import app from "../src/app.js";
import { redisClient } from "../src/app/lib/redis.js";
import {
	seedAdmin,
	seedModerator,
} from "../src/app/utils/seed.js";

let seedPromise: Promise<void> | undefined;

const ensureSeeded = () => {
	if (!seedPromise) {
		seedPromise = (async () => {
			await seedAdmin();
			await seedModerator();
		})();
	}

	return seedPromise;
};

const handler = async (req: Request, res: Response) => {
	await ensureSeeded();

	if (!redisClient.isOpen) {
		try {
			await redisClient.connect();
		} catch (error) {
			console.warn("Redis unavailable for this invocation.", error);
		}
	}

	return app(req, res);
};

export default handler;
