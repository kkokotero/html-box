/** Root element extraction helpers for the HTML template API. */
import { HtmlError, HtmlErrorCode } from "./html-error";

/**
 * Removes and returns the only element at the top level of a fragment.
 *
 * @typeParam E - Expected element type.
 * @param fragment - Rendered fragment to inspect.
 * @returns Its single root element.
 * @throws {@link HtmlError} If the fragment does not contain exactly one element root.
 */
export function takeRootElement<E extends Element>(
	fragment: DocumentFragment,
): E {
	let root: Element | null = null;
	for (const node of Array.from(fragment.childNodes)) {
		if (node.nodeType === 1) {
			if (root)
				throw new HtmlError(
					HtmlErrorCode.InvalidRoot,
					"html`` must have exactly one root element. Use html.fragment`` for several.",
				);
			root = node as Element;
		} else if (
			node.nodeType === 8 ||
			(node.nodeType === 3 && !node.nodeValue?.trim())
		)
			continue;
		else
			throw new HtmlError(
				HtmlErrorCode.InvalidRoot,
				"html`` must contain only one root element, without surrounding text. Use html.fragment``.",
			);
	}
	if (!root)
		throw new HtmlError(
			HtmlErrorCode.InvalidRoot,
			"html`` must contain one root element.",
		);
	root.remove();
	return root as E;
}
