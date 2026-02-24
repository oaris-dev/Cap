import { db } from "@cap/database";
import { videos } from "@cap/database/schema";
import { buildEnv } from "@cap/env";
import { Video } from "@cap/web-domain";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;

function extractVideoId(urlParam: string): string | null {
	try {
		const parsed = new URL(urlParam);
		const match = parsed.pathname.match(/^\/s\/([^/]+)$/);
		return match?.[1] ?? null;
	} catch {
		return null;
	}
}

export async function GET(req: NextRequest) {
	const url = req.nextUrl.searchParams.get("url");
	const format = req.nextUrl.searchParams.get("format");
	const maxwidthParam = req.nextUrl.searchParams.get("maxwidth");
	const maxheightParam = req.nextUrl.searchParams.get("maxheight");

	if (format && format !== "json") {
		return NextResponse.json(
			{ error: "Only JSON format is supported" },
			{ status: 501 },
		);
	}

	if (!url) {
		return NextResponse.json(
			{ error: "Missing required 'url' parameter" },
			{ status: 400 },
		);
	}

	const rawVideoId = extractVideoId(url);
	if (!rawVideoId) {
		return NextResponse.json(
			{ error: "Invalid URL: must match /s/{videoId}" },
			{ status: 404 },
		);
	}

	const videoId = Video.VideoId.make(rawVideoId);

	const result = await db()
		.select({
			id: videos.id,
			name: videos.name,
			ownerId: videos.ownerId,
			public: videos.public,
			width: videos.width,
			height: videos.height,
		})
		.from(videos)
		.where(eq(videos.id, videoId))
		.limit(1);

	const video = result[0];
	if (!video || !video.public) {
		return NextResponse.json({ error: "Video not found" }, { status: 404 });
	}

	const videoWidth = video.width || DEFAULT_WIDTH;
	const videoHeight = video.height || DEFAULT_HEIGHT;

	const maxwidth = maxwidthParam ? Number.parseInt(maxwidthParam, 10) : null;
	const maxheight = maxheightParam ? Number.parseInt(maxheightParam, 10) : null;

	let width = videoWidth;
	let height = videoHeight;

	if (maxwidth && width > maxwidth) {
		const scale = maxwidth / width;
		width = maxwidth;
		height = Math.round(height * scale);
	}

	if (maxheight && height > maxheight) {
		const scale = maxheight / height;
		height = maxheight;
		width = Math.round(width * scale);
	}

	const baseUrl = buildEnv.NEXT_PUBLIC_WEB_URL;
	const embedUrl = new URL(`/embed/${video.id}`, baseUrl).toString();
	const thumbnailUrl = new URL(
		`/api/video/og?videoId=${video.id}`,
		baseUrl,
	).toString();

	const oembedResponse = {
		version: "1.0",
		type: "video",
		provider_name: "Cap",
		provider_url: baseUrl,
		title: video.name,
		thumbnail_url: thumbnailUrl,
		thumbnail_width: 1200,
		thumbnail_height: 630,
		width,
		height,
		html: `<iframe src="${embedUrl}" width="${width}" height="${height}" frameborder="0" allow="autoplay; fullscreen" allowfullscreen></iframe>`,
	};

	return NextResponse.json(oembedResponse, {
		headers: {
			"Content-Type": "application/json+oembed",
			"Cache-Control": "public, max-age=3600",
		},
	});
}
