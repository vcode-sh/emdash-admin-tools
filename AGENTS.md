# EmDash Admin Tools

- Keep this an independent native plugin. Never patch EmDash core, import host
  internals in product code, manipulate the host DOM, or write CMS tables directly.
- Use documented plugin extensions and the supported REST API for EmDash 1.3.0.
- Write artifacts in English. Handwritten code files: at most 220 lines; tests: 600.
- Each feature owns a directory under `src/modules/`. The registry contains only
  feature metadata; server settings and admin components have separate owners.
- Feature settings are plugin-scoped. EmDash owns plugin activation and CMS data.
- For tests, exercise actual behavior with independent expected results. Use a
  disposable host for permissions, CSRF, persistence, and irreversible operations.
- Verify with `bun run check`, `bun run typecheck`, `bun test`, and `bun run build`.
  UI and destructive changes also require the disposable host/browser lane.
- Preserve unrelated work. Commit or publish only within the user's explicit scope.
