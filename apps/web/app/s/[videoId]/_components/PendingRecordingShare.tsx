"use client";

import { buildEnv } from "@cap/env";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RecordingDoodle } from "@/components/paper-state/doodles";
import {
	PaperActions,
	PaperState,
	paperStateStyles as styles,
} from "@/components/paper-state/PaperState";
import { t } from "@/lib/translations";

const MAX_REFRESH_ATTEMPTS = 30;
const REFRESH_INTERVAL_MS = 2000;

export function PendingRecordingShare() {
	const router = useRouter();
	const [hasTimedOut, setHasTimedOut] = useState(false);

	useEffect(() => {
		let refreshCount = 0;
		router.refresh();

		const interval = window.setInterval(() => {
			refreshCount += 1;

			if (refreshCount >= MAX_REFRESH_ATTEMPTS) {
				setHasTimedOut(true);
				window.clearInterval(interval);
				return;
			}

			router.refresh();
		}, REFRESH_INTERVAL_MS);

		return () => window.clearInterval(interval);
	}, [router]);

	return (
		<PaperState
			homeHref={buildEnv.NEXT_PUBLIC_WEB_URL}
			doodle={<RecordingDoodle />}
			title={
				hasTimedOut
					? t("access.stillPreparingTitle")
					: t("access.preparingTitle")
			}
			lede={
				hasTimedOut ? t("access.stillPreparingLede") : t("access.preparingLede")
			}
		>
			{hasTimedOut && (
				<PaperActions>
					<button
						type="button"
						className={styles.cta}
						onClick={() => window.location.reload()}
					>
						Reload page
					</button>
				</PaperActions>
			)}
		</PaperState>
	);
}
