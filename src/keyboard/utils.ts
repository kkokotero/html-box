import { KeyboardError, KeyboardErrorCode } from "./keyboard-error";
import type { InputsMode, MatchMode, Modifiers, Off, Platform } from "./types";

export const noop: Off = () => {};

const MODIFIER_ALIASES: Readonly<
	Record<string, "ctrl" | "alt" | "shift" | "meta" | "mod">
> = {
	ctrl: "ctrl",
	control: "ctrl",
	alt: "alt",
	option: "alt",
	shift: "shift",
	meta: "meta",
	cmd: "meta",
	command: "meta",
	mod: "mod",
};

/** Maps key aliases to canonical tokens. */
const KEY_ALIASES: Readonly<Record<string, string>> = {
	esc: "escape",
	return: "enter",
	del: "delete",
	spacebar: "space",
	up: "arrowup",
	down: "arrowdown",
	left: "arrowleft",
	right: "arrowright",
	minus: "-",
	equal: "=",
	comma: ",",
	period: ".",
	slash: "/",
	backslash: "\\",
	semicolon: ";",
	quote: "'",
	backquote: "`",
	bracketleft: "[",
	bracketright: "]",
	// nombres antiguos de event.key (IE/Edge legacy)
	os: "meta",
};

const NAMED_TOKENS: ReadonlySet<string> = new Set([
	"enter",
	"escape",
	"space",
	"tab",
	"backspace",
	"delete",
	"insert",
	"home",
	"end",
	"pageup",
	"pagedown",
	"arrowup",
	"arrowdown",
	"arrowleft",
	"arrowright",
	"plus",
]);

const PUNCTUATION_TOKENS: ReadonlySet<string> = new Set([
	"-",
	"=",
	",",
	".",
	"/",
	";",
	"'",
	"[",
	"]",
	"\\",
	"`",
	"?",
]);

/** Maps canonical tokens to physical `event.code` values. */
const TOKEN_TO_CODE: Readonly<Record<string, string>> = {
	enter: "Enter",
	escape: "Escape",
	space: "Space",
	tab: "Tab",
	backspace: "Backspace",
	delete: "Delete",
	insert: "Insert",
	home: "Home",
	end: "End",
	pageup: "PageUp",
	pagedown: "PageDown",
	arrowup: "ArrowUp",
	arrowdown: "ArrowDown",
	arrowleft: "ArrowLeft",
	arrowright: "ArrowRight",
	"-": "Minus",
	"=": "Equal",
	",": "Comma",
	".": "Period",
	"/": "Slash",
	";": "Semicolon",
	"'": "Quote",
	"[": "BracketLeft",
	"]": "BracketRight",
	"\\": "Backslash",
	"`": "Backquote",
};

const CODE_TO_TOKEN: Readonly<Record<string, string>> = Object.fromEntries([
	...Object.entries(TOKEN_TO_CODE).map(([token, code]) => [code, token]),
	["NumpadEnter", "enter"],
	["NumpadAdd", "plus"],
]);

const MODIFIER_KEYS: Readonly<Record<string, keyof Modifiers>> = {
	control: "ctrl",
	alt: "alt",
	altgraph: "alt",
	shift: "shift",
	meta: "meta",
};

function tokenToCode(token: string): string | null {
	if (/^[a-z]$/.test(token)) return `Key${token.toUpperCase()}`;
	if (/^[0-9]$/.test(token)) return `Digit${token}`;
	if (/^f\d{1,2}$/.test(token)) return token.toUpperCase();
	return TOKEN_TO_CODE[token] ?? null;
}

function codeToToken(code: string): string | null {
	let m = /^Key([A-Z])$/.exec(code);
	if (m) return m[1]!.toLowerCase();
	m = /^(?:Digit|Numpad)([0-9])$/.exec(code);
	if (m) return m[1]!;
	return CODE_TO_TOKEN[code] ?? null;
}

const isSingleChar = (value: string): boolean => [...value].length === 1;
const isSymbolToken = (token: string): boolean =>
	isSingleChar(token) && !/^[a-z0-9]$/.test(token);

/** Normalizes `event.key` to a canonical token. */
function canonicalKey(key: string): string {
	if (key === " ") return "space";
	if (key === "+") return "plus";
	const lower = key.toLowerCase();
	return KEY_ALIASES[lower] ?? lower;
}

