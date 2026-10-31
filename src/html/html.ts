/**
 * HTML template tag implementation.
 *
 * @module
 */
import { renderTemplate } from "./render";
import { takeRootElement } from "./roots";
import type { HtmlOptions, HtmlTag } from "./types";

/**
 * Creates a template tag configured with shared listener options.
 *
 * @param options - Options applied to each render, including an optional abort signal.
 * @returns A tag that creates a single root element or a document fragment.
 * @example
 * ```ts
 * const controller = new AbortController();
 * const html = createHtml({ signal: controller.signal });
 * const button = html`<button @click=${() => console.log("clicked")}>Save</button>`;
 * controller.abort();
 * ```
 */
export function createHtml(options: HtmlOptions = {}): HtmlTag {
	const tag = (<E extends Element = HTMLElement>(
		strings: TemplateStringsArray,
		...values: unknown[]
	): E =>
		takeRootElement<E>(renderTemplate(strings, values, options))) as HtmlTag;

	tag.fragment = (strings, ...values) =>
		renderTemplate(strings, values, options);
	return tag;
}

/** Default HTML template tag. */
export const html: HtmlTag = createHtml();

export default html;
