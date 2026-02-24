"use client";

import type { userSelectProps } from "@cap/database/auth/session";
import type { comments as commentsSchema, videos } from "@cap/database/schema";
import { NODE_ENV } from "@cap/env";
import { AnimatePresence, motion } from "framer-motion";
import { useTranscript } from "hooks/use-transcript";
import {
	forwardRef,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { CapVideoPlayer } from "@/app/s/[videoId]/_components/CapVideoPlayer";
import { HLSVideoPlayer } from "@/app/s/[videoId]/_components/HLSVideoPlayer";
import {
	formatChaptersAsVTT,
	formatTranscriptAsVTT,
	parseVTT,
	type TranscriptEntry,
} from "@/app/s/[videoId]/_components/utils/transcript-utils";
import { OarisLogo } from "@/components/OarisLogo";

declare global {
	interface Window {
		MSStream: any;
	}
}

type CommentWithAuthor = typeof commentsSchema.$inferSelect & {
	authorName: string | null;
};

export const EmbedVideo = forwardRef<
	HTMLVideoElement,
	{
		data: Omit<typeof videos.$inferSelect, "password"> & {
			hasActiveUpload: boolean | undefined;
		};
		user: typeof userSelectProps | null;
		comments: CommentWithAuthor[];
		chapters?: { title: string; start: number }[];
		ownerName?: string | null;
		autoplay?: boolean;
	}
>(
	(
		{ data, user, comments, chapters = [], autoplay = false },
		ref,
	) => {
		const videoRef = useRef<HTMLVideoElement>(null);
		useImperativeHandle(ref, () => videoRef.current as HTMLVideoElement);

		const [transcriptData, setTranscriptData] = useState<TranscriptEntry[]>([]);
		const [isPlaying, setIsPlaying] = useState(false);
		const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null);
		const [chaptersUrl, setChaptersUrl] = useState<string | null>(null);

		const { data: transcriptContent, error: transcriptError } = useTranscript(
			data.id,
			data.transcriptionStatus,
		);

		useEffect(() => {
			if (transcriptContent) {
				const parsed = parseVTT(transcriptContent);
				setTranscriptData(parsed);
			} else if (transcriptError) {
				console.error(
					"[Transcript] Transcript error from React Query:",
					transcriptError.message,
				);
			}
		}, [transcriptContent, transcriptError]);

		useEffect(() => {
			if (
				data.transcriptionStatus === "COMPLETE" &&
				transcriptData &&
				transcriptData.length > 0
			) {
				const vttContent = formatTranscriptAsVTT(transcriptData);
				const blob = new Blob([vttContent], { type: "text/vtt" });
				const newUrl = URL.createObjectURL(blob);
				setSubtitleUrl((prev) => {
					if (prev) URL.revokeObjectURL(prev);
					return newUrl;
				});
				return () => {
					URL.revokeObjectURL(newUrl);
				};
			}
			setSubtitleUrl((prev) => {
				if (prev) URL.revokeObjectURL(prev);
				return null;
			});
		}, [data.transcriptionStatus, transcriptData]);

		useEffect(() => {
			if (chapters?.length > 0) {
				const vttContent = formatChaptersAsVTT(chapters);
				const blob = new Blob([vttContent], { type: "text/vtt" });
				const newUrl = URL.createObjectURL(blob);
				setChaptersUrl((prev) => {
					if (prev) URL.revokeObjectURL(prev);
					return newUrl;
				});
				return () => {
					URL.revokeObjectURL(newUrl);
				};
			}
			setChaptersUrl((prev) => {
				if (prev) URL.revokeObjectURL(prev);
				return null;
			});
		}, [chapters]);

		const isMp4Source =
			data.source.type === "desktopMP4" || data.source.type === "webMP4";
		let videoSrc: string;
		let enableCrossOrigin = false;

		if (isMp4Source) {
			videoSrc = `/api/playlist?userId=${data.ownerId}&videoId=${data.id}&videoType=mp4`;
			enableCrossOrigin = true;
		} else if (
			NODE_ENV === "development" ||
			((data.skipProcessing === true || data.jobStatus !== "COMPLETE") &&
				data.source.type === "MediaConvert")
		) {
			videoSrc = `/api/playlist?userId=${data.ownerId}&videoId=${data.id}&videoType=master`;
		} else if (data.source.type === "MediaConvert") {
			videoSrc = `/api/playlist?userId=${data.ownerId}&videoId=${data.id}&videoType=video`;
		} else {
			videoSrc = `/api/playlist?userId=${data.ownerId}&videoId=${data.id}&videoType=video`;
		}

		useEffect(() => {
			if (!videoRef.current) return;
			const player = videoRef.current;

			const listener = (arg: boolean) => {
				setIsPlaying(arg);
			};
			player.addEventListener("play", () => listener(true));
			player.addEventListener("pause", () => listener(false));
			return () => {
				player.removeEventListener("play", () => listener(true));
				player.removeEventListener("pause", () => listener(false));
			};
		}, []);

		return (
			<div className="flex flex-col w-screen h-screen bg-black">
				<div className="relative flex-1 min-h-0">
					{isMp4Source ? (
						<CapVideoPlayer
							videoId={data.id}
							mediaPlayerClassName="w-full h-full"
							videoSrc={videoSrc}
							chaptersSrc={chaptersUrl || ""}
							captionsSrc={subtitleUrl || ""}
							videoRef={videoRef}
							enableCrossOrigin={enableCrossOrigin}
							hasActiveUpload={data.hasActiveUpload}
						/>
					) : (
						<HLSVideoPlayer
							videoId={data.id}
							mediaPlayerClassName="w-full h-full"
							videoSrc={videoSrc}
							chaptersSrc={chaptersUrl || ""}
							captionsSrc={subtitleUrl || ""}
							videoRef={videoRef}
							hasActiveUpload={data.hasActiveUpload}
						/>
					)}

					<AnimatePresence>
						{!isPlaying && (
							<motion.a
								href={`/s/${data.id}`}
								rel="noopener noreferrer"
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: 10 }}
								transition={{ duration: 0.3, delay: 0.2 }}
								onClick={(e) => e.stopPropagation()}
								className="absolute top-3 left-3 z-10 bg-black/50 backdrop-blur-md rounded-lg px-3 py-1.5 border border-white/10 shadow-2xl"
							>
								<h1 className="text-xs sm:text-sm font-semibold leading-tight text-white truncate max-w-[200px] sm:max-w-[400px] hover:underline">
									{data.name}
								</h1>
							</motion.a>
						)}
					</AnimatePresence>
				</div>

				<div className="flex items-center justify-between px-3 py-2 bg-white flex-none">
					<a
						href={`/s/${data.id}`}
						rel="noopener noreferrer"
						className="min-w-0 flex-1 mr-4"
					>
						<p className="text-xs sm:text-sm font-medium text-gray-900 truncate hover:underline">
							{data.name}
						</p>
					</a>
					<a
						href={`/s/${data.id}`}
						rel="noopener noreferrer"
						className="flex-shrink-0 text-gray-500 hover:text-gray-900 transition-colors"
					>
						<OarisLogo className="w-auto h-3.5" />
					</a>
				</div>
			</div>
		);
	},
);
