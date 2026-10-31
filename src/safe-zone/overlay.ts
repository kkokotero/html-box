import type { Point, Rect, VisualizeOptions, ZoneGeometry } from "./types";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/** Lifecycle and rendering operations for one SVG overlay. */
export interface Overlay {
	render(geometry: ZoneGeometry, inside: boolean, point: Point | null): void;
	destroy(): void;
}

/** Formats a rectangle as an SVG path segment. */
function rectanglePath(rect: Rect): string {
	return `M${rect.left} ${rect.top}H${rect.right}V${rect.bottom}H${rect.left}Z`;
}

/** Creates the SVG path for the configured zone shape. */
function zonePath(geometry: ZoneGeometry): string {
	if (!geometry.bounds) return "";
	if (geometry.shape === "bounds") return rectanglePath(geometry.bounds);
	if (geometry.shape === "union")
		return geometry.rects.map(rectanglePath).join("");
	if (geometry.hull.length < 3) return rectanglePath(geometry.bounds);
	return `M${geometry.hull.map((point) => `${point.x} ${point.y}`).join("L")}Z`;
}

/** Creates a configurable visual overlay for a SafeZone instance. */
export function createOverlay(options: VisualizeOptions): Overlay {
	const outsideColor = options.color ?? "#3b82f6";
	const insideColor = options.insideColor ?? "#22c55e";
	const fillOpacity = options.fillOpacity ?? 0.15;
	const showElements = options.showElements ?? true;
	const showPoint = options.showPoint ?? true;

	const svg = document.createElementNS(SVG_NAMESPACE, "svg");
	svg.setAttribute("aria-hidden", "true");
	svg.setAttribute("data-safezone-overlay", "");
	svg.style.cssText = `position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:${options.zIndex ?? 2147483647}`;

	const path = document.createElementNS(SVG_NAMESPACE, "path");
	path.setAttribute("stroke-width", "2");
	path.setAttribute("stroke-dasharray", "6 4");
	const outlines = document.createElementNS(SVG_NAMESPACE, "g");
	const pointMarker = document.createElementNS(SVG_NAMESPACE, "circle");
	pointMarker.setAttribute("r", "4");
	svg.append(path, outlines, pointMarker);
	(options.container ?? document.body ?? document.documentElement).append(svg);

	return {
		render(geometry, inside, point) {
			const color = inside ? insideColor : outsideColor;
			path.setAttribute("d", zonePath(geometry));
			path.setAttribute("fill", color);
			path.setAttribute("fill-opacity", String(fillOpacity));
			path.setAttribute("stroke", color);

			const rectangles = showElements ? geometry.elements : [];
			while (outlines.childNodes.length > rectangles.length)
				outlines.lastChild!.remove();
			while (outlines.childNodes.length < rectangles.length) {
				const rectangle = document.createElementNS(SVG_NAMESPACE, "rect");
				rectangle.setAttribute("fill", "none");
				rectangle.setAttribute("stroke-width", "1");
				outlines.append(rectangle);
			}
			rectangles.forEach((rect, index) => {
				const outline = outlines.childNodes[index] as SVGRectElement;
				outline.setAttribute("x", String(rect.left));
				outline.setAttribute("y", String(rect.top));
				outline.setAttribute("width", String(rect.width));
				outline.setAttribute("height", String(rect.height));
				outline.setAttribute("stroke", color);
			});

			if (showPoint && point) {
				pointMarker.setAttribute("cx", String(point.x));
				pointMarker.setAttribute("cy", String(point.y));
				pointMarker.setAttribute("fill", color);
				pointMarker.removeAttribute("display");
			} else pointMarker.setAttribute("display", "none");
		},
		destroy() {
			svg.remove();
		},
	};
}
