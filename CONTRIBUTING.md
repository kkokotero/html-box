# Contributing to HTML Box

Thanks for taking the time to improve HTML Box. Bug reports, documentation fixes, tests, and focused feature proposals are welcome.

## Before you start

- For bugs, check existing issues and include a minimal reproduction.
- For larger changes or new public APIs, open an issue or discussion first so we can agree on the shape of the change.
- Keep pull requests focused. Explain what changed and why, and call out any behavior or API compatibility impact.

## Development setup

Use Node.js 22 or 24 to match the project's CI workflow. Node.js 18 is the minimum supported runtime.

```bash
git clone https://github.com/kkokotero/html-box.git
cd html-box
npm install
```

Each module has its own directory under `src/` and exports its public API from `index.ts`. Tests live under `test/`.

## Before opening a pull request

Run the same validation steps used by CI:

```bash
npm run check
npm test
npm run build
npm pack --dry-run
```

For code changes, add or update tests for the behavior. Prefer focused tests that cover normal use, edge cases, and cleanup. DOM tests run in jsdom; if a change depends on browser-only behavior, describe how you verified it in a browser.

For public API changes:

- Add JSDoc to exported members and types.
- Export the API from the module's `index.ts`.
- Add a package subpath and build entry when introducing a module.
- Update the README with a concise example and any important limitations.
- Document breaking changes and migration steps in the pull request.

## Pull requests

Use the pull request template and complete the relevant checklist. Include:

- The problem and the reason for the change.
- A concise summary of the implementation.
- Test and build results.
- Any trade-offs, limitations, or breaking changes.

Be open to review feedback. Maintainers may ask for changes, clarification, or a smaller scope before merging.
