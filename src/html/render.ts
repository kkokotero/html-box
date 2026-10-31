import {
	compileTemplate,
	type CompiledTemplate,
	type TemplatePart,
} from "./compiler";
import { HtmlError, HtmlErrorCode } from "./html-error";
import { assertSafeUrl, MAX_CHILD_DEPTH, URL_ATTRIBUTES } from "./security";
import { TrustedHtml, type HtmlOptions } from "./types";

const compiledTemplates = new WeakMap<TemplateStringsArray, CompiledTemplate>();

/**
 * Renders a template literal into a new document fragment.
 *
 * @param strings - Frozen template literal segments.
 * @param values - Dynamic values corresponding to template interpolations.
 * @param options - Render options shared by a configured template tag.
 * @returns A fragment containing the instantiated template.
 */
export function renderTemplate(
	strings: TemplateStringsArray,
	values: readonly unknown[],
	options: HtmlOptions,
): DocumentFragment {
	assertTemplateLiteral(strings);
	let compiled = compiledTemplates.get(strings);
	if (!compiled) {
		compiled = compileTemplate(strings);
		compiledTemplates.set(strings, compiled);
	}
	const fragment = document.importNode(compiled.template.content, true);
	const nodes = collectTemplateNodes(fragment);
	for (const part of compiled.parts) {
		const node = nodes[part.nodeIndex];
		if (!node)
			throw new HtmlError(
				HtmlErrorCode.InvalidPosition,
				"A compiled template binding no longer points to an available node.",
			);
		applyTemplatePart(node, part, values, options);
	}
	return fragment;
}

/** Verifies that a strings array came from a tagged template literal. */
function assertTemplateLiteral(
	strings: unknown,
): asserts strings is TemplateStringsArray {
	const candidate = strings as { raw?: unknown } | null;
	if (
		!Array.isArray(strings) ||
		!Array.isArray(candidate?.raw) ||
		!Object.isFrozen(strings)
	) {
		throw new HtmlError(
			HtmlErrorCode.NotATemplate,
			"html must be used as a template tag: html`...`. To insert trusted markup from a string use unsafeHtml(markup).",
		);
	}
}

/** Collects elements and comments using the same document order used during compilation. */
function collectTemplateNodes(root: DocumentFragment): Node[] {
	const nodes: Node[] = [];
	const walker = document.createTreeWalker(root, 0x1 | 0x80);
	for (let node = walker.nextNode(); node; node = walker.nextNode())
		nodes.push(node);
	return nodes;
}

/** Checks whether a value belongs to the current realm's DOM node hierarchy. */
function isDomNode(value: unknown): value is Node {
	return typeof Node !== "undefined" && value instanceof Node;
}

/** Returns a stable type label suitable for validation errors. */
function describeValueType(value: unknown): string {
	if (value === null) return "null";
	if (typeof value !== "object") return typeof value;
	return value.constructor?.name ?? "object";
}

/** Appends supported dynamic child values without parsing ordinary strings as HTML. */
function appendChildValue(parent: Node, value: unknown, depth: number): void {
	if (depth > MAX_CHILD_DEPTH)
		throw new HtmlError(
			HtmlErrorCode.InvalidValue,
			"Interpolated value is nested too deeply.",
		);
	if (value === null || value === undefined || typeof value === "boolean")
		return;
	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "bigint"
	) {
		parent.appendChild(document.createTextNode(String(value)));
		return;
	}
	if (isDomNode(value)) {
		parent.appendChild(value);
		return;
	}
	if (value instanceof TrustedHtml) {
		const trustedMarkup = value.markup;
		const holder = document.createElement("template");
		holder.innerHTML = trustedMarkup;
		parent.appendChild(document.importNode(holder.content, true));
		return;
	}
	if (typeof value === "object" && Symbol.iterator in value) {
		for (const item of value as Iterable<unknown>)
			appendChildValue(parent, item, depth + 1);
		return;
	}
	throw new HtmlError(
		HtmlErrorCode.InvalidValue,
		`Cannot render a value of type ${describeValueType(value)} as content. Use a string, number, Node, iterable, or unsafeHtml().`,
	);
}

