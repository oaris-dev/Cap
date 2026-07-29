import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { nanoIdLength } from "@cap/database/helpers";
import {
	comments,
	organizationMembers,
	organizations,
	sharedVideos,
	spaces,
	spaceVideos,
	users,
	videoEdits,
	videos,
	videoUploads,
} from "@cap/database/schema";
import type { VideoMetadata } from "@cap/database/types";
import { buildEnv, serverEnv } from "@cap/env";
import { Logo } from "@cap/ui";
import { userIsPro } from "@cap/utils";
import {
	Database,
	ImageUploads,
	provideOptionalAuth,
	resolveEffectiveVideoRules,
	Videos,
} from "@cap/web-backend";
import { VideosPolicy } from "@cap/web-backend/src/Videos/VideosPolicy";
import {
	Comment,
	type ImageUpload,
	type Organisation,
	Policy,
	type Video,
} from "@cap/web-domain";
import { and, eq, type InferSelectModel, isNull, sql } from "drizzle-orm";
import { Effect, Option } from "effect";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getVideoAnalytics } from "@/actions/videos/get-analytics";
import {
	getDashboardData,
	type OrganizationSettings,
} from "@/app/(org)/dashboard/dashboard-data";
import { OarisLogo } from "@/components/OarisLogo";
import { completeDesktopSegmentsManifestAndQueue } from "@/lib/desktop-segments-recovery";
import { createNotification } from "@/lib/Notification";
import {
	canManageOrganizationSettings,
	getEffectiveOrganizationRole,
} from "@/lib/permissions/roles";
import { resolveDefaultPlaybackSpeed } from "@/lib/playback-speed";
import * as EffectRuntime from "@/lib/server";
import { runPromise } from "@/lib/server";
import { getSharePageBranding } from "@/lib/share-branding";
import { getSharePlayerUrl } from "@/lib/share-player-url";
import {
	isSocialCrawlerUserAgent,
	SOCIAL_REFERRER_DOMAINS,
} from "@/lib/social-crawlers";
import { transcribeVideo } from "@/lib/transcribe";
import { t } from "@/lib/translations";
import { canUserDownloadVideo } from "@/lib/video-download-permissions";
import {
	isEditSourceKey,
	reconcileStaleEditUpload,
} from "@/lib/video-edit-processing";
import {
	areEditSpecsEquivalent,
	createIdentityEditSpec,
} from "@/lib/video-edits";
import { optionFromTOrFirst } from "@/utils/effect";
import { isAiGenerationEnabled } from "@/utils/flags";
import { PasswordOverlay } from "./_components/PasswordOverlay";
import { PendingRecordingShare } from "./_components/PendingRecordingShare";
import { ShareHeader } from "./_components/ShareHeader";
import { Share } from "./Share";

const VIEW_NOTIFICATION_DELAY_MS = 2 * 60 * 1000;
const VIDEO_ID_PATTERN = /^[0-9abcdefghjkmnpqrstvwxyz]+$/;

type ShareVideoSearchParams = {
	[key: string]: string | string[] | undefined;
};

const isValidVideoIdParam = (videoId: string) =>
	videoId.length === nanoIdLength && VIDEO_ID_PATTERN.test(videoId);

const hasRecordingStoppedParam = (searchParams: ShareVideoSearchParams) => {
	const recordingStoppedParam = Array.isArray(searchParams.recordingStopped)
		? searchParams.recordingStopped[0]
		: searchParams.recordingStopped;

	return recordingStoppedParam === "1" || recordingStoppedParam === "true";
};

