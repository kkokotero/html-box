import { describe, expect, it, vi } from "vitest";

import { Keyboard, KeyboardError, KeyboardErrorCode } from "../src/keyboard";
import type {
	KeypressHandler,
	Shortcut,
	ShortcutHandler,
} from "../src/keyboard";

function dispatchKey(
	target: EventTarget,
	key: string,
	options: KeyboardEventInit & {
		code?: string;
		altGraph?: boolean;
		type?: string;
	} = {},
): KeyboardEvent {
	const { altGraph, type = "keydown", ...init } = options;
	const event = new KeyboardEvent(type, {
		bubbles: true,
		cancelable: true,
		key,
		...init,
	});
	if (altGraph)
		vi.spyOn(event, "getModifierState").mockImplementation(
			(name) => name === "AltGraph",
		);
	target.dispatchEvent(event);
	return event;
}

function assertShortcutCompletionTypes(): void {
	const keyboard = new Keyboard(document);
	keyboard.on("ctrl+shift+p", vi.fn<ShortcutHandler>());
	keyboard.on("a", vi.fn<ShortcutHandler>());
	// @ts-expect-error Invalid shortcut literals are rejected by the registration API.
	keyboard.on("ctrl+not-a-key", vi.fn<ShortcutHandler>());
	// @ts-expect-error Duplicate modifiers are rejected by the shortcut type.
	keyboard.on("ctrl+ctrl+k", vi.fn<ShortcutHandler>());
	const invalidKeyboard = new Keyboard(document, {
		// @ts-expect-error Initial shortcut maps are validated at compile time.
		shortcuts: { "ctrl+not-a-key": vi.fn<ShortcutHandler>() },
	});
	void invalidKeyboard;
	keyboard.close();
}

void assertShortcutCompletionTypes;

describe("Keyboard shortcut types", () => {
	it("provides editor-completable single keys and common modifier combinations", () => {
		const suggestions: Shortcut[] = [
			"a",
			"7",
			"escape",
			"f12",
			"ctrl+k",
			"shift+enter",
			"mod+shift+p",
		];
		expect(suggestions).toHaveLength(7);
		// @ts-expect-error Unknown key names are rejected by the completion type.
		const invalid: Shortcut = "ctrl+not-a-key";
		expect(invalid).toBe("ctrl+not-a-key");
	});
});

