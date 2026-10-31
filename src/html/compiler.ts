import { HtmlError, HtmlErrorCode } from "./html-error";
import {
	assertSafeAttributeName,
	assertSafePropertyName,
	assertSafeUrl,
	RAW_TEXT_ELEMENTS,
	URL_ATTRIBUTES,
} from "./security";

/** State maintained while scanning static template text. */
export type HtmlScanContext =
	| "text"
	| "tag"
	| "after-equals"
	| "double-quoted"
	| "single-quoted"
	| "unquoted"
	| "comment"
	| "declaration";

/** Mutable HTML lexical state spanning adjacent static template segments. */
export interface HtmlScanState {
	context: HtmlScanContext;
	tagName: string;
	attributeName: string;
	rawTextElement: string | null;
}

/** Parsed event modifiers for one event binding. */
export interface EventModifiers {
	once: boolean;
	capture: boolean;
	passive: boolean;
	prevent: boolean;
	stop: boolean;
}

/** Compiled binding descriptor associated with one node in the template tree. */
export type TemplatePart =
	| { kind: "child"; nodeIndex: number; valueIndex: number }
	| {
			kind: "attribute";
			nodeIndex: number;
			name: string;
			valueIndices: number[];
			staticSegments: string[];
	  }
	| {
			kind: "boolean-attribute";
			nodeIndex: number;
			valueIndex: number;
			name: string;
	  }
	| { kind: "property"; nodeIndex: number; valueIndex: number; name: string }
	| {
			kind: "event";
			nodeIndex: number;
			valueIndex: number;
			eventName: string;
			modifiers: EventModifiers;
	  };

/** Parsed template blueprint and the dynamic parts to apply when rendered. */
export interface CompiledTemplate {
	readonly template: HTMLTemplateElement;
	readonly parts: readonly TemplatePart[];
}

