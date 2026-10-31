import { HtmlError, HtmlErrorCode } from "./html-error";

/** Element content models that must not receive dynamic child interpolation. */
export const RAW_TEXT_ELEMENTS: ReadonlySet<string> = new Set([
	"script",
	"style",
	"textarea",
	"title",
]);

/** Attribute and property names that can contain navigable or loadable URLs. */
export const URL_ATTRIBUTES: ReadonlySet<string> = new Set([
	"href",
	"src",
	"action",
	"formaction",
	"xlink:href",
	"poster",
	"cite",
	"data",
	"background",
	"ping",
	"manifest",
	"longdesc",
	"codebase",
]);

const SAFE_URL_SCHEMES: ReadonlySet<string> = new Set([
	"http",
	"https",
	"mailto",
	"tel",
	"sms",
	"ftp",
	"blob",
]);

/** Maximum supported nesting depth for iterable child values. */
export const MAX_CHILD_DEPTH = 32;

/**
 * Determines whether a URL uses a permitted scheme.
 *
 * Relative URLs and fragment/query references are permitted. Raster image data
 * URLs are also allowed for common image formats.
 *
 * @param value - URL text to validate.
 * @returns `true` if no disallowed scheme is present.
 */
export function isSafeUrl(value: string): boolean {
	// These controls are stripped because browsers may ignore them in URL schemes.
	// oxlint-disable no-control-regex
	const compact = value
		.replace(
			/[\u0000-\u0020\u007F-\u009F\u00AD\u200B-\u200F\u2028\u2029\uFEFF]/g,
			"",
		)
		// oxlint-enable no-control-regex
		.toLowerCase();
	const scheme = /^([a-z][a-z0-9+.\\-]*):/.exec(compact)?.[1];
	if (!scheme) return true;
	if (SAFE_URL_SCHEMES.has(scheme)) return true;
	return (
		scheme === "data" &&
		/^data:image\/(?:png|jpe?g|gif|webp|avif|bmp)[;,]/.test(compact)
	);
}

/** Rejects a URL value with a disallowed scheme. */
export function assertSafeUrl(name: string, value: string): void {
	if (!isSafeUrl(value)) {
		const preview = value.length > 40 ? `${value.slice(0, 40)}…` : value;
		throw new HtmlError(
			HtmlErrorCode.UnsafeUrl,
			`Unsafe URL in "${name}": "${preview}". Allowed schemes: http, https, mailto, tel, sms, ftp, blob, and raster image data URLs.`,
		);
	}
}

/** Rejects inline event handlers and iframe `srcdoc` attributes. */
export function assertSafeAttributeName(name: string): void {
	const lower = name // oxlint-enable no-control-regex
		.toLowerCase();
	if (/^on[a-z]/.test(lower)) {
		throw new HtmlError(
			HtmlErrorCode.UnsafeAttribute,
			`Inline event handler attribute "${name}" is not allowed. Use @event=\${handler}.`,
		);
	}
	if (lower === "srcdoc") {
		throw new HtmlError(
			HtmlErrorCode.UnsafeAttribute,
			'Attribute "srcdoc" is not allowed.',
		);
	}
}

/** Validates property binding names and blocks dangerous HTML/event properties. */
export function assertSafePropertyName(name: string): void {
	if (!/^[A-Za-z_$][\w$]*$/.test(name)) {
		throw new HtmlError(
			HtmlErrorCode.InvalidName,
			`Invalid property name ".${name}".`,
		);
	}
	const lower = name // oxlint-enable no-control-regex
		.toLowerCase();
	if (
		lower === "innerhtml" ||
		lower === "outerhtml" ||
		lower === "srcdoc" ||
		/^on[a-z]/.test(lower) ||
		name === "__proto__" ||
		name === "constructor" ||
		name === "prototype"
	) {
		throw new HtmlError(
			HtmlErrorCode.UnsafeProperty,
			`Property ".${name}" is not allowed.`,
		);
	}
}
