/** Stable error codes exposed by the HTML template API. */
export enum HtmlErrorCode {
	/** The tag was called as a function instead of used as a template literal. */
	NotATemplate = "NOT_A_TEMPLATE",
	/** The current environment does not provide a DOM. */
	NoDom = "NO_DOM",
	/** An interpolation appears in a tag, name, comment, or unsupported context. */
	InvalidPosition = "INVALID_POSITION",
	/** A dynamic value has an unsupported type or shape. */
	InvalidValue = "INVALID_VALUE",
	/** A binding name is malformed or uses an unsupported event modifier. */
	InvalidName = "INVALID_NAME",
	/** A single-root template does not contain exactly one element. */
	InvalidRoot = "INVALID_ROOT",
	/** A URL binding uses a disallowed scheme. */
	UnsafeUrl = "UNSAFE_URL",
	/** An unsafe static or dynamic attribute was detected. */
	UnsafeAttribute = "UNSAFE_ATTRIBUTE",
	/** A property binding targets a blocked property. */
	UnsafeProperty = "UNSAFE_PROPERTY",
	/** A prohibited element, such as `<script>`, was found. */
	UnsafeElement = "UNSAFE_ELEMENT",
}

/** Error thrown when an HTML template cannot be validated or rendered. */
export class HtmlError extends Error {
	/** Machine-readable failure code. */
	readonly code: HtmlErrorCode;

	/**
	 * Creates an HTML API error.
	 *
	 * @param code - Stable failure code.
	 * @param message - Human-readable explanation.
	 */
	constructor(code: HtmlErrorCode, message: string) {
		super(message);
		this.name = "HtmlError";
		this.code = code;
	}
}