const ATTRIBUTE_NAME_PATTERN = /[^\s"'<>/=]+/y;
const TAG_NAME_PATTERN = /[A-Za-z][^\s/>]*/y;

/**
 * Advances the scanner over one static template segment.
 *
 * @param segment - Static template text.
 * @param state - Scanner state carried over from prior segments.
 */
export function scanHtmlSegment(segment: string, state: HtmlScanState): void {
	let offset = 0;
	while (offset < segment.length) {
		switch (state.context) {
			case "text": {
				if (state.rawTextElement) {
					const closeTag = new RegExp(`</${state.rawTextElement}`, "gi");
					closeTag.lastIndex = offset;
					const match = closeTag.exec(segment);
					if (!match) offset = segment.length;
					else {
						state.rawTextElement = null;
						offset = match.index;
					}
					break;
				}
				const openingBracket = segment.indexOf("<", offset);
				if (openingBracket === -1) {
					offset = segment.length;
					break;
				}
				if (segment.startsWith("<!--", openingBracket)) {
					state.context = "comment";
					offset = openingBracket + 4;
					break;
				}
				const next = segment[openingBracket + 1];
				if (next !== undefined && /[A-Za-z]/.test(next)) {
					TAG_NAME_PATTERN.lastIndex = openingBracket + 1;
					const match = TAG_NAME_PATTERN.exec(segment)!;
					state.tagName = match[0].toLowerCase();
					state.attributeName = "";
					state.context = "tag";
					offset = openingBracket + 1 + match[0].length;
				} else if (next === "!" || next === "/" || next === "?") {
					state.context = "declaration";
					offset = openingBracket + 2;
				} else offset = openingBracket + 1;
				break;
			}
			case "tag": {
				const character = segment[offset]!;
				if (character === ">") {
					if (RAW_TEXT_ELEMENTS.has(state.tagName))
						state.rawTextElement = state.tagName;
					state.context = "text";
					offset++;
				} else if (character === "=") {
					state.context = "after-equals";
					offset++;
				} else if (/[\s/]/.test(character)) offset++;
				else {
					ATTRIBUTE_NAME_PATTERN.lastIndex = offset;
					const match = ATTRIBUTE_NAME_PATTERN.exec(segment);
					if (match) {
						state.attributeName = match[0];
						offset += match[0].length;
					} else offset++;
				}
				break;
			}
			case "after-equals": {
				const character = segment[offset]!;
				if (/\s/.test(character)) offset++;
				else if (character === '"') {
					state.context = "double-quoted";
					offset++;
				} else if (character === "'") {
					state.context = "single-quoted";
					offset++;
				} else if (character === ">") state.context = "tag";
				else state.context = "unquoted";
				break;
			}
			case "double-quoted":
			case "single-quoted": {
				const quote = state.context === "double-quoted" ? '"' : "'";
				const end = segment.indexOf(quote, offset);
				if (end === -1) offset = segment.length;
				else {
					state.context = "tag";
					offset = end + 1;
				}
				break;
			}
			case "unquoted": {
				const character = segment[offset]!;
				if (/\s/.test(character)) {
					state.context = "tag";
					offset++;
				} else if (character === ">") state.context = "tag";
				else offset++;
				break;
			}
			case "comment": {
				const end = segment.indexOf("-->", offset);
				if (end === -1) offset = segment.length;
				else {
					state.context = "text";
					offset = end + 3;
				}
				break;
			}
			case "declaration": {
				const end = segment.indexOf(">", offset);
				if (end === -1) offset = segment.length;
				else {
					state.context = "text";
					offset = end + 1;
				}
				break;
			}
		}
	}
}

/** Produces a readable description of the current lexical context. */
export function describeScanContext(state: HtmlScanState): string {
	if (state.context === "comment") return "inside an HTML comment";
	if (state.context === "text") return `inside <${state.rawTextElement}>`;
	if (state.context === "tag") return "in a tag or attribute name";
	return "in this position";
}

/**
 * Compiles a static template literal into an inert DOM blueprint and bindings.
 *
 * @param strings - Frozen strings array supplied by a tagged template literal.
 * @returns A compiled template blueprint.
 * @throws {@link HtmlError} If the template has invalid interpolation positions or unsafe static markup.
 */
export function compileTemplate(
	strings: TemplateStringsArray,
): CompiledTemplate {
	if (typeof document === "undefined") {
		throw new HtmlError(
			HtmlErrorCode.NoDom,
			"html requires a DOM (document is not available).",
		);
	}

	const nonce = `h${Math.random().toString(36).slice(2, 10)}`;
	const token = (index: number) => `${nonce}_${index}_`;
	const tokenPattern = () => new RegExp(`${nonce}_(\\d+)_`, "g");
	const exactTokenPattern = new RegExp(`^${nonce}_(\\d+)_$`);
	const attributeNames: string[] = [];
	const state: HtmlScanState = {
		context: "text",
		tagName: "",
		attributeName: "",
		rawTextElement: null,
	};
	let markup = "";

	for (let index = 0; index < strings.length; index++) {
		const segment = strings[index];
		if (typeof segment !== "string") {
			throw new HtmlError(
				HtmlErrorCode.NotATemplate,
				"Template contains an invalid escape sequence.",
			);
		}
		scanHtmlSegment(segment, state);
		markup += segment;
		if (index === strings.length - 1) break;

		switch (state.context) {
			case "text":
				if (state.rawTextElement) {
					throw new HtmlError(
						HtmlErrorCode.InvalidPosition,
						`Interpolation is not allowed inside <${state.rawTextElement}>. Bind a property instead (e.g. <textarea .value=\${value}>).`,
					);
				}
				markup += `<!--${token(index)}-->`;
				break;
			case "after-equals":
				markup += token(index);
				attributeNames[index] = state.attributeName;
				state.context = "unquoted";
				break;
			case "double-quoted":
			case "single-quoted":
			case "unquoted":
				markup += token(index);
				attributeNames[index] = state.attributeName;
				break;
			default:
				throw new HtmlError(
					HtmlErrorCode.InvalidPosition,
					`Interpolation is only allowed in text and attribute values, not ${describeScanContext(state)}.`,
				);
		}
	}

	const template = document.createElement("template");
	template.innerHTML = markup;
	const parts: TemplatePart[] = [];
	const walker = document.createTreeWalker(template.content, 0x1 | 0x80);
	let nodeIndex = 0;
	for (
		let node = walker.nextNode();
		node;
		node = walker.nextNode(), nodeIndex++
	) {
		if (node.nodeType === 8) {
			const match = exactTokenPattern.exec((node as Comment).data);
			if (match)
				parts.push({ kind: "child", nodeIndex, valueIndex: Number(match[1]) });
			continue;
		}

		const element = node as Element;
		if (element.localName === "script") {
			throw new HtmlError(
				HtmlErrorCode.UnsafeElement,
				"<script> elements are not allowed in templates.",
			);
		}
		for (const attribute of Array.from(element.attributes)) {
			const valueIndices = [...attribute.value.matchAll(tokenPattern())].map(
				(match) => Number(match[1]),
			);
			const prefix = valueIndices.length
				? (attributeNames[valueIndices[0]!] ?? attribute.name)[0]
				: attribute.name[0];
			const isBinding = prefix === "@" || prefix === "." || prefix === "?";
			if (valueIndices.length === 0) {
				if (isBinding)
					throw new HtmlError(
						HtmlErrorCode.InvalidPosition,
						`Binding "${attribute.name}" needs an interpolation: ${attribute.name}=\${value}.`,
					);
				assertSafeAttributeName(attribute.name);
				if (URL_ATTRIBUTES.has(attribute.name.toLowerCase()))
					assertSafeUrl(attribute.name, attribute.value);
				continue;
			}

			const originalName = attributeNames[valueIndices[0]!] ?? attribute.name;
			if (isBinding) {
				if (
					valueIndices.length !== 1 ||
					attribute.value !== token(valueIndices[0]!)
				) {
					throw new HtmlError(
						HtmlErrorCode.InvalidPosition,
						`Binding "${originalName}" must be exactly one interpolation: ${originalName}=\${value}.`,
					);
				}
				element.removeAttribute(attribute.name);
				const name = originalName.slice(1);
				const valueIndex = valueIndices[0]!;
				if (prefix === "?") {
					if (!/^[A-Za-z_:][-\w:.]*$/.test(name))
						throw new HtmlError(
							HtmlErrorCode.InvalidName,
							`Invalid attribute name "${originalName}".`,
						);
					assertSafeAttributeName(name);
					parts.push({
						kind: "boolean-attribute",
						nodeIndex,
						valueIndex,
						name,
					});
				} else if (prefix === ".") {
					assertSafePropertyName(name);
					parts.push({ kind: "property", nodeIndex, valueIndex, name });
				} else {
					const [eventName, ...modifiers] = name.split(".");
					if (!eventName)
						throw new HtmlError(
							HtmlErrorCode.InvalidName,
							`Missing event name in "${originalName}".`,
						);
					const eventModifiers: EventModifiers = {
						once: false,
						capture: false,
						passive: false,
						prevent: false,
						stop: false,
					};
					for (const modifier of modifiers) {
						if (!Object.hasOwn(eventModifiers, modifier))
							throw new HtmlError(
								HtmlErrorCode.InvalidName,
								`Unknown event modifier ".${modifier}" in "${originalName}".`,
							);
						eventModifiers[modifier as keyof EventModifiers] = true;
					}
					parts.push({
						kind: "event",
						nodeIndex,
						valueIndex,
						eventName,
						modifiers: eventModifiers,
					});
				}
				continue;
			}

			assertSafeAttributeName(attribute.name);
			const staticSegments: string[] = [];
			let lastOffset = 0;
			for (const match of attribute.value.matchAll(tokenPattern())) {
				staticSegments.push(attribute.value.slice(lastOffset, match.index));
				lastOffset = match.index! + match[0].length;
			}
			staticSegments.push(attribute.value.slice(lastOffset));
			parts.push({
				kind: "attribute",
				nodeIndex,
				name: attribute.name,
				valueIndices,
				staticSegments,
			});
		}
	}

	const boundIndices = new Set<number>();
	for (const part of parts) {
		if (part.kind === "attribute")
			part.valueIndices.forEach((index) => boundIndices.add(index));
		else boundIndices.add(part.valueIndex);
	}
	if (boundIndices.size !== strings.length - 1) {
		throw new HtmlError(
			HtmlErrorCode.InvalidPosition,
			"Some interpolations could not be bound (inside a nested <template>, a duplicated attribute, or a place the HTML parser moved or dropped).",
		);
	}
	return { template, parts };
}
