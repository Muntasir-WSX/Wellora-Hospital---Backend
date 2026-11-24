import httpStatus from "http-status";
import config from "../config/index.js";
import { AppError } from "../utils/AppError.js";
import { redisClient } from "./redis.js";

const ID_TOKEN_KEY = "bkash:id-token";
const REFRESH_TOKEN_KEY = "bkash:refresh-token";
const TOKEN_CACHE_TTL_SECONDS = 3600;

type BkashTokenResponse = {
	id_token?: string;
	refresh_token?: string;
	statusCode?: string;
	statusMessage?: string;
	msg?: string;
};

const getBkashApiBaseUrl = (): string => {
	const baseUrl = config.bkash_base_url?.trim().replace(/\/+$/, "");

	if (!baseUrl) {
		throw new AppError(
			httpStatus.INTERNAL_SERVER_ERROR,
			"bKash API base URL is not configured",
		);
	}

	try {
		const parsedUrl = new URL(baseUrl);
		if (
			parsedUrl.protocol !== "https:" ||
			parsedUrl.username ||
			parsedUrl.password ||
			parsedUrl.search ||
			parsedUrl.hash
		) {
			throw new Error("Invalid bKash API URL");
		}
	} catch {
		throw new AppError(
			httpStatus.INTERNAL_SERVER_ERROR,
			"bKash API base URL must be a valid HTTPS URL",
		);
	}

	const missingCredentials = [
		["BKASH_USERNAME", config.bkash_username],
		["BKASH_PASSWORD", config.bkash_password],
		["BKASH_APP_KEY", config.bkash_app_key],
		["BKASH_APP_SECRET", config.bkash_app_secret],
	]
		.filter(([, value]) => !value?.trim())
		.map(([name]) => name);

	if (missingCredentials.length > 0) {
		throw new AppError(
			httpStatus.INTERNAL_SERVER_ERROR,
			`Missing bKash configuration: ${missingCredentials.join(", ")}`,
		);
	}

	return baseUrl;
};

const readTokenResponse = async (
	response: Response,
): Promise<BkashTokenResponse> => {
	try {
		const result: unknown = await response.json();
		if (result && typeof result === "object" && !Array.isArray(result)) {
			const body = result as Record<string, unknown>;
			return {
				id_token: typeof body.id_token === "string" ? body.id_token : undefined,
				refresh_token:
					typeof body.refresh_token === "string"
						? body.refresh_token
						: undefined,
				statusCode:
					typeof body.statusCode === "string" ? body.statusCode : undefined,
				statusMessage:
					typeof body.statusMessage === "string"
						? body.statusMessage
						: undefined,
				msg: typeof body.msg === "string" ? body.msg : undefined,
			};
		}
	} catch {
		// Treat malformed or empty provider responses as an authentication failure.
	}

	return {};
};

const getProviderErrorMessage = (
	result: BkashTokenResponse,
	response: Response,
): string =>
	(result.statusMessage || result.msg || response.statusText || "Unknown error")
		.replace(/[\r\n]/g, " ")
		.slice(0, 300);

const cacheTokens = async (result: BkashTokenResponse): Promise<void> => {
	if (result.id_token) {
		await safeRedisSet(ID_TOKEN_KEY, result.id_token, TOKEN_CACHE_TTL_SECONDS);
	}
	if (result.refresh_token) {
		await safeRedisSet(REFRESH_TOKEN_KEY, result.refresh_token, 86400);
	}
};

async function safeRedisGet(key: string): Promise<string | null> {
	try {
		if (!redisClient.isOpen) return null;
		return await redisClient.get(key);
	} catch {
		return null;
	}
}

async function safeRedisTtl(key: string): Promise<number> {
	try {
		if (!redisClient.isOpen) return -2;
		return await redisClient.ttl(key);
	} catch {
		return -2;
	}
}

async function safeRedisSet(
	key: string,
	value: string,
	ttlSeconds: number,
): Promise<void> {
	try {
		if (!redisClient.isOpen) return;
		await redisClient.set(key, value, { EX: ttlSeconds });
	} catch {
		// Ignore Redis cache write failure so bKash checkout still works
	}
}

export const getBkashIdToken = async (): Promise<string> => {
	const baseUrl = getBkashApiBaseUrl();
	const bkashIdToken = await safeRedisGet(ID_TOKEN_KEY);
	const bkashRefreshToken = await safeRedisGet(REFRESH_TOKEN_KEY);
	const bkashIdTokenTTL = await safeRedisTtl(ID_TOKEN_KEY);
	const bkashRefreshTokenTTL = await safeRedisTtl(REFRESH_TOKEN_KEY);

	// 1. Return valid cached ID token
	if (bkashIdToken && bkashIdTokenTTL > 600) {
		return bkashIdToken;
	}

	// 2. Try refreshing token if refresh token exists; fall back to grant on failure
	if (bkashRefreshToken && bkashRefreshTokenTTL > 600) {
		try {
			const refreshTokenResponse = await fetch(
				`${baseUrl}/tokenized/checkout/token/refresh`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Accept: "application/json",
						username: config.bkash_username,
						password: config.bkash_password,
					},
					body: JSON.stringify({
						app_key: config.bkash_app_key,
						app_secret: config.bkash_app_secret,
						refresh_token: bkashRefreshToken,
					}),
				},
			);

			if (refreshTokenResponse.ok) {
				const refreshResult = await readTokenResponse(refreshTokenResponse);

				if (
					refreshResult.id_token &&
					(!refreshResult.statusCode || refreshResult.statusCode === "0000")
				) {
					await cacheTokens(refreshResult);
					return refreshResult.id_token;
				}
			}
		} catch {
			// Fall back to fresh token grant below
		}
	}

	// 3. Request a fresh token grant from bKash
	let response: Response;

	try {
		response = await fetch(`${baseUrl}/tokenized/checkout/token/grant`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				username: config.bkash_username,
				password: config.bkash_password,
			},
			body: JSON.stringify({
				app_key: config.bkash_app_key,
				app_secret: config.bkash_app_secret,
			}),
		});
	} catch (error) {
		console.error("bKash token grant request failed", {
			error: error instanceof Error ? error.message : "Unknown network error",
		});
		throw new AppError(
			httpStatus.BAD_GATEWAY,
			"Unable to reach bKash for authentication",
		);
	}

	const result = await readTokenResponse(response);

	if (
		!response.ok ||
		(result.statusCode && result.statusCode !== "0000") ||
		!result.id_token
	) {
		const providerMessage = getProviderErrorMessage(result, response);
		console.error("bKash token grant was rejected", {
			httpStatus: response.status,
			providerStatusCode: result.statusCode,
			providerMessage,
		});
		throw new AppError(
			httpStatus.BAD_GATEWAY,
			"bKash authentication failed. Check the configured bKash environment and credentials.",
		);
	}

	await cacheTokens(result);

	return result.id_token;
};
