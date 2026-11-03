import type { Request, Response } from "express";
import app from "../src/app.js";
import { redisClient } from "../src/app/lib/redis.js";

const handler = async (req: Request, res: Response) => {
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
