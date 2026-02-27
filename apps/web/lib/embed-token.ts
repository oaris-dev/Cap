import { serverEnv } from "@cap/env";
import { jwtVerify, SignJWT } from "jose";

const ISSUER = "cap-embed";
const AUDIENCE = "cap-embed-viewer";

function getSecret() {
	return new TextEncoder().encode(serverEnv().NEXTAUTH_SECRET);
}

export type EmbedTokenExpiry = "1h" | "24h" | "7d" | "30d";

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
		if (
			error instanceof Error &&
			error.message.includes('"exp" claim timestamp check failed')
		) {
			return { valid: false, reason: "Token has expired" };
		}
		return { valid: false, reason: "Invalid token" };
	}
}