/** Converts a primitive attribute binding into text. */
function toAttributeText(name: string, value: unknown): string {
	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "bigint" ||
		typeof value === "boolean"
	)
		return String(value);
	throw new HtmlError(
		HtmlErrorCode.InvalidValue,
		`Cannot use a value of type ${describeValueType(value)} in attribute "${name}". Use a primitive, or bind a property with .${name}=\${value}.`,
	);
}

/** Applies an interpolated standard attribute binding. */
function applyAttributeBinding(
	element: Element,
	part: Extract<TemplatePart, { kind: "attribute" }>,
	values: readonly unknown[],
): void {
	const isWholeValue =
		part.valueIndices.length === 1 &&
		part.staticSegments[0] === "" &&
		part.staticSegments[1] === "";
	let text: string;
	if (isWholeValue) {
		const value = values[part.valueIndices[0]!];
		if (value === null || value === undefined) {
			element.removeAttribute(part.name);
			return;
		}
		text = toAttributeText(part.name, value);
	} else {
		text = part.staticSegments[0]!;
		part.valueIndices.forEach((valueIndex, index) => {
			const value = values[valueIndex];
			text +=
				(value === null || value === undefined
					? ""
					: toAttributeText(part.name, value)) +
				part.staticSegments[index + 1]!;
		});
	}
	if (URL_ATTRIBUTES.has(part.name.toLowerCase()))
		assertSafeUrl(part.name, text);
	element.setAttribute(part.name, text);
}

/** Applies a property binding, validating URL-bearing properties when applicable. */
function applyPropertyBinding(
	element: Element,
	name: string,
	value: unknown,
): void {
	if (
		URL_ATTRIBUTES.has(name.toLowerCase()) &&
		(typeof value === "string" ||
			(typeof URL !== "undefined" && value instanceof URL))
	) {
		assertSafeUrl(name, String(value));
	}
	(element as unknown as Record<string, unknown>)[name] = value;
}

/** Adds a DOM event listener for an event binding. */
function addBoundEventListener(
	element: Element,
	part: Extract<TemplatePart, { kind: "event" }>,
	value: unknown,
	signal?: AbortSignal,
): void {
	if (value === null || value === undefined) return;
	const isFunction = typeof value === "function";
	const isListenerObject =
		typeof value === "object" &&
		typeof (value as { handleEvent?: unknown }).handleEvent === "function";
	if (!isFunction && !isListenerObject) {
		throw new HtmlError(
			HtmlErrorCode.InvalidValue,
			`Event "@${part.eventName}" expects a function or { handleEvent }, got ${describeValueType(value)}.`,
		);
	}
	const { once, capture, passive, prevent, stop } = part.modifiers;
	let listener = value as EventListenerOrEventListenerObject;
	if (prevent || stop) {
		listener = function (this: Element, event: Event): void {
			if (prevent) event.preventDefault();
			if (stop) event.stopPropagation();
			if (isFunction)
				(value as (this: Element, event: Event) => void).call(this, event);
			else (value as EventListenerObject).handleEvent(event);
		};
	}
	element.addEventListener(part.eventName, listener, {
		once,
		capture,
		...(passive ? { passive: true } : {}),
		...(signal ? { signal } : {}),
	});
}

/** Applies one compiled binding to an instantiated template node. */
function applyTemplatePart(
	node: Node,
	part: TemplatePart,
	values: readonly unknown[],
	options: HtmlOptions,
): void {
	const element = node as Element;
	switch (part.kind) {
		case "child": {
			const content = document.createDocumentFragment();
			appendChildValue(content, values[part.valueIndex], 0);
			node.parentNode?.replaceChild(content, node);
			break;
		}
		case "attribute":
			applyAttributeBinding(element, part, values);
			break;
		case "boolean-attribute":
			element.toggleAttribute(part.name, Boolean(values[part.valueIndex]));
			break;
		case "property":
			applyPropertyBinding(element, part.name, values[part.valueIndex]);
			break;
		case "event":
			addBoundEventListener(
				element,
				part,
				values[part.valueIndex],
				options.signal,
			);
			break;
	}
}