/** Checks whether `event.key` reliably identifies a letter or digit. */
function isReliableKey(key: string): boolean {
	if (key === "Dead" || key === "Unidentified") return false;
	if (!isSingleChar(key)) return true; // teclas con nombre: Enter, ArrowUp, F5...
	return /^[a-zA-Z0-9 ]$/.test(key);
}

/* -------------------------------------------------------------------------- */
/* Shortcut parsing                                                           */
/* -------------------------------------------------------------------------- */

export interface Parsed {
	readonly ctrl: boolean;
	readonly alt: boolean;
	readonly shift: boolean;
	readonly meta: boolean;
	readonly token: string;
	/** Expected `event.code` value when matching by physical code. */
	readonly code: string | null;
	readonly canonical: string;
}

function formatCombo(mods: Modifiers, token: string | null): string {
	const parts: string[] = [];
	if (mods.ctrl) parts.push("ctrl");
	if (mods.alt) parts.push("alt");
	if (mods.shift) parts.push("shift");
	if (mods.meta) parts.push("meta");
	if (token) parts.push(token);
	return parts.join("+");
}

export function parseShortcut(
	input: unknown,
	match: MatchMode,
	platform: Platform,
): Parsed {
	if (typeof input !== "string" || input.trim() === "") {
		throw new KeyboardError(
			KeyboardErrorCode.InvalidShortcut,
			'Shortcut must be a non-empty string, e.g. "ctrl+k".',
		);
	}
	const parts = input.split("+").map((part) => part.trim().toLowerCase());
	if (parts.some((part) => part === "")) {
		throw new KeyboardError(
			KeyboardErrorCode.InvalidShortcut,
			`Invalid shortcut "${input}". To bind the "+" key write "plus" (e.g. "ctrl+plus").`,
		);
	}

	const rawKey = parts.pop() as string;
	const mods = { ctrl: false, alt: false, shift: false, meta: false };
	for (const part of parts) {
		const alias = MODIFIER_ALIASES[part];
		if (!alias) {
			throw new KeyboardError(
				KeyboardErrorCode.InvalidShortcut,
				`Unknown modifier "${part}" in shortcut "${input}".`,
			);
		}
		const modifier =
			alias === "mod" ? (platform === "mac" ? "meta" : "ctrl") : alias;
		if (mods[modifier]) {
			throw new KeyboardError(
				KeyboardErrorCode.InvalidShortcut,
				`Duplicated modifier "${part}" in shortcut "${input}".`,
			);
		}
		mods[modifier] = true;
	}

	if (MODIFIER_ALIASES[rawKey]) {
		throw new KeyboardError(
			KeyboardErrorCode.InvalidShortcut,
			`Shortcut "${input}" needs a non-modifier key (e.g. "${input}+k").`,
		);
	}

	const token = KEY_ALIASES[rawKey] ?? rawKey;
	const known =
		/^[a-z0-9]$/.test(token) ||
		/^f(?:[1-9]|1\d|2[0-4])$/.test(token) ||
		NAMED_TOKENS.has(token) ||
		PUNCTUATION_TOKENS.has(token);
	// Key mode accepts any single character; code mode requires a known physical key.
	const customChar =
		match === "key" && isSingleChar(token) && !/\s/.test(token);
	if (!known && !customChar) {
		throw new KeyboardError(
			KeyboardErrorCode.InvalidShortcut,
			`Unknown key "${rawKey}" in shortcut "${input}".`,
		);
	}

	let code: string | null = null;
	if (match === "code") {
		code = tokenToCode(token);
		if (!code) {
			throw new KeyboardError(
				KeyboardErrorCode.InvalidShortcut,
				`Key "${rawKey}" has no physical code; with match: "code" use an unshifted key (e.g. "equal" instead of "plus").`,
			);
		}
	}

	return { ...mods, token, code, canonical: formatCombo(mods, token) };
}

/* -------------------------------------------------------------------------- */
/* Event description                                                   */
/* -------------------------------------------------------------------------- */

export interface Described {
	readonly primary: string;
	readonly fallback: string | null;
	readonly best: string;
	readonly mods: Modifiers;
	readonly altGraph: boolean;
	readonly composing: boolean;
	readonly target: EventTarget | null;
	readonly editable: boolean;
	readonly combo: string;
}

const isElement = (value: unknown): value is Element =>
	typeof Element !== "undefined" && value instanceof Element;

const TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
	"text",
	"search",
	"url",
	"tel",
	"email",
	"password",
	"number",
	"date",
	"datetime-local",
	"month",
	"time",
	"week",
]);

function isEditable(target: EventTarget | null): boolean {
	if (!isElement(target)) return false;
	const tag = target.tagName;
	if (tag === "INPUT") {
		const input = target as HTMLInputElement;
		return (
			TEXT_INPUT_TYPES.has((input.type || "text").toLowerCase()) &&
			!input.readOnly &&
			!input.disabled
		);
	}
	if (tag === "TEXTAREA") {
		const area = target as HTMLTextAreaElement;
		return !area.readOnly && !area.disabled;
	}
	if (tag === "SELECT") return !(target as HTMLSelectElement).disabled;
	return (
		(target as HTMLElement).isContentEditable === true ||
		target.closest('[contenteditable]:not([contenteditable="false"])') !== null
	);
}

export function describe(event: KeyboardEvent): Described {
	const altGraph =
		typeof event.getModifierState === "function" &&
		event.getModifierState("AltGraph");
	// AltGr is often reported as Ctrl+Alt but produces text rather than a shortcut.
	const mods: Modifiers = {
		ctrl: event.ctrlKey && !altGraph,
		alt: event.altKey && !altGraph,
		shift: event.shiftKey,
		meta: event.metaKey,
	};

	const primary = canonicalKey(event.key);
	const reliable = isReliableKey(event.key);
	const fallback = reliable ? null : codeToToken(event.code);
	const best = reliable ? primary : (fallback ?? primary);

	const path =
		typeof event.composedPath === "function" ? event.composedPath() : [];
	const target = path[0] ?? event.target;

	const modifierKey = MODIFIER_KEYS[primary];
	const combo = modifierKey ? formatCombo(mods, null) : formatCombo(mods, best);

	return {
		primary,
		fallback,
		best,
		mods,
		altGraph,
		composing: event.isComposing || event.keyCode === 229,
		target,
		editable: isEditable(target),
		combo,
	};
}

export function matchesShortcut(
	parsed: Parsed,
	described: Described,
	event: KeyboardEvent,
	exact: boolean,
): boolean {
	const keyOk = parsed.code
		? event.code === parsed.code
		: parsed.token === described.primary ||
			(described.fallback !== null && parsed.token === described.fallback);
	if (!keyOk) return false;

	// A symbol that requires Shift on this layout (such as `?`) does not require `shift+`.
	const ignoreShift =
		!parsed.code &&
		!parsed.shift &&
		isSymbolToken(parsed.token) &&
		parsed.token === described.primary;
	const { mods } = described;

	if (exact) {
		return (
			mods.ctrl === parsed.ctrl &&
			mods.alt === parsed.alt &&
			mods.meta === parsed.meta &&
			(ignoreShift || mods.shift === parsed.shift)
		);
	}
	return (
		(!parsed.ctrl || mods.ctrl) &&
		(!parsed.alt || mods.alt) &&
		(!parsed.meta || mods.meta) &&
		(!parsed.shift || mods.shift)
	);
}

/** Determines whether an event from an editable field should be ignored. */
export function blockedByInput(
	mode: InputsMode,
	parsed: Parsed | null,
	described: Described,
	event: KeyboardEvent,
	platform: Platform,
): boolean {
	if (!described.editable || mode === "allow") return false;
	if (mode === "ignore") return true;

	// In auto mode, listening directly on the editable field is considered intentional.
	if (described.target === event.currentTarget) return false;
	if (!parsed) return true;
	if (parsed.ctrl || parsed.meta || (parsed.alt && platform !== "mac"))
		return false;
	return !(parsed.token === "escape" || /^f\d+$/.test(parsed.token));
}

/** Reports handler errors without preventing other handlers from running. */
export function reportHandlerError(error: unknown): void {
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

export function detectPlatform(): Platform {
	if (typeof navigator === "undefined") return "other";
	const nav = navigator as Navigator & {
		userAgentData?: { platform?: string };
	};
	const platform = nav.userAgentData?.platform ?? nav.platform ?? "";
	return /mac|iphone|ipad|ipod/i.test(platform) ? "mac" : "other";
}

/* -------------------------------------------------------------------------- */
/* Keyboard                                                                   */
/* -------------------------------------------------------------------------- */
