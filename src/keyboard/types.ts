/** Supported modifier names and aliases. */
export type ModifierName =
	| "ctrl"
	| "control"
	| "alt"
	| "option"
	| "shift"
	| "meta"
	| "cmd"
	| "command"
	| "mod";

type LetterKey =
	| "a"
	| "b"
	| "c"
	| "d"
	| "e"
	| "f"
	| "g"
	| "h"
	| "i"
	| "j"
	| "k"
	| "l"
	| "m"
	| "n"
	| "o"
	| "p"
	| "q"
	| "r"
	| "s"
	| "t"
	| "u"
	| "v"
	| "w"
	| "x"
	| "y"
	| "z";
type DigitKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
type FunctionKey =
	| "f1"
	| "f2"
	| "f3"
	| "f4"
	| "f5"
	| "f6"
	| "f7"
	| "f8"
	| "f9"
	| "f10"
	| "f11"
	| "f12"
	| "f13"
	| "f14"
	| "f15"
	| "f16"
	| "f17"
	| "f18"
	| "f19"
	| "f20"
	| "f21"
	| "f22"
	| "f23"
	| "f24";
type NamedKey =
	| "enter"
	| "return"
	| "escape"
	| "esc"
	| "space"
	| "tab"
	| "backspace"
	| "delete"
	| "del"
	| "insert"
	| "home"
	| "end"
	| "pageup"
	| "pagedown"
	| "arrowup"
	| "arrowdown"
	| "arrowleft"
	| "arrowright"
	| "up"
	| "down"
	| "left"
	| "right"
	| "plus"
	| "minus"
	| "equal"
	| "comma"
	| "period"
	| "slash"
	| "backslash"
	| "semicolon"
	| "quote"
	| "backquote"
	| "bracketleft"
	| "bracketright";
type SymbolKey =
	| "?"
	| "/"
	| ","
	| "."
	| ";"
	| "'"
	| "["
	| "]"
	| "\\"
	| "-"
	| "="
	| "`";

/** Name of a non-modifier key accepted by the shortcut parser. */
export type KeyName = LetterKey | DigitKey | FunctionKey | NamedKey | SymbolKey;

type ParseCombo<
	S extends string,
	Seen extends string = never,
> = S extends `${infer Head}+${infer Rest}`
	? Head extends ModifierName
		? Head extends Seen
			? false
			: ParseCombo<Rest, Seen | Head>
		: false
	: S extends KeyName
		? true
		: false;

/** Resolves to true when S is a valid shortcut, ignoring letter case. */
export type IsShortcut<S extends string> = ParseCombo<Lowercase<S>>;

/** Restricts literal parameters to valid shortcuts; dynamic strings are checked at runtime. */
export type ValidShortcut<S extends string> = string extends S
	? unknown
	: [IsShortcut<S>] extends [true]
		? unknown
		: never;

/** Finite canonical shortcut suggestions for editor autocomplete. */
type CompletionModifier = "ctrl" | "alt" | "shift" | "meta" | "mod";
export type Shortcut =
	| KeyName
	| `${CompletionModifier}+${KeyName}`
	| `${CompletionModifier}+${CompletionModifier}+${KeyName}`
	| `${CompletionModifier}+${CompletionModifier}+${CompletionModifier}+${KeyName}`;

/* -------------------------------------------------------------------------- */
/* Public API types                                                             */
/* -------------------------------------------------------------------------- */

/** Callback that releases a keyboard listener or shortcut registration. */
export type Off = () => void;
/** Selects logical `KeyboardEvent.key` or physical `KeyboardEvent.code` matching. */
export type MatchMode = "key" | "code";
/** Controls shortcut handling for events from editable fields. */
export type InputsMode = "auto" | "ignore" | "allow";
/** Platform family used to resolve the `mod` shortcut modifier. */
export type Platform = "mac" | "other";

/** Active modifier-key state for a keyboard event. */
export interface Modifiers {
	/** Whether Ctrl is pressed. */
	readonly ctrl: boolean;
	/** Whether Alt or Option is pressed. */
	readonly alt: boolean;
	/** Whether Shift is pressed. */
	readonly shift: boolean;
	/** Whether Meta, Command, or Windows is pressed. */
	readonly meta: boolean;
}

/** Context passed to a shortcut handler. */
export interface ShortcutContext {
	/** Canonical shortcut that matched, for example `ctrl+shift+p`. */
	readonly shortcut: string;
	/** Original event target, including targets inside Shadow DOM. */
	readonly target: EventTarget | null;
	/** Cancels this shortcut, including from inside its own handler. */
	readonly cancel: Off;
}

/** Callback invoked when a registered shortcut matches. */
export type ShortcutHandler = (
	event: KeyboardEvent,
	ctx: ShortcutContext,
) => void;

