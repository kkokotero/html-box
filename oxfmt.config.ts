import { defineConfig } from "oxfmt";

export default defineConfig({
	useTabs: true,
	tabWidth: 2,
	printWidth: 80,
	endOfLine: "lf",
	singleQuote: false,
	semi: true,
	trailingComma: "all",
	arrowParens: "always",
	bracketSpacing: true,
	insertFinalNewline: true,
	sortImports: true,
	// Preserve hand-written JSDoc blocks, including example indentation.
	jsdoc: false,
	ignorePatterns: [
		"dist/**",
		"node_modules/**",
		"coverage/**",
		".temp/**",
		"bun.lock",
	],
	overrides: [
		{
			files: ["*.md"],
			proseWrap: "preserve",
		},
	],
});
