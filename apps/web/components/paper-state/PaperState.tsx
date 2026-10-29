import type { ReactNode } from "react";
import { OarisLogo } from "@/components/OarisLogo";
import styles from "./paper-state.module.css";

export const paperStateStyles = styles;

export function PaperState({
	doodle,
	title,
	lede,
	children,
	footnote,
	homeHref = "/",
}: {
	doodle: ReactNode;
	title: ReactNode;
	lede?: ReactNode;
	children?: ReactNode;
	footnote?: ReactNode;
	homeHref?: string;
}) {
	return (
		<div className={`${styles.page} font-lexend`}>
			<header className={styles.brand}>
				<a href={homeHref} className={styles.brandLink}>
					{/* Fork: oaris mark, not Cap's wordmark. */}
					<OarisLogo className="h-7 w-auto" />
				</a>
			</header>
			<main className={styles.stage}>
				{doodle}
				<h1 className={`${styles.title} font-league-spartan`}>{title}</h1>
				{lede && <p className={styles.lede}>{lede}</p>}
				{children}
			</main>
			{footnote && <p className={styles.footnote}>{footnote}</p>}
		</div>
	);
}

export function PaperActions({ children }: { children: ReactNode }) {
	return <div className={styles.actions}>{children}</div>;
}
