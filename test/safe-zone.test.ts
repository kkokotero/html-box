import { afterEach, describe, expect, it, vi } from "vitest";

import { SafeZone, SafeZoneError, SafeZoneErrorCode } from "../src/safe-zone";

function setRect(
	element: Element,
	left: number,
	top: number,
	width: number,
	height: number,
): void {
	vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
		x: left,
		y: top,
		left,
		top,
		right: left + width,
		bottom: top + height,
		width,
		height,
		toJSON: () => ({}),
	} as DOMRect);
}

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("SafeZone", () => {
	it("exports stable error codes and error details", () => {
		expect(SafeZoneErrorCode.InvalidSource).toBe("INVALID_SOURCE");
		expect(SafeZoneErrorCode.InvalidTarget).toBe("INVALID_TARGET");
		expect(SafeZoneErrorCode.InvalidEvent).toBe("INVALID_EVENT");
		expect(SafeZoneErrorCode.InvalidHandler).toBe("INVALID_HANDLER");
		expect(SafeZoneErrorCode.InvalidOption).toBe("INVALID_OPTION");
		expect(SafeZoneErrorCode.Closed).toBe("CLOSED");
		const error = new SafeZoneError(
			SafeZoneErrorCode.InvalidTarget,
			"Bad target.",
		);
		expect(error.name).toBe("SafeZoneError");
		expect(error.code).toBe(SafeZoneErrorCode.InvalidTarget);
	});

	it("measures targets and applies uniform or per-edge padding", () => {
		const target = document.createElement("div");
		document.body.append(target);
		setRect(target, 10, 20, 30, 40);
		const zone = new SafeZone(() => null, target, {
			padding: { top: 1, right: 2, bottom: 3, left: 4 },
		});
		expect(zone.targets).toEqual([target]);
		expect(zone.measure()).toMatchObject({
			elements: [
				{ left: 10, top: 20, right: 40, bottom: 60, width: 30, height: 40 },
			],
			rects: [
				{ left: 6, top: 19, right: 42, bottom: 63, width: 36, height: 44 },
			],
			bounds: { left: 6, top: 19, right: 42, bottom: 63 },
		});
		zone.close();
	});

	it("supports hull, union, and bounds shape membership", () => {
		const left = document.createElement("div");
		const right = document.createElement("div");
		document.body.append(left, right);
		setRect(left, 0, 0, 10, 10);
		setRect(right, 30, 0, 10, 10);
		const hull = new SafeZone(() => null, [left, right]);
		const union = new SafeZone(() => null, [left, right], { shape: "union" });
		const bounds = new SafeZone(() => null, [left, right], { shape: "bounds" });
		expect(hull.contains(20, 5)).toBe(true);
		expect(union.contains(20, 5)).toBe(false);
		expect(bounds.contains(20, 5)).toBe(true);
		expect(hull.measure().hull.length).toBe(4);
		expect(union.measure().hull).toEqual([]);
		hull.close();
		union.close();
		bounds.close();
	});

	it("supports an element as a source and intersect, center, and contain modes", () => {
		const source = document.createElement("div");
		const target = document.createElement("div");
		document.body.append(source, target);
		setRect(source, 8, 8, 10, 10);
		setRect(target, 0, 0, 10, 10);
		const intersect = new SafeZone(source, target);
		const center = new SafeZone(source, target, { mode: "center" });
		const contain = new SafeZone(source, target, { mode: "contain" });
		expect(intersect.update()).toBe(true);
		expect(center.update()).toBe(false);
		expect(contain.update()).toBe(false);
		expect(intersect.inside).toBe(true);
		intersect.close();
		center.close();
		contain.close();
	});

	it("emits enter, inside, and leave events for a point callback source", () => {
		let point = { x: 5, y: 5 };
		const target = document.createElement("div");
		document.body.append(target);
		setRect(target, 0, 0, 10, 10);
		const zone = new SafeZone(() => point, target);
		const enter =
			vi.fn<(event: { point: { x: number; y: number } | null }) => void>();
		const inside = vi.fn<() => void>();
		const leave =
			vi.fn<
				(event: import("../src/safe-zone").SafeZoneEvent<"leave">) => void
			>();
		zone.on("enter", enter);
		zone.on("inside", inside);
		zone.on("leave", leave);
		expect(zone.update()).toBe(true);
		expect(enter).toHaveBeenCalledTimes(1);
		expect(enter.mock.calls[0]![0].point).toEqual(point);
		zone.update();
		expect(inside).toHaveBeenCalledTimes(2);
		point = { x: 50, y: 50 };
		expect(zone.update()).toBe(false);
		expect(leave).toHaveBeenCalledTimes(1);
		expect(leave.mock.calls[0]![0]).toMatchObject({
			type: "leave",
			inside: false,
		});
		zone.close();
	});

	it("applies enter and leave delays and cancels pending transitions", () => {
		vi.useFakeTimers();
		let point = { x: 50, y: 50 };
		const target = document.createElement("div");
		document.body.append(target);
		setRect(target, 0, 0, 10, 10);
		const zone = new SafeZone(() => point, target, {
			enterDelay: 20,
			leaveDelay: 30,
		});
		const enter = vi.fn<() => void>();
		const leave =
			vi.fn<
				(event: import("../src/safe-zone").SafeZoneEvent<"leave">) => void
			>();
		zone.on("enter", enter);
		zone.on("leave", leave);
		point = { x: 5, y: 5 };
		zone.update();
		vi.advanceTimersByTime(10);
		point = { x: 50, y: 50 };
		zone.update();
		vi.advanceTimersByTime(25);
		expect(enter).not.toHaveBeenCalled();
		point = { x: 5, y: 5 };
		zone.update();
		vi.advanceTimersByTime(20);
		expect(enter).toHaveBeenCalledTimes(1);
		point = { x: 50, y: 50 };
		zone.update();
		vi.advanceTimersByTime(29);
		expect(leave).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(leave).toHaveBeenCalledTimes(1);
		zone.close();
	});

	it("adds and removes target elements", () => {
		const first = document.createElement("div");
		const second = document.createElement("div");
		document.body.append(first, second);
		setRect(first, 0, 0, 10, 10);
		setRect(second, 20, 0, 10, 10);
		const zone = new SafeZone(() => null, first);
		expect(zone.contains(25, 5)).toBe(false);
		expect(zone.add(second)).toBe(zone);
		expect(zone.targets).toHaveLength(2);
		expect(zone.contains(25, 5)).toBe(true);
		expect(zone.remove(first)).toBe(zone);
		expect(zone.targets).toEqual([second]);
		zone.close();
	});

	it("supports once, off, cancel, subscriptions, and listener counts", () => {
		const target = document.createElement("div");
		document.body.append(target);
		setRect(target, 0, 0, 10, 10);
		const zone = new SafeZone(() => ({ x: 5, y: 5 }), target);
		const handler = vi.fn<() => void>();
		const first = zone.once("enter", handler);
		const secondHandler = vi.fn<() => void>();
		const second = zone.on("enter", secondHandler);
		expect(first.name).toBe("enter");
		expect(first.active).toBe(true);
		expect(zone.listenerCount()).toBe(2);
		zone.update();
		expect(handler).toHaveBeenCalledTimes(1);
		expect(first.active).toBe(false);
		zone.off("enter", secondHandler);
		expect(second.active).toBe(false);
		expect(zone.listenerCount("enter")).toBe(0);
		zone.close();
	});

	it("closes on abort and cancels listener signals", () => {
		const target = document.createElement("div");
		document.body.append(target);
		const zoneController = new AbortController();
		const zone = new SafeZone("pointer", target, {
			signal: zoneController.signal,
		});
		const listenerController = new AbortController();
		const subscription = zone.on("enter", vi.fn<() => void>(), {
			signal: listenerController.signal,
		});
		listenerController.abort();
		expect(subscription.active).toBe(false);
		zoneController.abort();
		expect(zone.closed).toBe(true);
		expect(() => zone.update()).toThrowError(SafeZoneError);
	});

	it("renders and removes the SVG debug overlay", () => {
		const target = document.createElement("div");
		document.body.append(target);
		setRect(target, 0, 0, 10, 10);
		const container = document.createElement("div");
		document.body.append(container);
		const zone = new SafeZone(() => ({ x: 5, y: 5 }), target, {
			visualize: { container },
		});
		expect(
			container.querySelector("svg[data-safezone-overlay]"),
		).not.toBeNull();
		zone.hide();
		expect(container.querySelector("svg[data-safezone-overlay]")).toBeNull();
		zone.show({
			container,
			color: "red",
			insideColor: "green",
			showPoint: false,
		});
		expect(
			container.querySelector("svg[data-safezone-overlay]"),
		).not.toBeNull();
		zone.close();
		expect(container.querySelector("svg[data-safezone-overlay]")).toBeNull();
	});

	it("rejects invalid sources, targets, option values, and closed operations", () => {
		expect(
			() => new SafeZone({} as Element, document.createElement("div")),
		).toThrowError(SafeZoneError);
		expect(
			() =>
				new SafeZone("pointer", [document.createElement("div"), {} as Element]),
		).toThrowError(SafeZoneError);
		expect(
			() =>
				new SafeZone("pointer", document.createElement("div"), {
					padding: Number.NaN,
				}),
		).toThrowError(SafeZoneError);
		expect(
			() =>
				new SafeZone("pointer", document.createElement("div"), {
					enterDelay: -1,
				}),
		).toThrowError(SafeZoneError);
		const zone = new SafeZone("pointer", document.createElement("div"));
		expect(() => zone.on("invalid" as never, vi.fn<() => void>())).toThrowError(
			SafeZoneError,
		);
		expect(() => zone.on("enter", null as never)).toThrowError(SafeZoneError);
		zone.close();
		expect(() => zone.add(document.createElement("div"))).toThrowError(
			SafeZoneError,
		);
	});
});