/** Normalized keyboard event information provided by `keypress`. */
export interface KeyInfo {
	/** Canonical key token, such as `k`, `enter`, `arrowup`, or `space`. */
	readonly key: string;
	/** Original `event.key` value. */
	readonly rawKey: string;
	/** Original `event.code` value identifying the physical key. */
	readonly code: string;
	/** Canonical combination including active modifiers, such as `ctrl+shift+k`. */
	readonly combo: string;
	/** Active modifier keys. */
	readonly modifiers: Modifiers;
	/** Whether the native event is an auto-repeat. */
	readonly repeat: boolean;
	/** Whether AltGr is active and producing a character. */
	readonly altGraph: boolean;
	/** Whether the event is part of an IME composition. */
	readonly composing: boolean;
	/** Whether the event originated in an editable field. */
	readonly editable: boolean;
	/** Original event target. */
	readonly target: EventTarget | null;
	/** Original browser keyboard event. */
	readonly event: KeyboardEvent;
}

/** Context passed to a generic keypress handler. */
export interface KeypressContext {
	readonly cancel: Off;
}

/** Callback invoked for normalized keyboard events. */
export type KeypressHandler = (info: KeyInfo, ctx: KeypressContext) => void;

/** Handle for cancelling a keyboard listener. */
export interface Subscription {
	/** Canonical shortcut or listener name. */
	readonly name: string;
	/** Whether the registration remains active. */
	readonly active: boolean;
	/** Cancels the registration. Safe to call more than once. */
	cancel(): void;
}

/** Handle returned by {@link Keyboard.register}. */
export interface ShortcutHandle extends Subscription {
	/** Canonical shortcut, for example `ctrl+shift+p`. */
	readonly combo: string;
	/** Pauses or resumes the shortcut without unregistering it. */
	enabled: boolean;
	/** Permanently unregisters this shortcut. */
	close(): void;
}

/** Default matching and dispatch behavior for shortcuts. */
export interface ShortcutDefaults {
	/** Calls `event.preventDefault()` when the shortcut matches. Defaults to false. */
	preventDefault?: boolean;
	/** Calls `event.stopPropagation()` when the shortcut matches. Defaults to false. */
	stopPropagation?: boolean;
	/** Matches logical keys (`key`, default) or physical keys (`code`). */
	match?: MatchMode;
	/** Requires an exact modifier match. Defaults to true. */
	exact?: boolean;
	/** Fires for repeated keydown events. Defaults to false. */
	repeat?: boolean;
	/** Behavior for events from editable fields. Defaults to `auto`. */
	inputs?: InputsMode;
	/** Native keyboard event type to observe. Defaults to `keydown`. */
	event?: "keydown" | "keyup";
	/** Event target. Defaults to the Keyboard root; use `document` for global shortcuts. */
	target?: EventTarget | null;
	/** Whether to listen during capture. */
	capture?: boolean;
}

/** Per-shortcut options, including listener lifecycle controls. */
export interface ShortcutOptions extends ShortcutDefaults {
	/** Removes the shortcut after its first invocation. */
	once?: boolean;
	/** Cancels the shortcut when the signal aborts. */
	signal?: AbortSignal;
}

/** Options for generic keyboard event listeners. */
export interface KeypressOptions {
	/** Native keyboard event type to observe. Defaults to `keydown`. */
	event?: "keydown" | "keyup";
	/** Event target; defaults to the Keyboard root. */
	target?: EventTarget | null;
	/** Whether to listen during capture. Defaults to false. */
	capture?: boolean;
	/** Includes repeated keydown events. Defaults to true. */
	repeat?: boolean;
	/** Editable-field behavior. Defaults to `allow` for generic key handlers. */
	inputs?: InputsMode;
	/** Calls `event.preventDefault()` for each received event. */
	preventDefault?: boolean;
	/** Calls `event.stopPropagation()` for each received event. */
	stopPropagation?: boolean;
	/** Removes the listener after its first invocation. */
	once?: boolean;
	/** Cancels the listener when the signal aborts. */
	signal?: AbortSignal;
}

/** Compile-time validation for an object of shortcut handlers. */
export type ShortcutMap<M> = {
	[K in keyof M]: K extends string
		? [IsShortcut<K>] extends [true]
			? ShortcutHandler
			: never
		: never;
};

/** Options used to construct a {@link Keyboard} instance. */
export interface KeyboardOptions {
	/** Defaults applied to shortcuts registered by this instance. */
	defaults?: ShortcutDefaults;
	/** Shortcuts registered during construction. Keys are validated at compile time. */
	shortcuts?: Partial<Record<Shortcut, ShortcutHandler>>;
	/** Overrides platform detection when resolving the `mod` modifier. */
	platform?: Platform;
	/** Closes the instance when the signal aborts. */
	signal?: AbortSignal;
}

/* -------------------------------------------------------------------------- */
/* Key tables                                                                 */
/* -------------------------------------------------------------------------- */
