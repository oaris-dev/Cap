"use client";

import { buildEnv } from "@cap/env";
import type { Video } from "@cap/web-domain";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { verifyVideoPassword } from "@/actions/videos/password";
import { PasswordDoodle } from "@/components/paper-state/doodles";
import {
	PaperState,
	paperStateStyles as styles,
} from "@/components/paper-state/PaperState";
import { t } from "@/lib/translations";

export function PasswordGate({ videoId }: { videoId: Video.VideoId }) {
	const [password, setPassword] = useState("");
	const router = useRouter();

	const verifyPassword = useMutation({
		mutationFn: () =>
			verifyVideoPassword(videoId, password).then((v) => {
				if (v.success) return v.value;
				throw new Error(v.error);
			}),
		onSuccess: () => router.refresh(),
	});

	const failed = verifyPassword.isError;
	const busy = verifyPassword.isPending || verifyPassword.isSuccess;

	return (
		<PaperState
			homeHref={buildEnv.NEXT_PUBLIC_WEB_URL}
			doodle={<PasswordDoodle />}
			title={t("access.passwordTitle")}
			lede={t("access.passwordLede")}
		>
			<form
				className={styles.form}
				onSubmit={(event) => {
					event.preventDefault();
					if (!busy && password.trim()) verifyPassword.mutate();
				}}
			>
				<input
					className={styles.input}
					type="password"
					aria-label={t("password.label")}
					placeholder={t("password.label")}
					autoComplete="current-password"
					value={password}
					aria-invalid={failed}
					onChange={(event) => {
						setPassword(event.target.value);
						if (failed) verifyPassword.reset();
					}}
					// biome-ignore lint/a11y/noAutofocus: the password is the only thing to do on this page
					autoFocus
				/>
				<button
					type="submit"
					className={styles.cta}
					disabled={busy || !password.trim()}
				>
					{busy ? t("access.passwordChecking") : t("access.passwordSubmit")}
				</button>
				{failed && (
					<p className={styles.error} role="alert">
						{t("access.passwordWrong")}
					</p>
				)}
			</form>
		</PaperState>
	);
}