// Helper function to fetch shared spaces data for a video
async function getSharedSpacesForVideo(videoId: Video.VideoId) {
	// Fetch space-level sharing
	const spaceSharing = await db()
		.select({
			id: spaces.id,
			name: spaces.name,
			organizationId: spaces.organizationId,
			iconUrl: spaces.iconUrl,
			settings: spaces.settings,
			hasPassword: sql`${spaces.password} IS NOT NULL`.mapWith(Boolean),
		})
		.from(spaceVideos)
		.innerJoin(spaces, eq(spaceVideos.spaceId, spaces.id))
		.innerJoin(organizations, eq(spaces.organizationId, organizations.id))
		.where(eq(spaceVideos.videoId, videoId));

	// Fetch organization-level sharing
	const orgSharing = await db()
		.select({
			id: organizations.id,
			name: organizations.name,
			organizationId: organizations.id,
			iconUrl: organizations.iconUrl,
		})
		.from(sharedVideos)
		.innerJoin(organizations, eq(sharedVideos.organizationId, organizations.id))
		.where(eq(sharedVideos.videoId, videoId));

	const sharedSpaces: Array<{
		id: string;
		name: string;
		organizationId: string;
		iconUrl?: string;
		settings?: OrganizationSettings | null;
		hasPassword?: boolean;
	}> = [];

	// Add space-level sharing
	spaceSharing.forEach((space) => {
		sharedSpaces.push({
			id: space.id,
			name: space.name,
			organizationId: space.organizationId,
			iconUrl: space.iconUrl || undefined,
			settings: space.settings,
			hasPassword: space.hasPassword,
		});
	});

	// Add organization-level sharing
	orgSharing.forEach((org) => {
		sharedSpaces.push({
			id: org.id,
			name: org.name,
			organizationId: org.organizationId,
			iconUrl: org.iconUrl || undefined,
			settings: null,
			hasPassword: false,
		});
	});

	return sharedSpaces;
}

const ALLOWED_REFERRERS = [
	"x.com",
	"twitter.com",
	"facebook.com",
	"fb.com",
	"slack.com",
	"notion.so",
	"linkedin.com",
];

function TranslatedLink({
	translationKey,
	linkText,
	href,
}: {
	translationKey:
		| "share.signInToManageDescription"
		| "share.emailRestrictionDescription";
	linkText: string;
	href: string;
}) {
	const parts = t(translationKey).split("{link}");
	return (
		<>
			{parts[0]}
			<Link href={href}>{linkText}</Link>
			{parts[1] || ""}
		</>
	);
}

function PolicyDeniedView({ reason }: { reason?: string }) {
	let title = t("share.videoPrivate");
	let description: React.ReactNode = (
		<TranslatedLink
			translationKey="share.signInToManageDescription"
			linkText={t("share.signInToManage")}
			href="/login"
		/>
	);

	if (reason === "email_restriction_login_required") {
		title = t("share.requiresSignIn");
		description = (
			<TranslatedLink
				translationKey="share.emailRestrictionDescription"
				linkText={t("share.signInToManage")}
				href="/login"
			/>
		);
	} else if (reason === "email_restriction_denied") {
		title = t("share.accessRestricted");
		description = t("share.emailDeniedDescription");
	}

	return (
		<div className="flex flex-col justify-center items-center p-4 min-h-screen text-center bg-[oklch(0.992_0.005_78.25)] font-lexend">
			<OarisLogo className="w-32 h-auto text-gray-12" />
			<h1 className="mb-2 text-2xl font-semibold font-league-spartan">
				{title}
			</h1>
			<p className="text-gray-400">{description}</p>
		</div>
	);
}

const renderPolicyDenied = (videoId: Video.VideoId, reason?: string) =>
	Effect.succeed(<PolicyDeniedView key={videoId} reason={reason} />);

const renderNoSuchElement = (awaitRecording: boolean) =>
	awaitRecording
		? Effect.succeed(<PendingRecordingShare />)
		: Effect.sync(() => notFound());

const getShareVideoPageCatchers = (
	videoId: Video.VideoId,
	awaitRecording: boolean,
) => ({
	PolicyDenied: (e: Policy.PolicyDeniedError) =>
		renderPolicyDenied(videoId, e.reason),
	NoSuchElementException: () => renderNoSuchElement(awaitRecording),
});

