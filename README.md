# Volar Happy Path

> A minimal, **working** Volar.js language extension scaffold.
> Press <kbd>F5</kbd>, open a `.happy` file, see activation logs. That's it.
>
> _Last verified: Volar `2.4.28`, Node 24 LTS, pnpm 11, vscode-languageclient 9 — 2026-05-15._

---

> 🥬 **Happy Path** — distilled from **Yegór Karimov**'s real-world work on a
> literate programming framework. The walls he hit so you don't.
>
> 🐌 If it saved you a weekend, consider supporting our education organisation
> **Quadrivium Academy**: **[ko-fi.com/quadrivium](https://ko-fi.com/quadrivium)**. Thank you. 🙏

This repository is a complement to the official Volar guide,
[**Your First Volar Language Server**](https://volarjs.dev/guides/first-server/),
which is marked _"work in progress"_ at the top and stops mid-implementation
in the `languagePlugin.ts` section. The Happy Path picks up where that guide
leaves off and gives you a **runnable starter** with the gaps filled in:

- pnpm 11 workspace, explicit and current (pinned via `packageManager`, with `pnpm-workspace.yaml` and the `allowBuilds` block pnpm 11 introduced)
- Vite library mode for both packages (replaces the `bun build` / `esbuild` script the guide elides)
- A complete `HappyVirtualCode` class — including the `mappings` field the guide's `Html1Code` snippet omits, which is required by `VirtualCode`
- The plugin actually registered in `createSimpleProject([happyLanguagePlugin])` (the guide's example passes an empty array)
- `.vscode/launch.json` + `.vscode/tasks.json` checked in, so <kbd>F5</kbd> just works
- Diagnostic `console.log` at every plugin entry point, so you can _see_ the
  Volar lifecycle (`getLanguageId` → `createVirtualCode` → `updateVirtualCode`)
  before you write any real parser code

The project's only language semantics are: _"a file ending in `.happy` exists."_
Nothing is parsed. The point is the **plumbing**.

MIT licensed. Fork freely.

---

## Quick start

Prerequisites: Node 24+ (LTS) or Node 26 (current); pnpm 11+; VS Code.

```sh
git clone https://github.com/athrio-com/volar-happy.git
cd volar-happy
pnpm install
```

Then in VS Code: open the repo folder, press <kbd>F5</kbd>.

A second VS Code window opens ("Extension Development Host") with
`samples/` already open. Open `samples/hello.happy`. Then:

1. **View → Output** (or <kbd>Cmd/Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>U</kbd>)
2. Choose **"Happy Language Server"** from the channel dropdown on the right.

You should see:

```text
[Happy] getLanguageId: /…/samples/hello.happy
[Happy]   -> matched 'happy'
[Happy] createVirtualCode: /…/samples/hello.happy languageId= happy
[Happy]   -> constructing HappyVirtualCode
[Happy]   HappyVirtualCode constructor: length = …
[Happy]   onSnapshotUpdated: text length = …
[Happy]   first 200 chars: "…"
```

Type into the file. Every keystroke produces an `updateVirtualCode` entry.
You now have a closed feedback loop with Volar. Build a real plugin on top.

---

## Architecture

```
volar-happy/
├── packages/
│   ├── language-server/                LSP server (Node subprocess)
│   │   ├── bin/happy-language-server.js   CLI shim — works for non-VS-Code clients (Neovim, Zed)
│   │   ├── src/
│   │   │   ├── index.ts                Wires Volar's connection, registers services
│   │   │   └── languagePlugin.ts       The plugin — getLanguageId, createVirtualCode, updateVirtualCode
│   │   └── vite.config.ts              Library bundle → dist/happy-server.js (CJS, Node target)
│   └── vscode/                         VS Code extension (the "client")
│       ├── src/vscode-extension.ts     Spawns the server, attaches LanguageClient
│       ├── language-configuration.json VS Code-only: brackets, comments, auto-closing pairs (no LSP involved)
│       └── vite.config.ts              Library bundle → dist/vscode-extension.js
├── samples/hello.happy                 Demo file to open in the Extension Development Host
├── .vscode/
│   ├── launch.json                     "Run Happy Extension" (F5) + "Attach to Happy Server"
│   └── tasks.json                      build / watch tasks, invoked by F5's preLaunchTask
├── pnpm-workspace.yaml
├── tsconfig.base.json                  Strict TS, NodeNext modules, declarations + sourcemaps
└── tsconfig.json                       Root — for editor IntelliSense across the workspace
```

**Three processes, two boundaries.** VS Code is one process; the extension
(the "client", `packages/vscode`) runs inside its extension host. The
language server (`packages/language-server`) is a separate Node subprocess
that the extension spawns. Communication: VS Code ↔ extension via in-process
API; extension ↔ server via LSP JSON-RPC over IPC. Everything Volar does —
your plugin, your future parser, future services — runs inside the server
subprocess.

The flow when you open a `.happy` file:

1. VS Code fires `onLanguage:happy` → activates the extension.
2. Extension calls `client.start()` → spawns `node dist/happy-server.js` with an IPC channel.
3. Client and server exchange LSP `initialize` / `initialized`.
4. VS Code sends `textDocument/didOpen { uri, text }`.
5. Volar stores `text` as a snapshot. Then it calls:
   - `happyLanguagePlugin.getLanguageId(uri)` → `'happy'`
   - `happyLanguagePlugin.createVirtualCode(uri, 'happy', snapshot)` ← **your parser runs here**
6. Volar caches the returned `VirtualCode`. Nothing else happens until VS Code asks (hover, completion, diagnostics, …) or the document changes.

On change: `textDocument/didChange` → Volar calls `updateVirtualCode(uri, code, newSnapshot)` → your `code.update(newSnapshot)` runs again with the full new text.

---

## Step-by-step (mirrors the official guide, completed)

The numbered sections below align with the official guide's headings. Where
the guide is complete and correct, this README points back to it. Where the
guide is incomplete, the README fills in.

### 1. Prerequisites

Same as the guide. Node ≥ 20 works; we pin **Node 24 LTS** in `.nvmrc`.
The Volar maintainers test against current-Node and current-pnpm.

### 2. Getting started — pnpm workspace

The guide shows `npm init -w …` commands. With pnpm the equivalent is:

```sh
mkdir volar-happy && cd volar-happy
pnpm init                       # root
mkdir -p packages/language-server packages/vscode
# Edit root package.json: "private": true, add "packageManager", "engines"
# Create pnpm-workspace.yaml (see below)
pnpm install
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - packages/*
```

> **pitfall** — pnpm reads `pnpm-workspace.yaml`, **not** the
> `workspaces` field in `package.json`. If you copied a Bun or Yarn setup,
> remove the `workspaces` array; pnpm silently ignores it.

The first `pnpm install` may print
`Ignored build scripts: @parcel/watcher, esbuild, msgpackr-extract`.
pnpm 11 requires you to explicitly approve native postinstall scripts.
Add to `pnpm-workspace.yaml`:

```yaml
allowBuilds:
  '@parcel/watcher': true
  esbuild: true
  msgpackr-extract: true
```

Then `pnpm install` again.

### 3. Installing and configuring TypeScript

Same as the guide, with a richer base config. `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "lib": ["ES2021"],
    "module": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "composite": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

Each package's own `tsconfig.json` is just:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "out", "rootDir": "src" },
  "include": ["src"]
}
```

> **pitfall** — the guide's minimal `{ "module": "nodenext" }` inherits
> TypeScript's silent defaults: `target: ES5`, `strict: false`, no
> declarations, no sourcemaps. Fine for a tutorial, not for a real
> server. The base above is what the official starter uses.

### 4. Defining VS Code tasks

The guide's `.vscode/launch.json` works. The Happy Path adds two pieces
the guide leaves to the reader's imagination:

- `preLaunchTask: "build"` in `launch.json` so <kbd>F5</kbd> rebuilds before launching.
- A `.vscode/tasks.json` defining that `build` task (and a parallel `watch` task).

Both files are checked into this repo; see `.vscode/`. The `build` task
shells out to `pnpm -r build`, which fans out to each package's `vite build`.

> **pitfall** — `preLaunchTask: "build"` silently does nothing if
> `.vscode/tasks.json` is missing or the label doesn't match exactly.
> Case-sensitive.

### 5. The client (`packages/vscode`)

The full client is in `packages/vscode/src/vscode-extension.ts`.
Two corrections vs. the guide's example:

```ts
// 1. NAMED imports from vscode-languageclient/node — not `import * as lsp`.
//    Some bundler + CJS interop combinations leave the namespace empty,
//    so TransportKind ends up `undefined` and activation fails with
//    "Cannot read properties of undefined (reading 'ipc')".
import {
  type BaseLanguageClient,
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

// 2. `execArgv: [] as string[]` — not `<string[]>[]`.
//    Node's built-in TS type-stripping rejects angle-bracket casts.
//    Even when bundled, keeping the `as` form avoids the surprise.
options: { execArgv: [] as string[] },
```

The server module path uses workspace symlinks:

```ts
const serverModule = vscode.Uri.joinPath(
  context.extensionUri,
  "node_modules",
  "@volar-happy",
  "language-server",
  "dist",
  "happy-server.js",
);
```

For this to resolve at runtime, `@volar-happy/language-server` must be
declared as a dependency in `packages/vscode/package.json` as
`"workspace:*"`. pnpm then creates the symlink inside
`packages/vscode/node_modules/@volar-happy/language-server/` on `pnpm install`.

`@types/vscode` belongs in `devDependencies`. Types are erased at build time.

### 6. The server (`packages/language-server`)

`packages/language-server/src/index.ts` is plain Volar wiring — see the
guide. The Happy Path differs in **two** places:

- The plugin is **actually registered**:
  ```ts
  createSimpleProject([
    happyLanguagePlugin,    // ← the guide passes [] here
  ])
  ```
- HTML + CSS services are registered to mirror the guide. They're
  inert for the `.happy` root language but verify the service wiring.

`packages/language-server/bin/happy-language-server.js` is the cross-editor
CLI shim. Editors that aren't VS Code (Zed, Neovim) launch the server via
this bin entry. The bundle is the same; only the spawn path differs.

### 7. Server configuration — bundling with Vite

The guide implicitly assumes Node 22's built-in TypeScript type-stripping
can run the server's `.ts` directly. It can't, reliably — angle-bracket
casts, enums, TS-only syntax in some Volar dependencies all trip it.
Bundle properly.

Each package has a `vite.config.ts` in library mode:

```ts
import { defineConfig } from "vite";
import { builtinModules, createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const pkg = require("./package.json") as { dependencies?: Record<string, string> };
const runtimeDeps = Object.keys(pkg.dependencies ?? {});

const nodeBuiltins = [
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
];

const isExternal = (id: string): boolean => {
  if (nodeBuiltins.includes(id) || id.startsWith("node:")) return true;
  return runtimeDeps.some((d) => id === d || id.startsWith(`${d}/`));
};

export default defineConfig({
  resolve: {
    conditions: ["node"],            // ← pick the Node export branch
    mainFields: ["main", "module"],
  },
  build: {
    target: "node20",
    outDir: "dist",
    sourcemap: true,
    minify: false,
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      formats: ["cjs"],              // ← VS Code's extension host expects CJS
      fileName: () => "happy-server.js",
    },
    rollupOptions: { external: isExternal },
  },
});
```

**Two design choices worth flagging:**

1. **`resolve.conditions: ["node"]`.** Vite's default conditions are
   browser-first. `vscode-languageclient` and `@volar/language-server`
   both have a `node`-conditioned `exports` map. Without this line,
   the bundler can resolve a browser-shaped module and you get
   `TransportKind` as `undefined` at runtime.
2. **Runtime deps are externalised.** rolldown (Vite 8's bundler)
   cannot statically rewrite `require()` calls inside UMD wrappers
   used by packages such as `vscode-html-languageservice`. Bundling
   them produces `MODULE_NOT_FOUND` at runtime. We let pnpm-linked
   `node_modules` resolve them instead.

Both bundles end up tiny (~3 KB each — only your own source). All
dependencies are resolved at runtime by Node against `node_modules`.

> **VSIX packaging caveat** — `vsce package` does not follow pnpm's
> symlinks. Before publishing, flatten the tree:
> ```sh
> pnpm deploy --filter @volar-happy/language-server <staging>
> # then vsce package from the staging tree, or copy it into the
> # extension's node_modules/ first
> ```
> Not a concern for dev (the Extension Development Host follows
> symlinks fine). A concern only at publish time.

### 8. Defining the language — `languagePlugin.ts`

This is where the guide stops. Full implementation in
`packages/language-server/src/languagePlugin.ts`. The shape:

```ts
export const happyLanguagePlugin = {
  getLanguageId(uri)            { /* … */ },
  createVirtualCode(uri, lid, snapshot) {
    if (lid === "happy") return new HappyVirtualCode(snapshot);
  },
  updateVirtualCode(uri, code, snapshot) {
    code.update(snapshot);
    return code;
  },
} satisfies LanguagePlugin<URI>;

export class HappyVirtualCode implements VirtualCode {
  id = "root";
  languageId = "happy";
  mappings: CodeMapping[] = [];        // ← REQUIRED, the guide's snippet omits this
  embeddedCodes: VirtualCode[] = [];

  constructor(public snapshot: ts.IScriptSnapshot) { this.onSnapshotUpdated(); }
  update(s: ts.IScriptSnapshot) { this.snapshot = s; this.onSnapshotUpdated(); }

  private onSnapshotUpdated() {
    const text = this.snapshot.getText(0, this.snapshot.getLength());

    // Identity mapping — required for downstream services to see the source.
    this.mappings = [{
      sourceOffsets:    [0],
      generatedOffsets: [0],
      lengths:          [text.length],
      data: {
        completion:   true, format:     true, navigation: true,
        semantic:     true, structure:  true, verification: true,
      },
    }];

    // ← your parser plugs in here. For now, just log.
    //   const ast = parseHappy(text);
    //   this.embeddedCodes = [...collectEmbeddedCodes(ast)];
  }
}
```

The six `data` flags control which LSP features Volar routes through this
mapping. `completion` for IntelliSense, `format` for formatting,
`navigation` for go-to-def/refs, `semantic` for tokens/types,
`structure` for outline/folding, `verification` for diagnostics.
All-true is the right default for "treat this region as full-featured."

That's the entire Volar boundary. **One function — `(source: string) => AST`
with positioned nodes — is everything your future parser owes Volar.**
Everything else (line splitting, tokenisation, AST shapes) is internal
implementation, behind that function.

---

## Where to go from here

- **Parse something.** Replace the `console.log` in `onSnapshotUpdated`
  with a real parser. Make every AST node carry `{ start: { offset }, end: { offset } }`.
- **Emit embedded codes.** Each "code section" in your language becomes a
  `VirtualCode` with `languageId: 'typescript'` (or whatever it is) and a
  mapping that translates positions between the section's local coords and
  the source document.
- **Upgrade to a TypeScript project.** Switch
  `createSimpleProject([…])` → `createTypeScriptProject(ts, msgs, () => ({ languagePlugins: […] }))`
  so embedded TS gets real type-checking via tsserver. Add
  `volar-service-typescript` to the services list. Add a `typescript`
  field to your `LanguagePlugin` with `extraFileExtensions` and
  `getExtraServiceScripts`.
- **Custom diagnostics.** Register a service alongside the others — see
  `volarjs/starter`'s `index.ts` "only one `<style>` tag" example as a template.

### Cross-editor

The same `dist/happy-server.js` runs under Zed, Neovim, Helix, etc. —
LSP is editor-agnostic. The wrapper differs per editor:

| Editor   | Wrapper                              | Transport                |
|----------|--------------------------------------|--------------------------|
| VS Code  | `packages/vscode` (this repo)        | `TransportKind.ipc`      |
| Neovim   | `nvim-lspconfig` or `vim.lsp.start`  | stdio                    |
| Zed     | Rust→WASM extension                  | stdio (server binary)    |
| Helix    | `languages.toml`                     | stdio                    |

The `bin/happy-language-server.js` shim is what those wrappers invoke.

---

## Reference

- **Official Volar guide** (incomplete, version-skewed):
  https://volarjs.dev/guides/first-server/
- **Official `volarjs/starter`** (maintained, npm/pnpm, esbuild):
  https://github.com/volarjs/starter
- **Real-world plugins** to read as documentation:
  - [`vuejs/language-tools`](https://github.com/vuejs/language-tools)
    — the canonical reference, especially `packages/language-core`.
  - [`withastro/language-tools`](https://github.com/withastro/language-tools)
    — smaller scope, easier to read end-to-end.
- **`@volar/language-core` types** — `node_modules/@volar/language-core/types.d.ts`.
  Treat these as the authoritative API reference; they're well-annotated.

---

## License

MIT — see [LICENSE](./LICENSE). Free to fork, adapt, and ship.
