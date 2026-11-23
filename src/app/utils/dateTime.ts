const DHAKA_TIME_ZONE = "Asia/Dhaka";

export const getDateKeyInDhaka = (date: Date): string => {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: DHAKA_TIME_ZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date);

	const values = Object.fromEntries(
		parts
			.filter((part) => part.type !== "literal")
			.map((part) => [part.type, part.value]),
	);

	return `${values.year}-${values.month}-${values.day}`;
};

export const isSameDhakaDay = (first: Date, second: Date): boolean =>
	getDateKeyInDhaka(first) === getDateKeyInDhaka(second);

export const getDhakaDayBounds = (date: Date) => {
	const [year, month, day] = getDateKeyInDhaka(date)
		.split("-")
		.map(Number);

	const start = new Date(Date.UTC(year, month - 1, day, -6, 0, 0));
	const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

	return { start, end };
};
