import { getUiLanguage, t, tParam } from "@/lib/translations";

export const formatTimestamp = (date: Date) => {
	const locale = getUiLanguage() === "de" ? "de-DE" : "en-US";
	return new Intl.DateTimeFormat(locale, {
		hour: "numeric",
		minute: "numeric",
		hour12: locale === "en-US",
		year: "numeric",
		month: "long",
		day: "numeric",
	}).format(date);
};

export const formatTimeAgo = (date: Date) => {
	const now = new Date();
	const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

	if (diffInSeconds < 60) return t("time.now");

	const diffInMinutes = Math.floor(diffInSeconds / 60);
	if (diffInMinutes < 60)
		return tParam("time.minutesAgo", { n: diffInMinutes });

	const diffInHours = Math.floor(diffInMinutes / 60);
	if (diffInHours < 24) return tParam("time.hoursAgo", { n: diffInHours });

	const diffInDays = Math.floor(diffInHours / 24);
	if (diffInDays < 30) return tParam("time.daysAgo", { n: diffInDays });

	const diffInMonths = Math.floor(diffInDays / 30);
	if (diffInMonths < 12) return tParam("time.monthsAgo", { n: diffInMonths });

	const diffInYears = Math.floor(diffInDays / 365);
	return tParam("time.yearsAgo", { n: diffInYears });
};
