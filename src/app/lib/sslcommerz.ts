import { randomUUID } from "node:crypto";
import httpStatus from "http-status";
import config from "../config/index.js";
import { AppError } from "../utils/AppError.js";

type SslcommerzResponse = Record<string, unknown>;

const getApiBaseUrl = (): string => {
	const baseUrl = config.sslcommerz_base_url.trim().replace(/\/+$/, "");

	try {
		const parsedUrl = new URL(baseUrl);
		if (
			parsedUrl.protocol !== "https:" ||
			parsedUrl.username ||
			parsedUrl.password ||
			parsedUrl.search ||
			parsedUrl.hash
		) {
			throw new Error("Invalid SSLCOMMERZ API URL");
		}
	} catch {
		throw new AppError(
			httpStatus.INTERNAL_SERVER_ERROR,
			"SSLCOMMERZ_BASE_URL must be a valid HTTPS URL",
		);
	}

	if (!config.sslcommerz_store_id.trim() || !config.sslcommerz_store_password.trim()) {
		throw new AppError(
			httpStatus.INTERNAL_SERVER_ERROR,
			"SSLCOMMERZ_STORE_ID and SSLCOMMERZ_STORE_PASSWORD must be configured",
		);
	}

	return baseUrl;
};

const readResponse = async (response: Response): Promise<SslcommerzResponse> => {
	try {
		const result: unknown = await response.json();
		if (result && typeof result === "object" && !Array.isArray(result)) {
			return result as SslcommerzResponse;
		}
	} catch {
		// A malformed provider response is reported as a gateway error below.
	}

	throw new AppError(
		httpStatus.BAD_GATEWAY,
		"SSLCOMMERZ returned an invalid response",
	);
};

const request = async (
	url: URL,
	init: RequestInit,
	action: string,
): Promise<SslcommerzResponse> => {
	let response: Response;
	try {
		response = await fetch(url, {
			...init,
			signal: AbortSignal.timeout(15000),
		});
	} catch (error) {
		console.error(`SSLCOMMERZ ${action} request failed`, {
			error: error instanceof Error ? error.message : "Unknown network error",
		});
		throw new AppError(
			httpStatus.BAD_GATEWAY,
			`Unable to reach SSLCOMMERZ to ${action}`,
		);
	}

	const result = await readResponse(response);
	if (!response.ok) {
		console.error(`SSLCOMMERZ ${action} request was rejected`, {
			httpStatus: response.status,
		});
		throw new AppError(
			httpStatus.BAD_GATEWAY,
			`SSLCOMMERZ could not ${action}`,
		);
	}

	return result;
};

export const createSslcommerzTransactionId = (): string =>
	randomUUID().replace(/-/g, "").slice(0, 30);

export const createSslcommerzSession = async (
	parameters: Record<string, string>,
): Promise<SslcommerzResponse> => {
	const baseUrl = getApiBaseUrl();
	const form = new URLSearchParams({
		store_id: config.sslcommerz_store_id,
		store_passwd: config.sslcommerz_store_password,
		...parameters,
	});

	const result = await request(
		new URL("/gwprocess/v4/api.php", baseUrl),
		{
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: form,
		},
		"initialize the payment",
	);

	if (result.status !== "SUCCESS" || typeof result.GatewayPageURL !== "string") {
		console.error("SSLCOMMERZ session initialization failed", {
			status: result.status,
			failedReason: result.failedreason,
		});
		throw new AppError(
			httpStatus.BAD_GATEWAY,
			"SSLCOMMERZ failed to initialize the payment",
		);
	}

	try {
		if (new URL(result.GatewayPageURL).protocol !== "https:") {
			throw new Error("Invalid SSLCOMMERZ checkout URL");
		}
	} catch {
		throw new AppError(
			httpStatus.BAD_GATEWAY,
			"SSLCOMMERZ returned an invalid checkout URL",
		);
	}

	return result;
};

export const validateSslcommerzPayment = async (
	validationId: string,
): Promise<SslcommerzResponse> => {
	const baseUrl = getApiBaseUrl();
	const url = new URL("/validator/api/validationserverAPI.php", baseUrl);
	url.search = new URLSearchParams({
		val_id: validationId,
		store_id: config.sslcommerz_store_id,
		store_passwd: config.sslcommerz_store_password,
		v: "1",
		format: "json",
	}).toString();

	return request(url, { method: "GET" }, "validate the payment");
};

export const requestSslcommerzRefund = async (
	bankTransactionId: string,
	refundTransactionId: string,
	amount: string,
	reason: string,
): Promise<SslcommerzResponse> => {
	const baseUrl = getApiBaseUrl();
	const url = new URL("/validator/api/merchantTransIDvalidationAPI.php", baseUrl);
	url.search = new URLSearchParams({
		bank_tran_id: bankTransactionId,
		refund_trans_id: refundTransactionId,
		refund_amount: amount,
		refund_remarks: reason,
		store_id: config.sslcommerz_store_id,
		store_passwd: config.sslcommerz_store_password,
		v: "1",
		format: "json",
	}).toString();

	return request(url, { method: "GET" }, "initiate the refund");
};
