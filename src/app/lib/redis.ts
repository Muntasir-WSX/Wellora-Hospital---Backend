import { createClient } from "redis";
import config from "../config";

export const redisClient = createClient({
	username: config.redis_user,
	password: config.redis_password,
	socket: {
		host: config.redis_host,
		port: Number(config.redis_port),
		...(process.env.REDIS_TLS === "true" ? { tls: true as const } : {}),
		reconnectStrategy: (retries) => Math.min(retries * 50, 1000),
	},
});

redisClient.on("error", (error) => {
	console.error("Redis client error:", error);
});

redisClient.on("connect", () => {
	console.log("Redis connected successfully");
});