export async function generateMetadata(
	props: PageProps<"/s/[videoId]">,
): Promise<Metadata> {
	const params = await props.params;
	const searchParams = await props.searchParams;
	const videoId = params.videoId as Video.VideoId;
	const awaitRecording =
		isValidVideoIdParam(videoId) && hasRecordingStoppedParam(searchParams);

	const headersList = await headers();
	const referrer =
		headersList.get("x-referrer") || headersList.get("referer") || "";
	const requestUserAgent = headersList.get("user-agent") || "";
	const isAllowedReferrer = SOCIAL_REFERRER_DOMAINS.some((domain) =>
		referrer.includes(domain),
	);
	const canRenderSocialPreview =
		isAllowedReferrer || isSocialCrawlerUserAgent(requestUserAgent);

	const oembedUrl = new URL(
		`/api/oembed?url=${encodeURIComponent(new URL(`/s/${videoId}`, buildEnv.NEXT_PUBLIC_WEB_URL).toString())}`,
		buildEnv.NEXT_PUBLIC_WEB_URL,
	).toString();

	return Effect.flatMap(Videos, (v) => v.getByIdForViewing(videoId)).pipe(
		Effect.map(
			Option.match({
				onNone: () =>
					awaitRecording
						? {
								title: "Cap: Preparing Video",
								description: "This recording is being made available.",
								robots: "noindex, nofollow",
							}
						: notFound(),
				onSome: ([video]) => {
					const previewImageUrl = new URL(
						`/api/video/preview?videoId=${videoId}&fallback=og`,
						buildEnv.NEXT_PUBLIC_WEB_URL,
					).toString();
					const ogImageUrl = new URL(
						`/api/video/og?videoId=${videoId}`,
						buildEnv.NEXT_PUBLIC_WEB_URL,
					).toString();
					const playlistUrl = new URL(
						`/api/playlist?videoId=${video.id}`,
						buildEnv.NEXT_PUBLIC_WEB_URL,
					).toString();

					return {
						title: `${video.name} | ${t("meta.titleSuffix")}`,
						description: t("meta.watchDescription"),
						alternates: {
							types: {
								"application/json+oembed": oembedUrl,
							},
						},
						openGraph: {
							images: [
								{
									url: previewImageUrl,
									width: 480,
									height: 270,
									type: "image/gif",
								},
								{
									url: ogImageUrl,
									width: 1200,
									height: 630,
								},
							],
							videos: [
								{
									url: playlistUrl,
									width: 1280,
									height: 720,
									type: "video/mp4",
								},
							],
						},
						twitter: {
							card: "player",
							title: `${video.name} | ${t("meta.titleSuffix")}`,
							description: t("meta.watchDescription"),
							images: [
								{
									url: previewImageUrl,
									width: 480,
									height: 270,
									type: "image/gif",
								},
								{
									url: ogImageUrl,
									width: 1200,
									height: 630,
								},
							],
							players: {
								playerUrl: getSharePlayerUrl(videoId),
								streamUrl: playlistUrl,
								width: 1280,
								height: 720,
							},
						},
						robots: canRenderSocialPreview
							? "index, follow"
							: "noindex, nofollow",
					};
				},
			}),
		),
		Effect.catchTags({
			PolicyDenied: () =>
				Effect.succeed({
					title: "This video is restricted",
					description: "This video has restricted access.",
					openGraph: {
						images: [
							{
								url: new URL(
									`/api/video/og?videoId=${videoId}`,
									buildEnv.NEXT_PUBLIC_WEB_URL,
								).toString(),
								width: 1200,
								height: 630,
							},
						],
						videos: [
							{
								url: new URL(
									`/api/playlist?videoId=${videoId}`,
									buildEnv.NEXT_PUBLIC_WEB_URL,
								).toString(),
								width: 1280,
								height: 720,
								type: "video/mp4",
							},
						],
					},
					robots: "noindex, nofollow",
				}),
			VerifyVideoPasswordError: () =>
				Effect.succeed({
					title: "Password Protected Video",
					description: "This video is password protected.",
					alternates: {
						types: {
							"application/json+oembed": oembedUrl,
						},
					},
					openGraph: {
						images: [
							{
								url: new URL(
									`/api/video/og?videoId=${videoId}`,
									buildEnv.NEXT_PUBLIC_WEB_URL,
								).toString(),
								width: 1200,
								height: 630,
							},
						],
					},
					twitter: {
						card: "summary_large_image",
						title: "Password Protected Video",
						description: "This video is password protected.",
						images: [
							new URL(
								`/api/video/og?videoId=${videoId}`,
								buildEnv.NEXT_PUBLIC_WEB_URL,
							).toString(),
						],
					},
					robots: "noindex, nofollow",
				}),
		}),
		provideOptionalAuth,
		EffectRuntime.runPromise,
	);
}

