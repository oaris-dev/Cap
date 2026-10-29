import { buildEnv } from "@cap/env";
import { SearchDoodle } from "@/components/paper-state/doodles";
import {
	PaperActions,
	PaperState,
	paperStateStyles as styles,
} from "@/components/paper-state/PaperState";
import { t } from "@/lib/translations";

export default function VideoNotFound() {
	const homeHref = buildEnv.NEXT_PUBLIC_WEB_URL;

	return (
		<PaperState
			homeHref={homeHref}
			doodle={<SearchDoodle />}
			title={t("access.notFoundTitle")}
			lede={t("access.notFoundLede")}
			footnote={
				<>
					{/* Fork: upstream points at Cap's own support inbox. */}
					{t("access.notFoundFootnote")}{" "}
					<a href="https://oaris.de/kontakt">{t("access.contactUs")}</a>
				</>
			}
		>
			<PaperActions>
				<a className={styles.cta} href={homeHref}>
					{t("access.goHome")}
				</a>
			</PaperActions>
		</PaperState>
	);
}
