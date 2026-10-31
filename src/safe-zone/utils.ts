import { toRect } from "./geometry";
import type { NormalizedPadding } from "./internal-types";
import {
	SafeZoneError,
	SafeZoneErrorCode,
	type SafeZoneDisposer,
	type Padding,
	type Rect,
	type SafeZoneTarget,
} from "./types";

/** Reads the viewport rectangle of a connected, visible element. */
export function readRect(element: Element): Rect | null {
	if (!element.isConnected) return null;
	const rect = element.getBoundingClientRect();
	// A zero-sized rectangle at the origin usually means `display: none`.
	if (
		rect.width === 0 &&
		rect.height === 0 &&
		rect.left === 0 &&
		rect.top === 0
	)
		return null;
	return toRect(rect.left, rect.top, rect.right, rect.bottom);
}

/** Validates one padding edge and falls back to zero. */
function normalizePaddingValue(
	value: number | undefined,
	edge: string,
): number {
	const normalized = value ?? 0;
	if (!Number.isFinite(normalized)) {
		throw new SafeZoneError(
			SafeZoneErrorCode.InvalidOption,
			`Option padding.${edge} must be a finite number.`,
		);
	}
	return normalized;
}

/** Expands uniform or per-edge padding into normalized edge values. */
export function normalizePadding(
	padding: Padding | undefined,
): NormalizedPadding {
	if (typeof padding === "number") {
		const value = normalizePaddingValue(padding, "value");
		return { top: value, right: value, bottom: value, left: value };
	}
	return {
		top: normalizePaddingValue(padding?.top, "top"),
		right: normalizePaddingValue(padding?.right, "right"),
		bottom: normalizePaddingValue(padding?.bottom, "bottom"),
		left: normalizePaddingValue(padding?.left, "left"),
	};
}

/** Validates a non-negative finite duration. */
export function normalizeDelay(
	value: number | undefined,
	label: string,
): number {
	const normalized = value ?? 0;
	if (!Number.isFinite(normalized) || normalized < 0) {
		throw new SafeZoneError(
			SafeZoneErrorCode.InvalidOption,
			`Option ${label} must be a non-negative finite number.`,
		);
	}
	return normalized;
}

/** Schedules work on the next animation frame or a timer fallback. */
export function raf(callback: () => void): SafeZoneDisposer {
	if (typeof requestAnimationFrame === "function") {
		const id = requestAnimationFrame(callback);
		return () => cancelAnimationFrame(id);
	}
	const id = setTimeout(callback, 16);
	return () => clearTimeout(id);
}

/** Checks whether a value is an element in the current DOM realm. */
export const isElement = (value: unknown): value is Element =>
	typeof Element !== "undefined" && value instanceof Element;

/** Normalizes one target or validates an iterable of target elements. */
export function toElements(target: SafeZoneTarget): Element[] {
	if (target === null || target === undefined) return [];
	const elements = isElement(target)
		? [target]
		: [...(target as Iterable<unknown>)];
	for (const element of elements) {
		if (!isElement(element)) {
			throw new SafeZoneError(
				SafeZoneErrorCode.InvalidTarget,
				"Target must be an Element or an iterable of Elements.",
			);
		}
	}
	return elements as Element[];
}
