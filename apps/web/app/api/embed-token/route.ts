import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { videos } from "@cap/database/schema";
import { buildEnv } from "@cap/env";
import type { Video } from "@cap/web-domain";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import {
	type EmbedTokenExpiry,
	signEmbedToken,
	VALID_EXPIRIES,
} from "@/lib/embed-token";

export async function POST(request: NextRequest) {
	const user = await getCurrentUser();
	if (!user?.id) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	let body: { videoId?: string; expiresIn?: string };
	try {
		body = await request.json();
	} catch {
		return Response.json({ error: "Invalid request body" }, { status: 400 });
	}

	const { videoId, expiresIn } = body;

	if (!videoId || typeof videoId !== "string") {
		return Response.json({ error: "videoId is required" }, { status: 400 });
	}

	if (!expiresIn || !VALID_EXPIRIES.includes(expiresIn as EmbedTokenExpiry)) {
		return Response.json(
			{ error: `expiresIn must be one of: ${VALID_EXPIRIES.join(", ")}` },
			{ status: 400 },
		);
	}

	const [video] = await db()
		.select({
			id: videos.id,
			ownerId: videos.ownerId,
			password: videos.password,
		})
		.from(videos)
		.where(eq(videos.id, videoId as Video.VideoId));

	if (!video) {
		return Response.json({ error: "Video not found" }, { status: 404 });
	}

	if (video.ownerId !== user.id) {
		return Response.json({ error: "Forbidden" }, { status: 403 });
	}

	if (!video.password) {
		return Response.json(
			{ error: "Video does not have a password set" },
			{ status: 400 },
		);
	}

	const token = await signEmbedToken(videoId, expiresIn as EmbedTokenExpiry);
	const embedUrl = new URL(
		`/embed/${videoId}?token=${token}`,
		buildEnv.NEXT_PUBLIC_WEB_URL,
	).toString();

	return Response.json({ url: embedUrl, token, expiresIn });
}
