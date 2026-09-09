import config from "../config";
import { redisClient } from "./redis";

export const getBkashIdToken = async () => {
  try {
    const IdTokenKey = "bkash:id-token";
    const RefreshTokenKey = "bkash:refresh-token";

    let bkashIdToken = await redisClient.get(IdTokenKey);
    let bkashRefreshToken = await redisClient.get(RefreshTokenKey);

    const ttlResult = await redisClient.ttl(IdTokenKey);
const bkashIdTokenTTL = await redisClient.ttl(IdTokenKey);
const bkashRefreshTokenTTL = await redisClient.ttl(RefreshTokenKey);

// console.log({
//   bkashIdToken,
//   bkashRefreshToken,
//   bkashIdTokenTTL,
//   bkashRefreshTokenTTL, 
// })
    



if ((bkashIdTokenTTL <= 600 || !bkashIdToken) && bkashRefreshToken && bkashRefreshTokenTTL > 600) {
      const refreshTokenResponse = await fetch(`${config.bkash_base_url}/tokenized/checkout/token/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          username: config.bkash_username,
          password: config.bkash_password,
        },
        body: JSON.stringify({
          app_key: config.bkash_app_key,
          app_secret: config.bkash_app_secret,
          refresh_token: bkashRefreshToken,
        }),
      });

      if (!refreshTokenResponse.ok) {
        throw new Error(`Failed to refresh bKash token: ${refreshTokenResponse.statusText}`);
      }

      const bkashRefreshTokenResult = await refreshTokenResponse.json();
      bkashIdToken = bkashRefreshTokenResult.id_token as string;

      await redisClient.set(IdTokenKey, bkashIdToken, {
        expiration: { type: "EX", value: 3600 },
      });

      if (bkashRefreshTokenResult.refresh_token) {
        await redisClient.set(RefreshTokenKey, bkashRefreshTokenResult.refresh_token, {
          expiration: { type: "EX", value: 86400 },
        });
      }

      return bkashIdToken;
    }

    if (bkashIdTokenTTL > 600) {
      return bkashIdToken;
    }

    const response = await fetch(`${config.bkash_base_url}/tokenized/checkout/token/grant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        username: config.bkash_username,
        password: config.bkash_password,
      },
      body: JSON.stringify({
        app_key: config.bkash_app_key,
        app_secret: config.bkash_app_secret,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to get bKash ID token: ${response.statusText}`);
    }

    const result = await response.json();
    bkashIdToken = result.id_token as string;
    await redisClient.set(IdTokenKey, result.id_token, {
      expiration: { type: "EX", value: 3600 },
    });
    
    await redisClient.set(RefreshTokenKey, result.refresh_token, {
      expiration: { type: "EX", value: 86400 },
    });

    return bkashIdToken;

  } catch (error: any) {
    throw new Error(`Error getting bKash ID token: ${error.message}`);
  }
};