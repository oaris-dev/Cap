import "server-only";

import { serverEnv } from "@cap/env";
import { errors, jwtVerify, SignJWT } from "jose";
import type { EmbedTokenExpiry } from "./embed-token-shared";

export type { EmbedTokenExpiry } from "./embed-token-shared";
export { EXPIRY_LABELS, VALID_EXPIRIES } from "./embed-token-shared";

const ISSUER = "cap-embed";
const AUDIENCE = "cap-embed-viewer";

function getSecret() {
	return new TextEncoder().encode(serverEnv().NEXTAUTH_SECRET);
}

const expiryToSeconds: Record<EmbedTokenExpiry, number> = {
	"1h": 3600,
	"24h": 86400,
	"7d": 604800,
	"30d": 2592000,
};

export async function signEmbedToken(
	videoId: string,
	expiresIn: EmbedTokenExpiry,
) {
	const secret = getSecret();
	const now = Math.floor(Date.now() / 1000);

	return new SignJWT({
		videoId,
		passwordVerified: true,
	})
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt(now)
		.setIssuer(ISSUER)
		.setAudience(AUDIENCE)
		.setExpirationTime(now + expiryToSeconds[expiresIn])
		.sign(secret);
}

export async function verifyEmbedToken(
	token: string,
	videoId: string,
): Promise<{ valid: true } | { valid: false; reason: string }> {
	try {
		const { payload } = await jwtVerify(token, getSecret(), {
			issuer: ISSUER,
			audience: AUDIENCE,
		});

		if (payload.videoId !== videoId) {
			return { valid: false, reason: "Token is for a different video" };
		}

		if (payload.passwordVerified !== true) {
			return { valid: false, reason: "Token missing password verification" };
		}

		return { valid: true };
	} catch (error) {
		if (error instanceof errors.JWTExpired) {
			return { valid: false, reason: "Token has expired" };
		}
		return { valid: false, reason: "Invalid token" };
	}
}
