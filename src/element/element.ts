/** Common HTML, SVG, and DOM element manipulation operations. */
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const ATTRIBUTE_NAMESPACES: Record<string, string> = {
	"xlink:href": "http://www.w3.org/1999/xlink",
	"xml:lang": "http://www.w3.org/XML/1998/namespace",
	"xml:space": "http://www.w3.org/XML/1998/namespace",
	xmlns: "http://www.w3.org/2000/xmlns/",
	"xmlns:xlink": "http://www.w3.org/2000/xmlns/",
};

export class Element {
	private constructor() {}

	/**
	 * Create an HTML element by tag name.
	 *
	 * @param tagName - HTML tag name. Known tags are narrowed to their DOM type.
	 * @returns A detached element created by the current document.
	 * @throws {Error} If no global document is available.
	 * @example
	 * ```ts
	 * const button = Element.create("button");
	 * button.type = "button";
	 * ```
	 */
	static create<K extends keyof HTMLElementTagNameMap>(
		tagName: K,
	): HTMLElementTagNameMap[K];
	static create(tagName: string): HTMLElement;
	static create(tagName: string): HTMLElement {
		if (typeof document === "undefined") {
			throw new Error("Element.create requires a global document.");
		}
		return document.createElement(tagName);
	}

	/**
	 * Create an SVG element in the SVG namespace.
	 *
	 * @param tagName - SVG tag name. Known tags are narrowed to their SVG type.
	 * @returns A detached SVG element created by the current document.
	 * @throws {Error} If no global document is available.
	 * @example
	 * ```ts
	 * const circle = Element.createSvg("circle");
	 * circle.setAttribute("r", "12");
	 * ```
	 */
	static createSvg<K extends keyof SVGElementTagNameMap>(
		tagName: K,
	): SVGElementTagNameMap[K];
	static createSvg(tagName: string): SVGElement;
	static createSvg(tagName: string): SVGElement {
		if (typeof document === "undefined") {
			throw new Error("Element.createSvg requires a global document.");
		}
		return document.createElementNS(SVG_NAMESPACE, tagName);
	}

	/**
	 * Create an element in a specific namespace.
	 *
	 * Use {@link Element.createSvg} when creating SVG elements to get tag-based
	 * SVG type inference.
	 *
	 * @param namespace - Namespace URI for the new element.
	 * @param qualifiedName - Qualified element name.
	 * @returns A detached element in the requested namespace.
	 * @throws {Error} If no global document is available.
	 */
	static createNS<T extends globalThis.Element = globalThis.Element>(
		namespace: string | null,
		qualifiedName: string,
	): T {
		if (typeof document === "undefined") {
			throw new Error("Element.createNS requires a global document.");
		}
		return document.createElementNS(namespace, qualifiedName) as T;
	}

	/**
	 * Remove an element from its parent, if it has one.
	 *
	 * @param element - Element to remove.
	 * @returns The same element, now detached when it had a parent.
	 */
	static remove<T extends globalThis.Element>(element: T): T {
		element.remove();
		return element;
	}

	/**
	 * Replace an element with another element.
	 *
	 * If the old element is detached, the new element remains where it is and no
	 * operation is performed.
	 *
	 * @param current - Element to replace.
	 * @param next - Replacement element.
	 * @returns The original element, now detached when it had a parent.
	 */
	static replace<
		Current extends globalThis.Element,
		Next extends globalThis.Element,
	>(current: Current, next: Next): Current {
		current.replaceWith(next);
		return current;
	}

	/**
	 * Clone an element, including its descendants by default.
	 *
	 * @param element - Element to clone.
	 * @param deep - Whether to clone descendants. Defaults to `true`.
	 * @returns A detached clone with the same DOM element type.
	 */
	static clone<T extends globalThis.Element>(element: T, deep = true): T {
		return element.cloneNode(deep) as T;
	}

	/**
	 * Append nodes or text to an element.
	 *
	 * @param parent - Element that receives the content.
	 * @param children - Nodes or strings to append in order.
	 * @returns The parent element for convenient composition.
	 */
	static append<T extends globalThis.Element>(
		parent: T,
		...children: (Node | string)[]
	): T {
		parent.append(...children);
		return parent;
	}

	/**
	 * Remove all child nodes from an element while preserving the element itself.
	 *
	 * @param element - Element whose contents should be cleared.
	 * @returns The same now-empty element.
	 */
	static empty<T extends globalThis.Element>(element: T): T {
		element.replaceChildren();
		return element;
	}

	/**
	 * Check whether a parent is or contains a candidate node.
	 *
	 * @param parent - Candidate parent element.
	 * @param candidate - Node to check.
	 * @returns `true` when the parent contains the candidate or is the candidate.
	 */
	static contains(parent: globalThis.Element, candidate: Node): boolean {
		return parent === candidate || parent.contains(candidate);
	}

	/**
	 * Set, remove, or toggle element attributes in bulk.
	 *
	 * `null`, `undefined`, and `false` remove an attribute; `true` sets it to an
	 * empty string. Common `xlink`, `xml`, and `xmlns` attributes are assigned in
	 * their proper namespaces, which is useful for SVG.
	 *
	 * @param element - HTML or SVG element to update.
	 * @param attributes - Attribute names and values to apply.
	 * @returns The same element for chaining.
	 */
	static setAttributes<T extends globalThis.Element>(
		element: T,
		attributes: Record<string, string | number | boolean | null | undefined>,
	): T {
		for (const [name, value] of Object.entries(attributes)) {
			const namespace = ATTRIBUTE_NAMESPACES[name];
			if (value === null || value === undefined || value === false) {
				if (namespace)
					element.removeAttributeNS(namespace, name.split(":").at(-1)!);
				else element.removeAttribute(name);
				continue;
			}

			if (namespace) {
				element.setAttributeNS(
					namespace,
					name,
					value === true ? "" : String(value),
				);
			} else {
				element.setAttribute(name, value === true ? "" : String(value));
			}
		}
		return element;
	}
}