export default async function ShareVideoPage(props: PageProps<"/s/[videoId]">) {
	const params = await props.params;
	const searchParams = await props.searchParams;
	const videoId = params.videoId as Video.VideoId;
	const awaitRecording =
		isValidVideoIdParam(videoId) && hasRecordingStoppedParam(searchParams);

	await reconcileStaleEditUpload(videoId);

	return Effect.gen(function* () {
		const videosPolicy = yield* VideosPolicy;

		const [video] = yield* Effect.promise(() =>
			db()
				.select({
					id: videos.id,
					name: videos.name,
					orgId: videos.orgId,
					createdAt: videos.createdAt,
					updatedAt: videos.updatedAt,
					effectiveCreatedAt: videos.effectiveCreatedAt,
					bucket: videos.bucket,
					storageIntegrationId: videos.storageIntegrationId,
					metadata: videos.metadata,
					public: videos.public,
					videoStartTime: videos.videoStartTime,
					audioStartTime: videos.audioStartTime,
					awsRegion: videos.awsRegion,
					awsBucket: videos.awsBucket,
					xStreamInfo: videos.xStreamInfo,
					jobId: videos.jobId,
					jobStatus: videos.jobStatus,
					isScreenshot: videos.isScreenshot,
					skipProcessing: videos.skipProcessing,
					transcriptionStatus: videos.transcriptionStatus,
					source: videos.source,
					videoSettings: videos.settings,
					width: videos.width,
					height: videos.height,
					duration: videos.duration,
					fps: videos.fps,
					firstViewEmailSentAt: videos.firstViewEmailSentAt,
					hasPassword: sql`${videos.password} IS NOT NULL`.mapWith(Boolean),
					sharedOrganization: {
						organizationId: sharedVideos.organizationId,
					},
					orgSettings: organizations.settings,
					organizationName: organizations.name,
					organizationIconUrl: organizations.iconUrl,
					shareableLinkIconUrl: organizations.shareableLinkIconUrl,
					hasActiveUpload:
						sql`${videoUploads.videoId} IS NOT NULL AND ${videos.isScreenshot} = false`.mapWith(
							Boolean,
						),
					activeUploadRawFileKey: videoUploads.rawFileKey,
					owner: users,
				})
				.from(videos)
				.leftJoin(sharedVideos, eq(videos.id, sharedVideos.videoId))
				.innerJoin(users, eq(videos.ownerId, users.id))
				.leftJoin(videoUploads, eq(videos.id, videoUploads.videoId))
				.leftJoin(organizations, eq(videos.orgId, organizations.id))
				.where(and(eq(videos.id, videoId), isNull(organizations.tombstoneAt))),
		).pipe(Policy.withPublicPolicy(videosPolicy.canView(videoId)));

		return Option.fromNullable(video);
	}).pipe(
		Effect.flatten,
		Effect.map((video) => ({ needsPassword: false, video }) as const),
		Effect.catchTag("VerifyVideoPasswordError", () =>
			Effect.succeed({ needsPassword: true } as const),
		),
		Effect.map((data) => (
			<div
				key={videoId}
				className="flex flex-col min-h-screen bg-[oklch(0.992_0.005_78.25)] font-lexend"
			>
				<PasswordOverlay isOpen={data.needsPassword} videoId={videoId} />
				{!data.needsPassword && (
					<AuthorizedContent video={data.video} searchParams={searchParams} />
				)}
			</div>
		)),
		Effect.catchTags(getShareVideoPageCatchers(videoId, awaitRecording)),
		provideOptionalAuth,
		EffectRuntime.runPromise,
	);
}

