import config from "../config/index.js";
import { redisClient } from "./redis.js";

const ID_TOKEN_KEY = "bkash:id-token";
const REFRESH_TOKEN_KEY = "bkash:refresh-token";

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
				`${config.bkash_base_url}/tokenized/checkout/token/refresh`,
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
				const refreshResult = (await refreshTokenResponse.json()) as {
					id_token?: string;
					refresh_token?: string;
				};

				if (refreshResult.id_token) {
					await safeRedisSet(ID_TOKEN_KEY, refreshResult.id_token, 3600);
					if (refreshResult.refresh_token) {
						await safeRedisSet(
							REFRESH_TOKEN_KEY,
							refreshResult.refresh_token,
							86400,
						);
					}
					return refreshResult.id_token;
				}
			}
		} catch {
			// Fall back to fresh token grant below
		}
	}

	// 3. Request a fresh token grant from bKash
	const response = await fetch(
		`${config.bkash_base_url}/tokenized/checkout/token/grant`,
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
			}),
		},
	);

	const rawText = await response.text();
	let result: {
		id_token?: string;
		refresh_token?: string;
		statusMessage?: string;
		msg?: string;
	} = {};

	try {
		result = JSON.parse(rawText);
	} catch {
		throw new Error(`Invalid bKash grant response (${response.status}): ${rawText}`);
	}

	if (!response.ok || !result.id_token) {
		throw new Error(
			`Failed to get bKash ID token: ${result.statusMessage || result.msg || response.statusText}`,
		);
	}

	await safeRedisSet(ID_TOKEN_KEY, result.id_token, 3600);
	if (result.refresh_token) {
		await safeRedisSet(REFRESH_TOKEN_KEY, result.refresh_token, 86400);
	}

	return result.id_token;
};