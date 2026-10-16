# @infomil/scrum-shared

Private, source-only ESM package shared by the master application at the repository root and the participant application in `apps/participants`. Version: 1.0.0. React >=19 is a peer dependency; there are no runtime dependencies.

## Public boundaries

- `@infomil/scrum-shared/types`: public notes, participant history and portal DTOs, not database entities or master roster state.
- `@infomil/scrum-shared/daily-hints`: the canonical daily hint validator and compatible type aliases. Preserves French errors, Unicode code-point limits, strict LF controls, exact own-key validation and CAS revision bounds.
- `@infomil/scrum-shared/contracts`: browser-safe response projection/parsers and link shape checks. `validateNote` is the exact same function as `validateDailyHint`; link patterns do not authenticate HMACs.
- `@infomil/scrum-shared/statistics`: pure participant reporting helpers. Archived scores are read, never recalculated.
- `@infomil/scrum-shared/ui`: client React primitives and Tailwind recipes. Each app must scan this package's source and supply the brand theme tokens.

The master alone owns the database schema, migrations, persistence, authentication secrets, signing, authorization and writes. This package must not import database/server modules, environment secrets, Next.js or either application's source. No database schema is copied into the participant app. Shared contracts are the single source of truth; application compatibility modules only re-export them. Daily hint validation never imports contracts (no circular dependency).

Install dependencies from the monorepo root to link the npm workspaces before running either app. Exports point directly to TypeScript/TSX: Next.js compiles UI, while Node >=22.6 tests use `--experimental-strip-types` for pure `.ts` modules. Workspace symlinks must resolve to this repository's real source, not copied TypeScript under `node_modules`; Node does not strip TypeScript inside `node_modules`. No generated JavaScript or publishing step is required. Tests that import UI need a JSX-capable runner, not Node's type stripper.

After linking workspaces, run the root and participant package scripts for tests, typechecking, linting and builds. The root shared-package regression test covers canonical validator identity/security, public projection, history type identity and application adoption. Root typechecking includes that test for compile-time assertions.