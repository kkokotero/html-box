/** Shared public types for browser capability modules. */
export interface Subscription {
	readonly name: string;
	readonly active: boolean;
	cancel(): void;
}

export interface ListenerOptions {
	once?: boolean;
	signal?: AbortSignal;
}

export interface ListenerContext {
	/** Cancels this listener, including from within its handler. */
	readonly cancel: () => void;
}

export interface Size {
	readonly width: number;
	readonly height: number;
}

export interface Rect {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

export interface Ratio {
	/** width / height. */
	readonly value: number;
	/** Recognizable ratio ("16:9", "4:3", and similar) or a decimal ratio such as "1.60:1". */
	readonly label: string;
	readonly orientation: "landscape" | "portrait" | "square";
}

export type DeviceType = "mobile" | "tablet" | "desktop" | "unknown";
export type DevicePlatform =
	| "windows"
	| "macos"
	| "linux"
	| "android"
	| "ios"
	| "chromeos"
	| "unknown";

export interface DevicePreferences {
	readonly colorScheme: "light" | "dark";
	readonly reducedMotion: boolean;
	readonly contrast: "more" | "less" | "custom" | "no-preference";
	readonly reducedData: boolean;
}

export interface DeviceInfo {
	/** Heuristic estimate; prefer `touch`, `pointer`, and `hover` when choosing behavior. */
	readonly type: DeviceType;
	readonly platform: DevicePlatform;
	/** Whether the device has a touch screen. */
	readonly touch: boolean;
	/** Precision of the primary pointer. */
	readonly pointer: "fine" | "coarse" | "none";
	/** Whether the primary input mechanism supports hover. */
	readonly hover: boolean;
	readonly pixelRatio: number;
	/** Logical processor count, or null when unavailable. */
	readonly cores: number | null;
	/** Approximate memory in GB (Chromium only), or null when unavailable. */
	readonly memory: number | null;
	readonly languages: readonly string[];
	/** Whether the app is installed as a standalone PWA. */
	readonly standalone: boolean;
	readonly prefers: DevicePreferences;
}

export interface DeviceChangeEvent {
	readonly info: DeviceInfo;
	readonly previous: DeviceInfo;
	/** Names of changed fields, such as ["prefers.colorScheme", "pixelRatio"]. */
	readonly changed: readonly string[];
}

export type WindowState = "fullscreen" | "maximized" | "floating";

export interface WindowGeometry {
	readonly state: WindowState;
	/** `true` when the window is neither maximized nor fullscreen. */
	readonly floating: boolean;
	/** Outer window (including browser chrome) in screen coordinates. */
	readonly bounds: Rect;
	/** Window position within the available area of its screen. */
	readonly relative: { readonly x: number; readonly y: number };
	/** Inner window area (viewport). */
	readonly inner: Size;
	readonly ratio: Ratio;
}

export interface ViewportInfo extends Size {
	readonly ratio: Ratio;
	/** Pinch-zoom scale (visualViewport.scale). */
	readonly scale: number;
}

export interface ScreenInfo {
	readonly label: string;
	readonly primary: boolean;
	readonly internal: boolean;
	readonly current: boolean;
	readonly bounds: Rect;
	readonly available: Rect;
	readonly pixelRatio: number;
	readonly ratio: Ratio;
}

export interface ScreenEvents {
	/** Emitted when the window or viewport is resized. */
	resize: {
		readonly viewport: ViewportInfo;
		readonly window: WindowGeometry;
		readonly previous: Size;
	};
	/** Emitted when the window moves (detected by comparing its position every `pollInterval` ms). */
	move: {
		readonly bounds: Rect;
		readonly previous: Rect;
		readonly deltaX: number;
		readonly deltaY: number;
		readonly window: WindowGeometry;
	};
	/** Emitted when the window changes between floating, maximized, and fullscreen states. */
	state: {
		readonly state: WindowState;
		readonly previous: WindowState;
		readonly window: WindowGeometry;
	};
	/** Emitted when the screen orientation changes. */
	orientation: {
		readonly type: string | null;
		readonly angle: number;
		readonly previous: { readonly type: string | null; readonly angle: number };
	};
}

export interface ScreenOptions {
	/** Milliseconds between position checks while `move` or `state` listeners are registered. Defaults to 150. */
	pollInterval?: number;
}

export interface NetworkInfo {
	/** `navigator.onLine`: `false` is reliable; `true` only indicates that a network interface is available. */
	readonly online: boolean;
	/** Physical connection type (Network Information API; Chromium only). */
	readonly type:
		| "bluetooth"
		| "cellular"
		| "ethernet"
		| "wifi"
		| "wimax"
		| "other"
		| "none"
		| "unknown"
		| null;
	/** Estimated connection quality: "slow-2g" | "2g" | "3g" | "4g" (Chromium only). */
	readonly effectiveType: "slow-2g" | "2g" | "3g" | "4g" | null;
	/** Estimated bandwidth in Mbps. */
	readonly downlink: number | null;
	/** Estimated latency in milliseconds. */
	readonly rtt: number | null;
	/** Whether the user requested reduced data usage. */
	readonly saveData: boolean;
}

export interface NetworkEvents {
	online: { readonly info: NetworkInfo };
	offline: { readonly info: NetworkInfo };
	/** Emitted when online status or connection quality changes. */
	change: { readonly info: NetworkInfo; readonly previous: NetworkInfo };
}
