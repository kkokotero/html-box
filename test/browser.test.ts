import { afterEach, describe, expect, it, vi } from "vitest";

import {
	Browser,
	BrowserError,
	Channel,
	Device,
	Network,
	Screen,
	ratioOf,
} from "../src/browser";

interface TestMessages {
	ping: { payload: undefined; response: string };
	theme: { payload: "light" | "dark" };
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("browser utilities", () => {
	it("calculates known, portrait, and invalid aspect ratios", () => {
		expect(ratioOf(1920, 1080)).toEqual({
			value: 16 / 9,
			label: "16:9",
			orientation: "landscape",
		});
		expect(ratioOf(1080, 1920)).toEqual({
			value: 1080 / 1920,
			label: "9:16",
			orientation: "portrait",
		});
		expect(ratioOf(0, 0)).toEqual({
			value: 0,
			label: "0:0",
			orientation: "square",
		});
	});

	it("exposes live device, screen, and network information", () => {
		expect(Browser.device).toBe(Browser.device);
		expect(Browser.screen).toBe(Browser.screen);
		expect(Browser.network).toBe(Browser.network);
		expect(new Device().info).toMatchObject({
			type: expect.any(String),
			platform: expect.any(String),
			pixelRatio: expect.any(Number),
			prefers: { colorScheme: expect.any(String) },
		});
		expect(new Screen().viewport.ratio.value).toBeGreaterThan(0);
		expect(new Network().info.online).toBe(Browser.network.online);
	});

	it("validates screen polling options", () => {
		expect(() => new Screen({ pollInterval: 15 })).toThrowError(
			expect.objectContaining({ code: "INVALID_OPTION" }),
		);
	});

	it("emits resize events once and removes aborted subscriptions", () => {
		const screen = new Screen();
		const handler = vi.fn<() => void>();
		const once = screen.on("resize", handler, { once: true });
		const width = window.innerWidth;
		vi.spyOn(window, "innerWidth", "get").mockReturnValue(width + 1);

		window.dispatchEvent(new Event("resize"));
		window.dispatchEvent(new Event("resize"));

		expect(handler).toHaveBeenCalledTimes(1);
		expect(once.active).toBe(false);

		const controller = new AbortController();
		const subscription = screen.on("move", handler, {
			signal: controller.signal,
		});
		controller.abort();
		expect(subscription.active).toBe(false);
	});

	it("resolves immediately when the network is already online", async () => {
		await expect(new Network().waitUntilOnline()).resolves.toBeUndefined();
	});

	it("does not open unsafe URLs or accept invalid window options", () => {
		const open = vi.spyOn(window, "open");

		expect(() => Browser.open("javascript:alert(1)")).toThrowError(
			expect.objectContaining({ code: "UNSAFE_URL" }),
		);
		expect(() =>
			Browser.open("https://example.com", { width: Number.NaN }),
		).toThrowError(expect.objectContaining({ code: "INVALID_OPTION" }));
		expect(open).not.toHaveBeenCalled();
	});

	it("opens cross-origin windows without retaining an opener reference", () => {
		const open = vi.spyOn(window, "open").mockReturnValue(null);

		const popup = Browser.open("https://example.com/panel");

		expect(popup.controllable).toBe(false);
		expect(open).toHaveBeenCalledWith(
			"https://example.com/panel",
			"_blank",
			expect.stringContaining("noopener"),
		);
		expect(open.mock.calls[0]?.[2]).toContain("noreferrer");
	});

	it("delivers typed channel events and request responses", async () => {
		const channelName = `browser-test-${Math.random()}`;
		const sender = new Channel<TestMessages>(channelName);
		const receiver = new Channel<TestMessages>(channelName);

		try {
			const received = new Promise<"light" | "dark">((resolve) => {
				receiver.on("theme", resolve, { once: true });
			});
			const response = new Promise<string>((resolve, reject) => {
				receiver.handle("ping", () => "pong", { once: true });
				sender
					.request("ping", undefined, { timeout: 1000 })
					.then(resolve, reject);
			});

			sender.send("theme", "dark");

			await expect(received).resolves.toBe("dark");
			await expect(response).resolves.toBe("pong");
		} finally {
			sender.close();
			receiver.close();
		}
	});

	it("reports unsupported channel APIs with a BrowserError", () => {
		vi.stubGlobal("BroadcastChannel", undefined);

		expect(() => new Channel("unsupported")).toThrowError(
			expect.objectContaining({
				code: "NOT_SUPPORTED",
				name: "BrowserError",
			}),
		);
		expect(new BrowserError("CLOSED", "closed")).toBeInstanceOf(Error);
	});
});
