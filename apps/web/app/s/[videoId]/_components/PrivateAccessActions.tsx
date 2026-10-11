"use client";

import { Button } from "@cap/ui";
import type { Video } from "@cap/web-domain";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useCurrentUser } from "@/app/Layout/AuthContext";
import { t, tParam } from "@/lib/translations";

export function PrivateAccessActions({ videoId }: { videoId: Video.VideoId }) {
	const user = useCurrentUser();
	const next = encodeURIComponent(`/s/${videoId}`);
	const loginUrl = `/login?next=${next}`;

	if (user) {
		return (
			<div className="space-y-3">
				<p>{tParam("share.signedInAs", { email: user.email ?? "" })}</p>
				<Button
					variant="dark"
					onClick={() => signOut({ callbackUrl: loginUrl })}
				>
					{t("share.switchAccount")}
				</Button>
			</div>
		);
	}

	return (
		<p>
			{t("share.privateAccessBefore")}
			<Link href={loginUrl}>{t("share.signIn")}</Link>
			{t("share.privateAccessBetween")}
			<Link href={`/signup?next=${next}`}>{t("share.createAccount")}</Link>
			{t("share.privateAccessAfter")}
		</p>
	);
}
