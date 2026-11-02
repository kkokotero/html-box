import type { Ratio, Subscription } from "./types";

export const noop = (): void => {};

export const hasWindow = (): boolean => typeof window !== "undefined";

export const media = (query: string): boolean =>
	typeof matchMedia === "function" && matchMedia(query).matches;

export function reportUncaught(error: unknown): void {
	const report = (globalThis as { reportError?: (e: unknown) => void })
		.reportError;
	if (typeof report === "function") {
		report.call(globalThis, error);
		return;
	}
	setTimeout(() => {
		throw error;
	});
}

export function randomId(): string {
	try {
		return crypto.randomUUID();
	} catch {
		return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
	}
}

export const inactive = (name: string): Subscription => ({
	name,
	active: false,
	cancel: noop,
});

const KNOWN_RATIOS: readonly (readonly [number, number])[] = [
	[16, 9],
	[16, 10],
	[4, 3],
	[3, 2],
	[21, 9],
	[32, 9],
	[5, 4],
	[1, 1],
	[2, 1],
	[19.5, 9],
	[20, 9],
];

/** Calculates the aspect ratio, label, and orientation for a width and height. */
export function ratioOf(width: number, height: number): Ratio {
	if (!(width > 0) || !(height > 0))
		return { value: 0, label: "0:0", orientation: "square" };
	const value = width / height;
	const orientation =
		Math.abs(width - height) < 1
			? "square"
			: width > height
				? "landscape"
				: "portrait";
	const landscape = Math.max(value, 1 / value);

	const portrait = orientation === "portrait";
	let label = portrait
		? `1:${landscape.toFixed(2)}`
		: `${landscape.toFixed(2)}:1`;
	for (const [w, h] of KNOWN_RATIOS) {
		if (Math.abs(landscape - w / h) / (w / h) <= 0.015) {
			label = portrait ? `${h}:${w}` : `${w}:${h}`;
			break;
		}
	}
	return { value, label, orientation };
}

/** Lazy event emitter that notifies its owner when subscribers change. */
