import type { Box } from "./internal-types";
import type {
	MoveCause,
	Off,
	Position,
	Side,
	Size,
	Subscription,
} from "./types";

export const noop: Off = () => {};
export const EVENT_NAMES: ReadonlySet<string> = new Set([
	"resize",
	"move",
	"enter",
	"leave",
]);
const EPSILON = 0.01;
export const RATIO_TOLERANCE = 1e-3;

export const CAUSE_PRIORITY: Record<MoveCause, number> = {
	update: 0,
	poll: 1,
	resize: 2,
	scroll: 3,
};

export const sameSize = (a: Size, b: Size): boolean =>
	Math.abs(a.width - b.width) < EPSILON &&
	Math.abs(a.height - b.height) < EPSILON;

export const samePoint = (a: Position, b: Position): boolean =>
	Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON;

export const isElement = (value: unknown): value is Element =>
	typeof Element !== "undefined" && value instanceof Element;

export const inactive = (name: string): Subscription => ({
	name,
	active: false,
	cancel: noop,
});

export function raf(callback: () => void): Off {
	if (typeof requestAnimationFrame === "function") {
		const id = requestAnimationFrame(() => callback());
		return () => cancelAnimationFrame(id);
	}
	const id = setTimeout(callback, 16);
	return () => clearTimeout(id);
}

export function windowBox(): Box {
	const root = document.documentElement;
	const width = window.innerWidth || root.clientWidth;
	const height = window.innerHeight || root.clientHeight;
	return { left: 0, top: 0, right: width, bottom: height, width, height };
}

/** Synchronous visibility estimate that ignores overflow clipping and root margin. */
export function estimateVisibility(rect: Box): {
	visible: boolean;
	ratio: number;
} {
	const view = windowBox();
	const ix = Math.max(
		0,
		Math.min(rect.right, view.right) - Math.max(rect.left, view.left),
	);
	const iy = Math.max(
		0,
		Math.min(rect.bottom, view.bottom) - Math.max(rect.top, view.top),
	);
	const area = rect.width * rect.height;
	if (area > 0) {
		const ratio = (ix * iy) / area;
		return { visible: ratio > 0, ratio };
	}
	const inside =
		rect.left >= view.left &&
		rect.left <= view.right &&
		rect.top >= view.top &&
		rect.top <= view.bottom;
	return { visible: inside, ratio: inside ? 1 : 0 };
}

/** Returns the viewport edge with the greatest element overflow. */
export function sideOf(rect: Box, bounds: Box): Side | null {
	const overflow: Record<Side, number> = {
		top: Math.max(0, bounds.top - rect.top),
		bottom: Math.max(0, rect.bottom - bounds.bottom),
		left: Math.max(0, bounds.left - rect.left),
		right: Math.max(0, rect.right - bounds.right),
	};
	let best: Side | null = null;
	let max = 0;
	let tie = false;
	for (const side of ["top", "bottom", "left", "right"] as const) {
		if (overflow[side] > max) {
			max = overflow[side];
			best = side;
			tie = false;
		} else if (overflow[side] === max && max > 0) {
			tie = true;
		}
	}
	return tie ? null : best;
}
