# Verification — 0.1.0

Tested against stock EmDash **1.3.0** (commit `d10d7ae1b`), Astro **7.4.0**,
React **19.3.1**, Node **24.18.0**, Bun **1.4.3**, and disposable SQLite/local media.
No EmDash core patches or Studio dependencies are required. Other database
adapters and deployment platforms have not been exercised.

On 2026-10-20, lint, typechecking, the runtime build, and all **12 tests / 51
assertions** passed. The npm tarball was installed into a separate clean site;
its production Astro build and actual browser page both passed. The installed
package also ran without the linked fixture's dependency-resolution overrides.

## Automated checks

Run from a clean checkout after `bun install --frozen-lockfile`:

```sh
bun run check
bun run typecheck
bun run build
bun test
```

The focused workflow and adapter tests challenge:

- Missing cursor pages, duplicate preview entries, and a non-advancing cursor.
- Accidentally adding newly trashed content during deletion.
- Stopping on restored entries instead of skipping them.
- Continuing after an uncertain deletion, or claiming it was acknowledged.
- Starting another delete after Stop, including during the settings preflight.
- Reporting a disabled plugin's missing route as successfully skipped content.
- Continuing after EmDash returns a deleted ID different from the requested ID.

The real HTTP host tests challenge:

- Anonymous, editor and CSRF-free requests changing administrator settings.
- Settings disappearing after restart; disabled plugins continuing to serve routes.
- Incomplete pagination: 102 previewed rows result in 101 deletes and one restored
  entry skipped, while live content, later trash and another collection survive.
- A stale page deleting after its module or plugin has been disabled.

The HTTP suite uses the product REST adapter and workflow with only origin/session
context supplied by the fixture. EmDash's actual routes and SQLite persistence own
the tested content behavior. Transport substitutes in focused tests are limited
to deterministic cancellation, connection failure, and protocol-result scenarios.

## Browser acceptance

The disposable host's actual plugin page was inspected in a browser at desktop
size and **390 × 844** in dark mode. Verified collection selection, exact two-entry
preview, cancellation, module disabling, persistence after reload, re-enabling,
focus on confirmation, and absence of horizontal overflow or browser errors.
Permanent deletion itself is verified by the HTTP suite; the manual browser lane
stops at confirmation/cancellation.

- [Desktop preview](admin-tools.jpg)
- [Mobile preview](admin-tools-mobile.jpg)

The linked fixture uses `ssr.noExternal: ["@astrojs/react"]` so Vite processes
Astro's virtual React options during local development. This is fixture setup,
not a change to EmDash or a dependency on a patched host.

## Native host limits

The permanent-delete endpoint has no revision/deletion-time precondition. Avoid
concurrent modifications to the selected collection. A restored-then-retrashed
candidate can still be deleted. Missing IDs may also resolve to another entry's
identical slug. The latter was reproduced using a real disposable SQLite runtime:
create/trash A, delete A elsewhere, create/trash B with slug equal to A's ID, then
request permanent deletion with A's ID. The native handler deletes B.

The plugin checks the response identity and stops on a mismatch, reporting the
confirmed side effect. This detects the host behavior after the deletion; it
cannot undo it or promise an atomic snapshot. No client-side preflight closes
that race. No raw SQL, private host handlers, or core edits are used to bypass it.

The public repository is source distribution. npm publication and production
installation are separate operations and have not been performed.