async function AuthorizedContent({
	video,
	searchParams,
}: {
	video: Omit<
		InferSelectModel<typeof videos>,
		"folderId" | "password" | "settings" | "ownerId"
	> & {
		owner: InferSelectModel<typeof users>;
		sharedOrganization: { organizationId: Organisation.OrganisationId } | null;
		hasPassword: boolean;
		hasActiveUpload: boolean;
		activeUploadRawFileKey: string | null;
		orgSettings?: OrganizationSettings | null;
		videoSettings?: OrganizationSettings | null;
		organizationName?: string | null;
		organizationIconUrl?: ImageUpload.ImageUrlOrKey | null;
		shareableLinkIconUrl?: ImageUpload.ImageUrlOrKey | null;
	};
	searchParams: ShareVideoSearchParams;
}) {
	// will have already been fetched if auth is required
	const user = await getCurrentUser();
	const videoId = video.id;
	let recoveredDesktopSegmentsUpload = false;

	if (
		user?.id === video.owner.id &&
		!video.isScreenshot &&
		video.source?.type === "desktopSegments" &&
		!video.hasActiveUpload &&
		serverEnv().MEDIA_SERVER_URL
	) {
		try {
			const result = await completeDesktopSegmentsManifestAndQueue({
				videoId,
				userId: user.id,
			});
			recoveredDesktopSegmentsUpload =
				result.status === "queued" || result.status === "already-processing";
		} catch (error) {
			console.error(
				`[ShareVideoPage] Failed to recover desktop segments upload ${videoId}:`,
				error,
			);
		}
	}

	const hasActiveUpload =
		video.hasActiveUpload || recoveredDesktopSegmentsUpload;
	const canRegisterView =
		!hasActiveUpload &&
		Date.now() - video.updatedAt.getTime() >= VIEW_NOTIFICATION_DELAY_MS;

	if (user && video && user.id !== video.owner.id && canRegisterView) {
		try {
			await createNotification({
				type: "view",
				videoId: video.id,
				authorId: user.id,
			});
		} catch (error) {
			console.warn("Failed to create view notification:", error);
		}
	}

	const userId = user?.id;
	const commentId = optionFromTOrFirst(searchParams.comment).pipe(
		Option.map(Comment.CommentId.make),
	);
	const replyId = optionFromTOrFirst(searchParams.reply).pipe(
		Option.map(Comment.CommentId.make),
	);
	const recordingStopped = hasRecordingStoppedParam(searchParams);

	// Fetch spaces data for the sharing dialog
	let spacesData = null;
	if (user) {
		try {
			const dashboardData = await getDashboardData(user);
			spacesData = dashboardData.spacesData;
		} catch (error) {
			console.error("Failed to fetch spaces data for sharing dialog:", error);
			spacesData = [];
		}
	}

	// Fetch shared spaces data for this video
	const sharedSpaces = await getSharedSpacesForVideo(videoId);
	const rules = resolveEffectiveVideoRules({
		videoSettings: video.videoSettings,
		organizationSettings: video.orgSettings,
		spaces: sharedSpaces.filter((space) => space.id !== space.organizationId),
	});
	const env = serverEnv();
	const transcriptionGenerationAvailable =
		!video.isScreenshot &&
		Boolean(env.DEEPGRAM_API_KEY) &&
		!rules.settings.disableTranscript;
	const aiProviderAvailable = Boolean(env.GROQ_API_KEY || env.OPENAI_API_KEY);

	let aiGenerationEnabled = false;
	const videoOwnerQuery = await db()
		.select({
			email: users.email,
			stripeSubscriptionStatus: users.stripeSubscriptionStatus,
			thirdPartyStripeSubscriptionId: users.thirdPartyStripeSubscriptionId,
		})
		.from(users)
		.where(eq(users.id, video.owner.id))
		.limit(1);

	if (videoOwnerQuery.length > 0 && videoOwnerQuery[0]) {
		const videoOwner = videoOwnerQuery[0];
		aiGenerationEnabled = await isAiGenerationEnabled(videoOwner);
	}

	if (
		transcriptionGenerationAvailable &&
		!hasActiveUpload &&
		video.transcriptionStatus !== "COMPLETE" &&
		video.transcriptionStatus !== "PROCESSING" &&
		video.transcriptionStatus !== "SKIPPED" &&
		video.transcriptionStatus !== "NO_AUDIO" &&
		video.transcriptionStatus !== "ERROR"
	) {
		console.log("[ShareVideoPage] Starting transcription for video:", videoId);
		transcribeVideo(videoId, video.owner.id, aiGenerationEnabled).catch(
			(error) => {
				console.error(
					`[ShareVideoPage] Error transcribing video ${videoId}:`,
					error,
				);
			},
		);
	}

	const currentMetadata = (video.metadata as VideoMetadata) || {};
	const metadata = currentMetadata;
	const aiGenerationStatus = metadata.aiGenerationStatus || null;

	const initialAiData = {
		title: metadata.aiTitle || null,
		summary: metadata.summary || null,
		chapters: metadata.chapters || null,
		aiGenerationStatus,
	};

	const screenshotImageUrl = video.isScreenshot
		? await Effect.flatMap(Videos, (videos) =>
				videos.getThumbnailURL(videoId),
			).pipe(Effect.map(Option.getOrNull), runPromise)
		: null;

	const customDomainPromise = (async () => {
		if (!user) {
			return { customDomain: null, domainVerified: false };
		}
		const activeOrganizationId = user.activeOrganizationId;
		if (!activeOrganizationId) {
			return { customDomain: null, domainVerified: false };
		}

		// Fetch the active org
		const orgArr = await db()
			.select({
				customDomain: organizations.customDomain,
				domainVerified: organizations.domainVerified,
			})
			.from(organizations)
			.where(eq(organizations.id, activeOrganizationId))
			.limit(1);

		const org = orgArr[0];
		if (
			org?.customDomain &&
			org.domainVerified !== null &&
			user.id === video.owner.id
		) {
			return { customDomain: org.customDomain, domainVerified: true };
		}
		return { customDomain: null, domainVerified: false };
	})();

	const sharedOrganizationsPromise = db()
		.select({ id: sharedVideos.organizationId, name: organizations.name })
		.from(sharedVideos)
		.innerJoin(organizations, eq(sharedVideos.organizationId, organizations.id))
		.where(eq(sharedVideos.videoId, videoId));

	const userOrganizationsPromise = (async () => {
		if (!userId) return [];

		const [ownedOrganizations, memberOrganizations] = await Promise.all([
			db()
				.select({ id: organizations.id, name: organizations.name })
				.from(organizations)
				.where(eq(organizations.ownerId, userId)),
			db()
				.select({ id: organizations.id, name: organizations.name })
				.from(organizations)
				.innerJoin(
					organizationMembers,
					eq(organizations.id, organizationMembers.organizationId),
				)
				.where(eq(organizationMembers.userId, userId)),
		]);

		const allOrganizations = [...ownedOrganizations, ...memberOrganizations];
		const uniqueOrganizationIds = new Set();

		return allOrganizations.filter((organization) => {
			if (uniqueOrganizationIds.has(organization.id)) return false;
			uniqueOrganizationIds.add(organization.id);
			return true;
		});
	})();

	const membersListPromise = video.sharedOrganization?.organizationId
		? db()
				.select({ userId: organizationMembers.userId })
				.from(organizationMembers)
				.where(
					eq(
						organizationMembers.organizationId,
						video.sharedOrganization.organizationId,
					),
				)
		: Promise.resolve([]);

	const commentsPromise = Effect.gen(function* () {
		const db = yield* Database;
		const imageUploads = yield* ImageUploads;

		let toplLevelCommentId = Option.none<Comment.CommentId>();

		if (Option.isSome(replyId)) {
			const [parentComment] = yield* db.use((db) =>
				db
					.select({ parentCommentId: comments.parentCommentId })
					.from(comments)
					.where(eq(comments.id, replyId.value))
					.limit(1),
			);
			toplLevelCommentId = Option.fromNullable(parentComment?.parentCommentId);
		}

		const commentToBringToTheTop = Option.orElse(
			toplLevelCommentId,
			() => commentId,
		);

		return yield* db
			.use((db) =>
				db
					.select({
						id: comments.id,
						content: comments.content,
						timestamp: comments.timestamp,
						type: comments.type,
						authorId: comments.authorId,
						videoId: comments.videoId,
						createdAt: comments.createdAt,
						updatedAt: comments.updatedAt,
						parentCommentId: comments.parentCommentId,
						authorName: users.name,
						authorImage: users.image,
					})
					.from(comments)
					.leftJoin(users, eq(comments.authorId, users.id))
					.where(eq(comments.videoId, videoId))
					.orderBy(
						Option.match(commentToBringToTheTop, {
							onSome: (commentId) =>
								sql`CASE WHEN ${comments.id} = ${commentId} THEN 0 ELSE 1 END, ${comments.createdAt}`,
							onNone: () => comments.createdAt,
						}),
					),
			)
			.pipe(
				Effect.map((comments) =>
					comments.map(
						Effect.fn(function* (c) {
							return Object.assign(c, {
								authorImage: yield* Option.fromNullable(c.authorImage).pipe(
									Option.map(imageUploads.resolveImageUrl),
									Effect.transposeOption,
									Effect.map(Option.getOrNull),
								),
							});
						}),
					),
				),
				Effect.flatMap(Effect.all),
			);
	}).pipe(EffectRuntime.runPromise);

	const viewsPromise = getVideoAnalytics(videoId).then((v) => v.count);

	const [
		membersList,
		userOrganizations,
		sharedOrganizations,
		{ customDomain, domainVerified },
	] = await Promise.all([
		membersListPromise,
		userOrganizationsPromise,
		sharedOrganizationsPromise,
		customDomainPromise,
	]);

	const canManageSharePageBranding = await (async () => {
		if (!userId) return false;

		const [organizationAccess] = await db()
			.select({
				ownerId: organizations.ownerId,
				memberRole: organizationMembers.role,
			})
			.from(organizations)
			.leftJoin(
				organizationMembers,
				and(
					eq(organizationMembers.organizationId, organizations.id),
					eq(organizationMembers.userId, userId),
				),
			)
			.where(
				and(
					eq(organizations.id, video.orgId),
					isNull(organizations.tombstoneAt),
				),
			)
			.limit(1);

		if (!organizationAccess) return false;

		return canManageOrganizationSettings(
			getEffectiveOrganizationRole({
				userId,
				ownerId: organizationAccess.ownerId,
				memberRole: organizationAccess.memberRole,
			}),
		);
	})();

	const videoWithOrganizationInfo = await Effect.gen(function* () {
		const imageUploads = yield* ImageUploads;

		return {
			...video,
			hasActiveUpload,
			owner: {
				id: video.owner.id,
				name: video.owner.name,
				isPro: userIsPro(video.owner),
				image: video.owner.image
					? yield* imageUploads.resolveImageUrl(video.owner.image)
					: null,
			},
			organization: {
				organizationMembers: membersList.map((member) => member.userId),
				organizationId: video.sharedOrganization?.organizationId ?? undefined,
			},
			sharedOrganizations: sharedOrganizations,
			password: null,
			folderId: null,
			orgSettings: video.orgSettings || null,
			organizationName: video.organizationName,
			organizationIconUrl: video.organizationIconUrl
				? yield* imageUploads.resolveImageUrl(video.organizationIconUrl)
				: null,
			shareableLinkIconUrl: video.shareableLinkIconUrl
				? yield* imageUploads.resolveImageUrl(video.shareableLinkIconUrl)
				: null,
			settings: rules.settings,
			hasInheritedPassword: rules.hasInheritedPassword,
			inheritedPasswordSources: rules.inheritedPasswordSources,
			inheritedSpaceSettings: rules.inheritedSettings,
		};
	}).pipe(runPromise);
	const isEditProcessing =
		isEditSourceKey({
			ownerId: video.owner.id,
			videoId,
			rawFileKey: video.activeUploadRawFileKey,
		}) && !video.isScreenshot;

	const defaultPlaybackSpeed = resolveDefaultPlaybackSpeed(
		video.videoSettings?.defaultPlaybackSpeed,
		video.orgSettings?.defaultPlaybackSpeed,
	);

	const isVideoDownloadReady =
		!hasActiveUpload && video.source?.type !== "desktopSegments";

	const canDownloadVideo =
		userId && isVideoDownloadReady
			? await canUserDownloadVideo({
					userId,
					ownerId: video.owner.id,
					videoId,
					orgId: video.orgId,
				})
			: false;

	let videoHasEdits = false;
	if (canDownloadVideo && !video.isScreenshot) {
		const [videoEditRow] = await db()
			.select({ editSpec: videoEdits.editSpec })
			.from(videoEdits)
			.where(eq(videoEdits.videoId, videoId));

		videoHasEdits = videoEditRow
			? !areEditSpecsEquivalent(
					videoEditRow.editSpec,
					createIdentityEditSpec(videoEditRow.editSpec.sourceDuration),
				)
			: false;
	}

	const uiLang = process.env.NEXT_PUBLIC_UI_LANGUAGE || "en";

	return (
		<>
			<div className="container flex-1 px-4 pb-8 mx-auto" data-ui-lang={uiLang}>
				<ShareHeader
					data={{
						...videoWithOrganizationInfo,
						createdAt: video.metadata?.customCreatedAt
							? new Date(video.metadata.customCreatedAt)
							: video.createdAt,
					}}
					customDomain={customDomain}
					domainVerified={domainVerified}
					sharedOrganizations={
						videoWithOrganizationInfo.sharedOrganizations || []
					}
					sharedSpaces={sharedSpaces}
					userOrganizations={userOrganizations}
					spacesData={spacesData}
					branding={getSharePageBranding(videoWithOrganizationInfo)}
					canManageSharePageBranding={canManageSharePageBranding}
					canDownload={canDownloadVideo}
					hasEdits={videoHasEdits}
				/>

				<Share
					data={videoWithOrganizationInfo}
					screenshotImageUrl={screenshotImageUrl}
					videoSettings={videoWithOrganizationInfo.settings}
					comments={commentsPromise}
					views={viewsPromise}
					customDomain={customDomain}
					domainVerified={domainVerified}
					userOrganizations={userOrganizations}
					viewerId={user?.id ?? null}
					isEditProcessing={isEditProcessing}
					recordingStopped={recordingStopped}
					defaultPlaybackSpeed={defaultPlaybackSpeed}
					initialAiData={initialAiData}
					aiGenerationAvailable={aiGenerationEnabled && aiProviderAvailable}
					transcriptionGenerationAvailable={transcriptionGenerationAvailable}
				/>
			</div>
			<div className="py-4 mt-auto">
				<div className="flex flex-col justify-center items-center gap-3 mx-auto mb-2 w-fit">
					<a
						target="_blank"
						href="https://cap.so"
						rel="noopener"
						className="flex justify-center items-center px-4 py-2 mx-auto space-x-2 bg-white rounded-full border border-gray-5 w-fit"
					>
						<span className="text-sm">{t("share.recordedWith")}</span>
						<Logo className="w-14 h-auto" />
					</a>
					<div className="flex items-center gap-3 text-xs text-gray-9">
						<a
							href="https://oaris.de/impressum"
							target="_blank"
							rel="noopener"
							className="hover:text-gray-12 transition-colors"
						>
							Impressum
						</a>
						<span>·</span>
						<a
							href="https://oaris.de/datenschutz"
							target="_blank"
							rel="noopener"
							className="hover:text-gray-12 transition-colors"
						>
							Datenschutz
						</a>
						<span>·</span>
						<a
							href="https://oaris.de/kontakt"
							target="_blank"
							rel="noopener"
							className="hover:text-gray-12 transition-colors"
						>
							Kontakt
						</a>
					</div>
				</div>
			</div>
		</>
	);
}
