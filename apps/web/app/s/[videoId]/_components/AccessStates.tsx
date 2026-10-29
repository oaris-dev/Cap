"use client";

import { buildEnv } from "@cap/env";
import type { Video } from "@cap/web-domain";
import { signOut } from "next-auth/react";
import { useCurrentUser } from "@/app/Layout/AuthContext";
import {
	EnvelopeDoodle,
	KeyDoodle,
	LockDoodle,
} from "@/components/paper-state/doodles";
import {
	PaperActions,
	PaperState,
	paperStateStyles as styles,
} from "@/components/paper-state/PaperState";
import { t } from "@/lib/translations";

const accessUrls = (videoId: Video.VideoId) => {
	const next = encodeURIComponent(`/s/${videoId}`);
	return {
		login: `/login?next=${next}`,
		signup: `/signup?next=${next}`,
	};
};

function SwitchAccountButton({ loginUrl }: { loginUrl: string }) {
	return (
		<button
			type="button"
			className={styles.cta}
			onClick={() => signOut({ callbackUrl: loginUrl })}
		>
			{t("share.switchAccount")}
		</button>
	);
}

export function PrivateVideoState({ videoId }: { videoId: Video.VideoId }) {
	const user = useCurrentUser();
	const urls = accessUrls(videoId);

	if (user) {
		return (
			<PaperState
				homeHref={buildEnv.NEXT_PUBLIC_WEB_URL}
				doodle={<LockDoodle />}
				title={t("share.videoPrivate")}
				lede={
					<>
						{t("access.signedInNoAccessBefore")}
						<strong>{user.email}</strong>
						{t("access.signedInNoAccessAfter")}
					</>
				}
			>
				<PaperActions>
					<SwitchAccountButton loginUrl={urls.login} />
					<a
						className={`${styles.cta} ${styles.ghost}`}
						href={`${buildEnv.NEXT_PUBLIC_WEB_URL}/dashboard`}
					>
						{t("access.goToMyVideos")}
					</a>
				</PaperActions>
			</PaperState>
		);
	}

	return (
		<PaperState
			homeHref={buildEnv.NEXT_PUBLIC_WEB_URL}
			doodle={<LockDoodle />}
			title={t("share.videoPrivate")}
			lede={t("access.privateLede")}
		>
			<PaperActions>
				<a className={styles.cta} href={urls.login}>
					{t("access.signIn")}
				</a>
				<a className={`${styles.cta} ${styles.ghost}`} href={urls.signup}>
					{t("access.createAccount")}
				</a>
			</PaperActions>
		</PaperState>
	);
}

export function SignInRequiredState({ videoId }: { videoId: Video.VideoId }) {
	return (
		<PaperState
			homeHref={buildEnv.NEXT_PUBLIC_WEB_URL}
			doodle={<KeyDoodle />}
			title={t("access.signInRequiredTitle")}
			lede={t("access.signInRequiredLede")}
		>
			<PaperActions>
				<a className={styles.cta} href={accessUrls(videoId).login}>
					{t("access.signIn")}
				</a>
			</PaperActions>
		</PaperState>
	);
}

export function AccessRestrictedState({ videoId }: { videoId: Video.VideoId }) {
	const user = useCurrentUser();

	return (
		<PaperState
			homeHref={buildEnv.NEXT_PUBLIC_WEB_URL}
			doodle={<EnvelopeDoodle />}
			title={t("access.restrictedTitle")}
			lede={
				user ? (
					<>
						<strong>{user.email}</strong>
						{t("access.restrictedLedeAfterEmail")}
					</>
				) : (
					t("access.restrictedLede")
				)
			}
		>
			<PaperActions>
				<SwitchAccountButton loginUrl={accessUrls(videoId).login} />
			</PaperActions>
		</PaperState>
	);
}
