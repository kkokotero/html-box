import type { NormalizedPadding } from "./internal-types";
import type { Point, Rect, SafeZoneMode, ZoneGeometry } from "./types";

/** Creates a rectangle from its viewport edges. */
export function toRect(
	left: number,
	top: number,
	right: number,
	bottom: number,
): Rect {
	return {
		left,
		top,
		right,
		bottom,
		width: right - left,
		height: bottom - top,
	};
}

/** Expands a rectangle by normalized edge padding. */
export function inflate(rect: Rect, padding: NormalizedPadding): Rect {
	let left = rect.left - padding.left;
	let right = rect.right + padding.right;
	let top = rect.top - padding.top;
	let bottom = rect.bottom + padding.bottom;
	if (right < left) left = right = (left + right) / 2;
	if (bottom < top) top = bottom = (top + bottom) / 2;
	return toRect(left, top, right, bottom);
}

/** Returns the four corners of an axis-aligned rectangle. */
export function corners(rect: Rect): Point[] {
	return [
		{ x: rect.left, y: rect.top },
		{ x: rect.right, y: rect.top },
		{ x: rect.right, y: rect.bottom },
		{ x: rect.left, y: rect.bottom },
	];
}

const crossProduct = (origin: Point, first: Point, second: Point): number =>
	(first.x - origin.x) * (second.y - origin.y) -
	(first.y - origin.y) * (second.x - origin.x);

const rectContainsPoint = (rect: Rect, x: number, y: number): boolean =>
	x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

const rectanglesOverlap = (first: Rect, second: Rect): boolean =>
	first.left <= second.right &&
	first.right >= second.left &&
	first.top <= second.bottom &&
	first.bottom >= second.top;

/** Returns the smallest rectangle containing all input rectangles. */
export function boundsOf(rectangles: readonly Rect[]): Rect | null {
	if (rectangles.length === 0) return null;
	let left = Infinity;
	let top = Infinity;
	let right = -Infinity;
	let bottom = -Infinity;
	for (const rect of rectangles) {
		if (rect.left < left) left = rect.left;
		if (rect.top < top) top = rect.top;
		if (rect.right > right) right = rect.right;
		if (rect.bottom > bottom) bottom = rect.bottom;
	}
	return toRect(left, top, right, bottom);
}

/** Builds one side of a monotone-chain convex hull. */
function buildHull(points: Point[]): Point[] {
	const hull: Point[] = [];
	for (const point of points) {
		while (
			hull.length >= 2 &&
			crossProduct(hull[hull.length - 2]!, hull[hull.length - 1]!, point) <= 0
		)
			hull.pop();
		hull.push(point);
	}
	hull.pop();
	return hull;
}

/** Computes the convex hull of points using the monotone-chain algorithm. */
export function convexHull(points: Point[]): Point[] {
	const sorted = points.toSorted(
		(first, second) => first.x - second.x || first.y - second.y,
	);
	const unique = sorted.filter(
		(point, index) =>
			index === 0 ||
			point.x !== sorted[index - 1]!.x ||
			point.y !== sorted[index - 1]!.y,
	);
	if (unique.length < 3) return unique;
	return buildHull(unique).concat(buildHull(unique.toReversed()));
}

function pointInConvexPolygon(
	polygon: readonly Point[],
	x: number,
	y: number,
): boolean {
	let orientation = 0;
	for (let index = 0; index < polygon.length; index++) {
		const first = polygon[index]!;
		const second = polygon[(index + 1) % polygon.length]!;
		const cross =
			(second.x - first.x) * (y - first.y) -
			(second.y - first.y) * (x - first.x);
		if (cross !== 0) {
			const current = cross > 0 ? 1 : -1;
			if (orientation === 0) orientation = current;
			else if (current !== orientation) return false;
		}
	}
	return true;
}

/** Tests a convex polygon against a rectangle using the separating-axis theorem. */
function convexPolygonIntersectsRect(
	polygon: readonly Point[],
	rect: Rect,
): boolean {
	const rectCorners = corners(rect);
	for (let index = 0; index < polygon.length; index++) {
		const first = polygon[index]!;
		const second = polygon[(index + 1) % polygon.length]!;
		const normalX = -(second.y - first.y);
		const normalY = second.x - first.x;
		let polygonMin = Infinity;
		let polygonMax = -Infinity;
		for (const point of polygon) {
			const projection = point.x * normalX + point.y * normalY;
			if (projection < polygonMin) polygonMin = projection;
			if (projection > polygonMax) polygonMax = projection;
		}
		let rectMin = Infinity;
		let rectMax = -Infinity;
		for (const point of rectCorners) {
			const projection = point.x * normalX + point.y * normalY;
			if (projection < rectMin) rectMin = projection;
			if (projection > rectMax) rectMax = projection;
		}
		if (polygonMax < rectMin || rectMax < polygonMin) return false;
	}
	return true;
}

/** Tests whether a point belongs to a measured zone. */
export function pointInZone(
	geometry: ZoneGeometry,
	x: number,
	y: number,
): boolean {
	if (!geometry.bounds || !rectContainsPoint(geometry.bounds, x, y))
		return false;
	if (geometry.shape === "bounds") return true;
	if (geometry.shape === "union")
		return geometry.rects.some((rect) => rectContainsPoint(rect, x, y));
	return geometry.hull.length < 3 || pointInConvexPolygon(geometry.hull, x, y);
}

function rectIntersectsZone(geometry: ZoneGeometry, rect: Rect): boolean {
	if (!geometry.bounds || !rectanglesOverlap(geometry.bounds, rect))
		return false;
	if (geometry.shape === "bounds") return true;
	if (geometry.shape === "union")
		return geometry.rects.some((zoneRect) => rectanglesOverlap(zoneRect, rect));
	return (
		geometry.hull.length < 3 || convexPolygonIntersectsRect(geometry.hull, rect)
	);
}

/** Geometric source representation used by SafeZone evaluation. */
export type Subject =
	| { kind: "point"; point: Point }
	| { kind: "rect"; rect: Rect };

/** Tests whether a point or rectangle satisfies the configured zone mode. */
export function isInside(
	geometry: ZoneGeometry,
	subject: Subject,
	mode: SafeZoneMode,
): boolean {
	if (subject.kind === "point")
		return pointInZone(geometry, subject.point.x, subject.point.y);
	const rect = subject.rect;
	switch (mode) {
		case "center":
			return pointInZone(
				geometry,
				(rect.left + rect.right) / 2,
				(rect.top + rect.bottom) / 2,
			);
		case "contain":
			return corners(rect).every((point) =>
				pointInZone(geometry, point.x, point.y),
			);
		default:
			return rectIntersectsZone(geometry, rect);
	}
}
