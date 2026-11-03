import config from "../config";
import { redisClient } from "./redis";

export const getBkashIdToken = async () => {
	try {
		const IdTokenKey = "bkash:id-token";
		const RefreshTokenKey = "bkash:refresh-token";

		let bkashIdToken = await redisClient.get(IdTokenKey);
		const bkashRefreshToken = await redisClient.get(RefreshTokenKey);

		const bkashIdTokenTTL = await redisClient.ttl(IdTokenKey);
		const bkashRefreshTokenTTL = await redisClient.ttl(RefreshTokenKey);

		if (
			bkashRefreshToken &&
			bkashRefreshTokenTTL > 600 &&
			(bkashIdTokenTTL <= 600 || !bkashIdToken)
		) {
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

			if (!refreshTokenResponse.ok) {
				throw new Error(
					`Failed to refresh bKash token: ${refreshTokenResponse.statusText}`,
				);
			}

			const bkashRefreshTokenResult = (await refreshTokenResponse.json()) as {
				id_token?: string;
				refresh_token?: string;
			};

			if (!bkashRefreshTokenResult.id_token) {
				throw new Error("bKash refresh response did not contain an ID token");
			}

			bkashIdToken = bkashRefreshTokenResult.id_token;

			await redisClient.set(IdTokenKey, bkashIdToken, {
				expiration: { type: "EX", value: 3600 },
			});

			if (bkashRefreshTokenResult.refresh_token) {
				await redisClient.set(
					RefreshTokenKey,
					bkashRefreshTokenResult.refresh_token,
					{
						expiration: { type: "EX", value: 86400 },
					},
				);
			}

			return bkashIdToken;
		}

		if (bkashIdTokenTTL > 600) {
			return bkashIdToken;
		}

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

		if (!response.ok) {
			throw new Error(`Failed to get bKash ID token: ${response.statusText}`);
		}

		const result = (await response.json()) as {
			id_token?: string;
			refresh_token?: string;
		};

		if (!result.id_token || !result.refresh_token) {
			throw new Error("bKash grant response did not contain required tokens");
		}

		bkashIdToken = result.id_token;
		await redisClient.set(IdTokenKey, result.id_token, {
			expiration: { type: "EX", value: 3600 },
		});

		await redisClient.set(RefreshTokenKey, result.refresh_token, {
			expiration: { type: "EX", value: 86400 },
		});

		return bkashIdToken;
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		throw new Error(`Error getting bKash ID token: ${message}`);
	}
};
