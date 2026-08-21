import { db } from "@cap/database";
import { encrypt } from "@cap/database/crypto";
import { organizations, videos } from "@cap/database/schema";
import { buildEnv, serverEnv } from "@cap/env";
import type { Video } from "@cap/web-domain";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { type NextRequest, NextResponse, userAgent } from "next/server";
import { verifyEmbedToken } from "@/lib/embed-token";
import { perVideoPasswordCookieName } from "@/lib/password-cookie-shared";

const addHttps = (s?: string) => {
	if (!s) return s;
	return `https://${s}`;
};

const mainOrigins = [
	"https://cap.so",
	"https://cap.link",
	"http://localhost",
	serverEnv().WEB_URL,
	addHttps(serverEnv().VERCEL_URL_HOST),
	addHttps(serverEnv().VERCEL_BRANCH_URL_HOST),
	addHttps(serverEnv().VERCEL_PROJECT_PRODUCTION_URL_HOST),
].filter(Boolean) as string[];

function isFromAllowedEmbedOrigin(request: NextRequest): boolean {
	const raw = serverEnv().ALLOWED_EMBED_ORIGINS;
	if (!raw) return false;

	const allowed = raw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	if (allowed.length === 0) return false;

	const referer = request.headers.get("referer");
	if (!referer) return false;

	try {
		const refererHost = new URL(referer).hostname;
		return allowed.some((origin) => refererHost === origin);
	} catch {
		return false;
	}
}

export async function proxy(request: NextRequest) {
	const url = new URL(request.url);
	const path = url.pathname;

	if (path === "/" && request.cookies.has("next-auth.session-token")) {
		return NextResponse.redirect(new URL("/dashboard/caps", url.origin));
	}

	if (path.startsWith("/login")) {
		const response = NextResponse.next();
		response.headers.set("X-Frame-Options", "SAMEORIGIN");
		response.headers.set(
			"Content-Security-Policy",
			"frame-ancestors https://cap.so",
		);
		return response;
	}

	if (
		path.startsWith("/s/") &&
		request.headers.get("sec-fetch-dest") === "iframe"
	) {
		const embedPath = path.replace(/^\/s\//, "/embed/");
		const embedUrl = new URL(embedPath + url.search, url.origin);
		return NextResponse.redirect(embedUrl, 302);
	}

	if (path.startsWith("/embed/")) {
		const videoIdMatch = path.match(/^\/embed\/([^/]+)/);
		const videoId = videoIdMatch?.[1];
		let encryptedPassword: string | null = null;

		if (videoId) {
			let authenticated = false;

			const token = url.searchParams.get("token");
			if (token && token.length > 0 && token.length < 2048) {
				try {
					const result = await verifyEmbedToken(token, videoId);
					authenticated = result.valid;
				} catch (e) {
					console.error("Embed token verification failed:", e);
				}
			}

			if (!authenticated) {
				authenticated = isFromAllowedEmbedOrigin(request);
			}

			if (authenticated) {
				try {
					const [video] = await db()
						.select({ password: videos.password })
						.from(videos)
						.where(eq(videos.id, videoId as Video.VideoId));
					if (video?.password) {
						encryptedPassword = await encrypt(video.password);
					}
				} catch (e) {
					console.error("Embed password lookup failed:", e);
				}
			}
		}

		const passwordCookieName = videoId
			? perVideoPasswordCookieName(videoId)
			: null;

		if (encryptedPassword && passwordCookieName) {
			request.cookies.set(passwordCookieName, encryptedPassword);
		}

		const response = NextResponse.next({
			request: { headers: request.headers },
		});
		response.headers.set("Access-Control-Allow-Origin", "*");
		response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
		response.headers.delete("X-Frame-Options");

		if (encryptedPassword && passwordCookieName) {
			response.cookies.set(passwordCookieName, encryptedPassword, {
				httpOnly: true,
				secure: process.env.NODE_ENV === "production",
				sameSite: "lax",
				path: "/",
				maxAge: 3600,
			});
		}

		return response;
	}

	const hostname = url.hostname;

	if (buildEnv.NEXT_PUBLIC_IS_CAP !== "true") {
		if (
			!(
				path.startsWith("/s/") ||
				path.startsWith("/c/") ||
				path.startsWith("/cli/") ||
				path.startsWith("/middleware") ||
				path.startsWith("/dashboard") ||
				path.startsWith("/onboarding") ||
				path.startsWith("/api") ||
				path.startsWith("/login") ||
				path.startsWith("/signup") ||
				path.startsWith("/invite") ||
				path.startsWith("/self-hosting") ||
				path.startsWith("/download") ||
				path.startsWith("/terms") ||
				path.startsWith("/verify-otp") ||
				path.startsWith("/embed/") ||
				path.startsWith("/.well-known/workflow/")
			) &&
			process.env.NODE_ENV !== "development"
		)
			return NextResponse.redirect(new URL("/login", url.origin));
		else return NextResponse.next();
	}

	if (mainOrigins.some((d) => url.origin.startsWith(d))) {
		return NextResponse.next();
	}

	const webUrl = new URL(serverEnv().WEB_URL).hostname;

	try {
		if (!(path.startsWith("/s/") || path.startsWith("/c/"))) {
			const url = new URL(request.url);
			url.hostname = webUrl;
			return NextResponse.redirect(url);
		}

		const verifiedDomain = request.cookies.get("verified_domain");
		if (verifiedDomain?.value === hostname) return NextResponse.next();

		const [organization] = await db()
			.select()
			.from(organizations)
			.where(eq(organizations.customDomain, hostname));

		if (!organization || !organization.domainVerified) {
			const url = new URL(request.url);
			url.hostname = webUrl;
			return NextResponse.redirect(url);
		}

		const response = NextResponse.next();
		response.cookies.set("verified_domain", hostname, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "strict",
			maxAge: 3600,
		});

		const { pathname } = request.nextUrl;
		const referrer = request.headers.get("referer") || "";

		const ua = userAgent(request);

		response.headers.set("x-pathname", pathname);
		response.headers.set("x-referrer", referrer);
		response.headers.set("x-user-agent", JSON.stringify(ua));

		return response;
	} catch (error) {
		console.error("Error in proxy:", error);
		return notFound();
	}
}

export const config = {
	matcher: [
		"/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|\\.well-known).*)",
	],
};