describe("Keyboard", () => {
	it("registers individual letter keys and provides canonical shortcut context", () => {
		const target = document.createElement("div");
		const keyboard = new Keyboard(target);
		const handler = vi.fn<ShortcutHandler>();
		keyboard.on("a", handler);

		dispatchKey(target, "a", { code: "KeyA" });
		expect(handler).toHaveBeenCalledWith(
			expect.any(KeyboardEvent),
			expect.objectContaining({ shortcut: "a", target }),
		);
		keyboard.close();
	});

	it("supports modifier combinations, prevention, and exact matching", () => {
		const target = document.createElement("div");
		const keyboard = new Keyboard(target);
		const handler = vi.fn<ShortcutHandler>();
		keyboard.on("ctrl+k", handler, { preventDefault: true });

		const event = dispatchKey(target, "k", { code: "KeyK", ctrlKey: true });
		expect(handler).toHaveBeenCalledTimes(1);
		expect(event.defaultPrevented).toBe(true);
		dispatchKey(target, "k", { code: "KeyK", ctrlKey: true, shiftKey: true });
		expect(handler).toHaveBeenCalledTimes(1);
		keyboard.close();
	});

	it("allows extra modifiers when exact matching is disabled", () => {
		const target = document.createElement("div");
		const keyboard = new Keyboard(target);
		const handler = vi.fn<ShortcutHandler>();
		keyboard.on("ctrl+k", handler, { exact: false });
		dispatchKey(target, "k", { code: "KeyK", ctrlKey: true, shiftKey: true });
		expect(handler).toHaveBeenCalledTimes(1);
		keyboard.close();
	});

	it("registers multiple shortcuts and removes them by canonical alias", () => {
		const target = document.createElement("div");
		const keyboard = new Keyboard(target);
		const handler = vi.fn<ShortcutHandler>();
		const subscription = keyboard.on(["ctrl+k", "meta+k"], handler);
		expect(keyboard.has("control+k")).toBe(true);
		dispatchKey(target, "k", { code: "KeyK", ctrlKey: true });
		dispatchKey(target, "k", { code: "KeyK", metaKey: true });
		expect(handler).toHaveBeenCalledTimes(2);
		keyboard.off("control+k", handler);
		expect(subscription.active).toBe(true); // One of the two registrations remains active.
		keyboard.off();
		expect(keyboard.listenerCount()).toBe(0);
		keyboard.close();
	});

	it("resolves the mod modifier from the configured platform", () => {
		const target = document.createElement("div");
		const keyboard = new Keyboard(target, { platform: "mac" });
		const handler = vi.fn<ShortcutHandler>();
		keyboard.on("mod+k", handler);
		dispatchKey(target, "k", { code: "KeyK", metaKey: true });
		dispatchKey(target, "k", { code: "KeyK", ctrlKey: true });
		expect(handler).toHaveBeenCalledTimes(1);
		keyboard.close();
	});

	it("uses code matching for physical key bindings", () => {
		const target = document.createElement("div");
		const keyboard = new Keyboard(target);
		const handler = vi.fn<ShortcutHandler>();
		keyboard.on("w", handler, { match: "code" });
		dispatchKey(target, "q", { code: "KeyW" });
		expect(handler).toHaveBeenCalledTimes(1);
		keyboard.close();
	});

	it("can listen for keyup instead of keydown", () => {
		const target = document.createElement("div");
		const keyboard = new Keyboard(target);
		const handler = vi.fn<ShortcutHandler>();
		keyboard.on("a", handler, { event: "keyup" });
		dispatchKey(target, "a", { type: "keydown", code: "KeyA" });
		dispatchKey(target, "a", { type: "keyup", code: "KeyA" });
		expect(handler).toHaveBeenCalledTimes(1);
		keyboard.close();
	});

	it("ignores printable shortcuts in editable fields by default but allows command shortcuts", () => {
		const input = document.createElement("input");
		document.body.append(input);
		const keyboard = new Keyboard(document);
		const letter = vi.fn<ShortcutHandler>();
		const command = vi.fn<ShortcutHandler>();
		keyboard.on("a", letter);
		keyboard.on("ctrl+k", command);
		dispatchKey(input, "a", { code: "KeyA" });
		dispatchKey(input, "k", { code: "KeyK", ctrlKey: true });
		expect(letter).not.toHaveBeenCalled();
		expect(command).toHaveBeenCalledTimes(1);
		keyboard.close();
	});

	it("allows a plain shortcut when listening directly on an editable field", () => {
		const input = document.createElement("input");
		document.body.append(input);
		const keyboard = new Keyboard(input);
		const handler = vi.fn<ShortcutHandler>();
		keyboard.on("a", handler);
		dispatchKey(input, "a", { code: "KeyA" });
		expect(handler).toHaveBeenCalledTimes(1);
		keyboard.close();
	});

	it("respects editable-field allow and ignore policies", () => {
		const input = document.createElement("input");
		document.body.append(input);
		const keyboard = new Keyboard(document);
		const allow = vi.fn<ShortcutHandler>();
		const ignore = vi.fn<ShortcutHandler>();
		keyboard.on("a", allow, { inputs: "allow" });
		keyboard.on("b", ignore, { inputs: "ignore" });
		dispatchKey(input, "a", { code: "KeyA" });
		dispatchKey(input, "b", { code: "KeyB" });
		expect(allow).toHaveBeenCalledTimes(1);
		expect(ignore).not.toHaveBeenCalled();
		keyboard.close();
	});

	it("does not dispatch shortcuts during IME composition or AltGr input", () => {
		const target = document.createElement("div");
		const keyboard = new Keyboard(target);
		const handler = vi.fn<ShortcutHandler>();
		keyboard.on("ctrl+k", handler);
		dispatchKey(target, "k", {
			code: "KeyK",
			ctrlKey: true,
			isComposing: true,
		});
		dispatchKey(target, "k", {
			code: "KeyK",
			ctrlKey: true,
			altKey: true,
			altGraph: true,
		});
		expect(handler).not.toHaveBeenCalled();
		keyboard.close();
	});

	it("provides normalized keypress information for ordinary, AltGr, and composing events", () => {
		const target = document.createElement("div");
		const keyboard = new Keyboard(target);
		const handler = vi.fn<KeypressHandler>();
		keyboard.keypress(handler);
		dispatchKey(target, "A", { code: "KeyA", shiftKey: true });
		dispatchKey(target, "@", {
			code: "KeyQ",
			ctrlKey: true,
			altKey: true,
			altGraph: true,
		});
		dispatchKey(target, "Process", { code: "KeyA", isComposing: true });
		expect(handler).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ key: "a", combo: "shift+a" }),
			expect.any(Object),
		);
		expect(handler).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ altGraph: true }),
			expect.any(Object),
		);
		expect(handler).toHaveBeenNthCalledWith(
			3,
			expect.objectContaining({ composing: true }),
			expect.any(Object),
		);
		keyboard.close();
	});

	it("supports one-shot handlers and pausable shortcut handles", () => {
		const target = document.createElement("div");
		const keyboard = new Keyboard(target);
		const handler = vi.fn<ShortcutHandler>();
		const handle = keyboard.register("escape", handler, { once: true });
		dispatchKey(target, "Escape", { code: "Escape" });
		dispatchKey(target, "Escape", { code: "Escape" });
		expect(handler).toHaveBeenCalledTimes(1);
		expect(handle.active).toBe(false);

		const paused = keyboard.register("enter", handler);
		paused.enabled = false;
		dispatchKey(target, "Enter", { code: "Enter" });
		expect(handler).toHaveBeenCalledTimes(1);
		paused.enabled = true;
		dispatchKey(target, "Enter", { code: "Enter" });
		expect(handler).toHaveBeenCalledTimes(2);
		paused.close();
		keyboard.close();
	});

	it("registers shortcut maps passed to the constructor", () => {
		const target = document.createElement("div");
		const handler = vi.fn<ShortcutHandler>();
		const keyboard = new Keyboard(target, {
			shortcuts: { "ctrl+k": handler, escape: handler },
		});
		dispatchKey(target, "k", { code: "KeyK", ctrlKey: true });
		expect(handler).toHaveBeenCalledTimes(1);
		expect(keyboard.shortcuts).toEqual(["ctrl+k", "escape"]);
		keyboard.close();
	});

	it("supports static event matching", () => {
		const event = new KeyboardEvent("keydown", {
			key: "k",
			code: "KeyK",
			ctrlKey: true,
		});
		expect(Keyboard.matches(event, "ctrl+k", { platform: "other" })).toBe(true);
		expect(Keyboard.matches(event, "meta+k", { platform: "other" })).toBe(
			false,
		);
	});

	it("creates an inert instance for a null target", () => {
		const keyboard = new Keyboard(null);
		const subscription = keyboard.on("a", vi.fn<ShortcutHandler>());
		expect(subscription.active).toBe(false);
		expect(keyboard.listenerCount()).toBe(0);
		keyboard.close();
	});

	it("validates targets, shortcut strings, handlers, and closed state", () => {
		expect(() => new Keyboard({} as EventTarget)).toThrowError(
			expect.objectContaining({ code: KeyboardErrorCode.InvalidTarget }),
		);
		expect(
			() =>
				new Keyboard(document, { defaults: { match: "physical" as never } }),
		).toThrowError(
			expect.objectContaining({ code: KeyboardErrorCode.InvalidOption }),
		);
		const keyboard = new Keyboard(document.createElement("div"));
		expect(() =>
			keyboard.register("ctrl+" as string, vi.fn<ShortcutHandler>()),
		).toThrowError(
			expect.objectContaining({ code: KeyboardErrorCode.InvalidShortcut }),
		);
		expect(() =>
			keyboard.register("a", null as unknown as () => void),
		).toThrowError(
			expect.objectContaining({ code: KeyboardErrorCode.InvalidHandler }),
		);
		keyboard.close();
		expect(() => keyboard.on("a", vi.fn<ShortcutHandler>())).toThrowError(
			expect.objectContaining({ code: KeyboardErrorCode.Closed }),
		);
	});

	it("closes from an abort signal and cancels individual registrations", () => {
		const target = document.createElement("div");
		const controller = new AbortController();
		const keyboard = new Keyboard(target);
		const handler = vi.fn<ShortcutHandler>();
		keyboard.on("a", handler, { signal: controller.signal });
		controller.abort();
		dispatchKey(target, "a", { code: "KeyA" });
		expect(handler).not.toHaveBeenCalled();
		keyboard.close();

		const closeController = new AbortController();
		const closable = new Keyboard(target, { signal: closeController.signal });
		closeController.abort();
		expect(closable.closed).toBe(true);
	});

	it("exposes stable error names and codes", () => {
		const error = new KeyboardError(
			KeyboardErrorCode.InvalidShortcut,
			"Bad shortcut",
		);
		expect(error).toBeInstanceOf(Error);
		expect(error.name).toBe("KeyboardError");
		expect(error.code).toBe("INVALID_SHORTCUT");
	});
});
