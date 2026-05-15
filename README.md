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
│   │   ├── bin/happy-language-server.js   CLI shim — editor-agnostic, used by clients that launch a binary (Neovim, Zed, Helix)
│   │   ├── src/
│   │   │   ├── index.ts                Wires Volar's connection, registers services
│   │   │   └── languagePlugin.ts       The plugin — getLanguageId, createVirtualCode, updateVirtualCode
│   │   └── vite.config.ts              Library bundle → dist/happy-server.js (CJS, Node target)
│   └── vscode/                         VS Code extension (the "client")
│       ├── src/vscode-extension.ts     Spawns the server, attaches LanguageClient
│       ├── language-configuration.json VS Code level brackets, comments, auto-closing pairs (no LSP involved)
│       └── vite.config.ts              Library bundle → dist/vscode-extension.js
├── samples/hello.happy                 Demo file to open in the Extension Development Host
├── .vscode/
│   ├── launch.json                     "Run Happy Extension" (F5) + "Attach to Happy Server"
│   └── tasks.json                      VSC build task, invoked by F5's preLaunchTask
├── pnpm-workspace.yaml
├── tsconfig.base.json                  Strict TS, NodeNext modules, declarations + sourcemaps
└── tsconfig.json                       Root — for editor IntelliSense across the workspace
```

**Three processes:**

1. **VS Code** — the editor.
2. **The extension** (`packages/vscode`) — lives _inside_ VS Code's extension host.
3. **The language server** (`packages/language-server`) — a separate Node subprocess that the extension spawns on first `.happy` open.

**Two boundaries:**

- VS Code ↔ extension: in-process calls via the VS Code extension API.
- Extension ↔ server: LSP messages (JSON-RPC) over IPC.

Everything Volar-related — happy plugin, happy future parser, happy future services — runs in the **server**. The extension is just a thin spawner that hands work off over LSP.

The flow when you open a `.happy` file:

1. VS Code activates the extension on `onLanguage:happy`.
2. The extension spawns the server — `node dist/happy-server.js`, IPC transport.
3. When you open a `.happy` file, Volar wraps the text in a snapshot and calls your plugin:
   - `getLanguageId(uri)` → `'happy'`
   - `createVirtualCode(uri, 'happy', snapshot)` ← **your parser runs here**
4. Volar caches the returned `VirtualCode`. After that, it only re-enters your code on document changes (`updateVirtualCode`) or when an editor feature is requested (hover, completion, …).

---

## Step-by-step (full mirror of the official guide)

Each section below mirrors a section of the
[**official guide**](https://volarjs.dev/guides/first-server/) — same
order, same headings — but each is self-contained: you can build the
project by reading only this README. Snippets are adapted to
`.happy` / `happy` / `Happy`. Inline annotations mark where Happy Path
diverges from the guide and why:

- **`[fix]`** — Happy Path does it differently because the guide is incomplete or breaks at runtime.
- **`[+]`** — Happy Path adds something the guide omits.

### 1. Prerequisites

- Node 20+ — Happy Path pins **Node 24 LTS** in `.nvmrc`; Node 26 (current) also works.
- pnpm 11+.
- VS Code.

### 2. Getting started

```sh
mkdir volar-happy && cd volar-happy
pnpm init                                  # root package.json
mkdir -p packages/language-server packages/vscode
```

Root `package.json`:

```json
{
  "name": "volar-happy",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "packageManager": "pnpm@11.1.2",
  "engines": { "node": ">=24", "pnpm": ">=11" },
  "scripts": {
    "build": "pnpm -r build",
    "watch": "pnpm -r --parallel watch"
  },
  "devDependencies": {
    "@types/node": "^25.8.0",
    "typescript": "^6.0.3",
    "vite": "^8.0.12"
  }
}
```

Root devDependencies are the build tools and types every package shares:

- `typescript` — root `tsc` command and editor language service across the workspace.
- `@types/node` — needed by the root `tsconfig.json`'s `"types": ["node"]` so the editor resolves Node globals.
- `vite` — `pnpm -r build` invokes each package's `vite build` script; vite needs to be on the PATH that pnpm's script runner extends. Keeping it at the root means a single version pinned across both packages.

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - packages/*
allowBuilds:                      # [fix] pnpm 11 requires explicit approval for native postinstalls
  '@parcel/watcher': true
  esbuild: true
  msgpackr-extract: true
```

**`[fix]`** — pnpm reads `pnpm-workspace.yaml`, **not** the `workspaces` field in `package.json` (that's a Bun/Yarn convention pnpm silently ignores).

**`[fix]`** — without `allowBuilds`, pnpm 11 prints `Ignored build scripts: @parcel/watcher, esbuild, msgpackr-extract` and those packages don't fully install. Native modules used by Vite & co. will then fail at build or run time.

Stub `package.json` for each sub-package so pnpm can register them as workspaces. These get filled in fully in sections 5 and 6 — at this stage they just need a name pnpm can resolve with `--filter`:

`packages/language-server/package.json`:

```json
{ "name": "@volar-happy/language-server", "version": "0.1.0" }
```

`packages/vscode/package.json`:

```json
{ "name": "@volar-happy/vscode", "version": "0.1.0" }
```

Now register the workspace and install the root devDependencies:

```sh
pnpm install
```

Install runtime dependencies into each sub-package:

```sh
# language-server
pnpm --filter @volar-happy/language-server add \
  @volar/language-server @volar/language-core @volar/language-service \
  volar-service-html volar-service-css vscode-html-languageservice
pnpm --filter @volar-happy/language-server add -D vscode-uri   # [fix] type-only need

# vscode client
pnpm --filter @volar-happy/vscode add \
  @volar-happy/language-server @volar/language-server @volar/vscode \
  vscode-languageclient
pnpm --filter @volar-happy/vscode add -D @types/vscode         # [fix] devDependency, not dependency
```

**`[fix]`** — `vscode-uri` is a **devDependency** of `language-server`. Volar's published TypeScript types reference `URI` from it, so the compiler needs it; but at runtime VS Code's host provides URIs, the bundle never constructs them, and shipping it as a runtime dep is pure cost.

**`[fix]`** — `@types/vscode` is a **devDependency** of `vscode`. Types are erased at build time and don't ship to users.

The `pnpm --filter @volar-happy/vscode add @volar-happy/language-server` step records `"workspace:*"` in the client's `package.json` and creates the symlink at `packages/vscode/node_modules/@volar-happy/language-server/`. That symlink is what the extension uses at runtime to spawn the server.

### 3. Installing and configuring TypeScript

`typescript` is already in the root `devDependencies` from section 2 — one TS version shared across the workspace. All you need to add here is the configs.

`tsconfig.base.json` at repo root:

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

**`[+]`** — the guide's base is just `{ "module": "nodenext" }`. That inherits TypeScript's silent defaults: `target: ES5`, `strict: false`, no declarations, no sourcemaps. The base above is what `volarjs/starter` uses and what you actually want for a server you'll iterate on.

Each package's own `tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "out", "rootDir": "src" },
  "include": ["src"]
}
```

### 4. Defining VS Code tasks

`.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Happy Extension",
      "type": "extensionHost",
      "request": "launch",
      "runtimeExecutable": "${execPath}",
      "args": [
        "--disable-updates",
        "--disable-workspace-trust",
        "--profile-temp",
        "--skip-release-notes",
        "--skip-welcome",
        "--extensionDevelopmentPath=${workspaceFolder}/packages/vscode",
        "${workspaceFolder}/samples"
      ],
      "outFiles": [
        "${workspaceFolder}/packages/vscode/dist/*.js",
        "${workspaceFolder}/packages/language-server/dist/*.js"
      ],
      "preLaunchTask": "build"
    },
    {
      "name": "Attach to Happy Server",
      "type": "node",
      "request": "attach",
      "port": 6009,
      "restart": true,
      "outFiles": ["${workspaceFolder}/packages/language-server/dist/*.js"]
    }
  ]
}
```

**`[+]`** `.vscode/tasks.json` — the guide stops at `launch.json` and leaves "how do you build before launching?" implicit:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "build",
      "type": "shell",
      "command": "pnpm -r build",
      "group": { "kind": "build", "isDefault": true },
      "presentation": { "reveal": "always", "panel": "shared" },
      "problemMatcher": []
    }
  ]
}
```

**`[+]`** — `reveal: "always"` opens the terminal panel on every F5 so build output is visible.

### 5. The client (`packages/vscode`)

`packages/vscode/package.json`:

```json
{
  "name": "@volar-happy/vscode",
  "publisher": "athrio",
  "displayName": "Volar Happy Path",
  "description": "Volar.js language extension scaffold for the .happy language.",
  "version": "0.1.0",
  "engines": { "vscode": "^1.55.0" },
  "activationEvents": ["onLanguage:happy"],
  "main": "./dist/vscode-extension.js",
  "contributes": {
    "languages": [{
      "id": "happy",
      "extensions": [".happy"],
      "configuration": "./language-configuration.json"
    }]
  },
  "scripts": {
    "build": "vite build",
    "watch": "vite build --watch"
  },
  "devDependencies": { "@types/vscode": "^1.120.0" },
  "dependencies": {
    "@volar-happy/language-server": "workspace:*",
    "@volar/language-server": "^2.4.28",
    "@volar/vscode": "^2.4.28",
    "vscode-languageclient": "^9.0.1"
  }
}
```

**`[fix]`** — `@volar-happy/language-server` must be declared as `"workspace:*"`. pnpm uses this to create the symlink at `packages/vscode/node_modules/@volar-happy/language-server/`. The extension code below spawns the server through that symlinked path; the spawn fails with `Cannot find module …` if the dependency isn't declared.

**Full file:** [`packages/vscode/src/vscode-extension.ts`](./packages/vscode/src/vscode-extension.ts). The lines that earn explanation:

```ts
// Spawn-path: resolved through the pnpm symlink created by the
// workspace:* dep declared above. If you change the package name,
// keep these joinPath segments in sync.
const serverModule = vscode.Uri.joinPath(
  context.extensionUri,
  "node_modules", "@volar-happy", "language-server",
  "dist", "happy-server.js",
);

// IPC transport: child_process.fork() + Node IPC.
// Structured cloning, no per-message JSON serialisation.
const serverOptions: lsp.ServerOptions = {
  run:   { module: serverModule.fsPath, transport: lsp.TransportKind.ipc, options: { execArgv: [] as string[] } },
  debug: { module: serverModule.fsPath, transport: lsp.TransportKind.ipc, options: { execArgv: ["--nolazy", "--inspect=6009"] } },
};
```

The rest of `activate()` is conventional LSP wiring: build `clientOptions` with `documentSelector: [{ language: "happy" }]`, construct `lsp.LanguageClient`, `await client.start()`, register `activateAutoInsertion("happy", client)` for Volar's tag-completion, and create a `createLabsInfo(serverProtocol)` handle for the optional Volar Labs inspector. `deactivate()` calls `client?.stop()`.

**`[+]`** `packages/vscode/language-configuration.json` — pure VS-Code-side metadata (brackets, comments, auto-pairs). No LSP involved; the editor reads it directly. The official guide doesn't cover this; it's an easy ergonomic win.

```json
{
  "comments":         { "lineComment": "#" },
  "brackets":         [["[","]"], ["{","}"], ["(",")"]],
  "autoClosingPairs": [
    { "open": "[", "close": "]" },
    { "open": "{", "close": "}" },
    { "open": "(", "close": ")" },
    { "open": "\"", "close": "\"" }
  ],
  "surroundingPairs": [["[","]"], ["{","}"], ["(",")"], ["\"","\""]]
}
```

### 6. The server (`packages/language-server`)

`packages/language-server/package.json`:

```json
{
  "name": "@volar-happy/language-server",
  "version": "0.1.0",
  "main": "./dist/happy-server.js",
  "bin": { "happy-language-server": "./bin/happy-language-server.js" },
  "scripts": {
    "build": "vite build",
    "watch": "vite build --watch"
  },
  "dependencies": {
    "@volar/language-core": "^2.4.28",
    "@volar/language-server": "^2.4.28",
    "@volar/language-service": "^2.4.28",
    "volar-service-css": "^0.0.71",
    "volar-service-html": "^0.0.71",
    "vscode-html-languageservice": "^5.6.2"
  },
  "devDependencies": { "vscode-uri": "^3.1.0" }
}
```

`packages/language-server/src/index.ts`:

```ts
import { happyLanguagePlugin } from "./languagePlugin";
import { create as createHtmlService } from "volar-service-html";
import { create as createCssService } from "volar-service-css";
import {
  createServer,
  createConnection,
  createSimpleProject,
} from "@volar/language-server/node";

const connection = createConnection();
const server = createServer(connection);
connection.listen();

connection.onInitialize((params) => {
  return server.initialize(
    params,
    createSimpleProject([happyLanguagePlugin]),     // [fix] register the plugin
    [createHtmlService(), createCssService()],
  );
});

connection.onInitialized(server.initialized);
connection.onShutdown(server.shutdown);
```

**`[fix]`** — the plugin must be **actually registered** in `createSimpleProject([happyLanguagePlugin])`. The guide's snippet passes an empty array, so opening a `.happy` file produces no logs and no virtual code construction — the LSP server runs but is inert.

### 7. Server configuration — bundling with Vite

This section is Happy-Path-original: the official guide and `volarjs/starter` use esbuild via a hand-written build script; Happy Path uses Vite library mode for both packages. Same outcome (one CJS bundle per package), fewer moving parts.

**Full files:** [`packages/language-server/vite.config.ts`](./packages/language-server/vite.config.ts), [`packages/vscode/vite.config.ts`](./packages/vscode/vite.config.ts). Both packages share the same shape — entry path, output filename, and the client's extra `"vscode"` external are the only differences. The teaching skeleton:

```ts
export default defineConfig({
  resolve: {
    conditions: ["node"],            // pick the Node export branch
    mainFields: ["main", "module"],
  },
  build: {
    target: "node20",
    sourcemap: true,
    minify: false,
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      formats: ["cjs"],              // VS Code's extension host expects CJS
      fileName: () => "happy-server.js",
    },
    rollupOptions: { external: isExternal },   // do not bundle runtime deps
  },
});
```

Two choices worth being explicit about:

**`resolve.conditions: ["node"]`** — Vite's default conditions are browser-first. `vscode-languageclient` and `@volar/language-server` both have a `node`-conditioned `exports` map. Without this line, the bundler resolves a browser-shaped module and `TransportKind` ends up `undefined` at runtime.

**Runtime deps are externalised, not bundled.** rolldown (Vite 8's bundler) cannot rewrite `require()` calls inside UMD wrappers used by packages such as `vscode-html-languageservice`. Bundling them produces `MODULE_NOT_FOUND` at runtime. The `isExternal` helper in each `vite.config.ts` reads each package's own `dependencies` from `package.json` and externalises them; Node resolves them through pnpm-linked `node_modules` instead. Both bundles end up tiny (~3 KB — only your own source).

**VSIX packaging caveat** — `vsce package` does not follow pnpm's symlinks. Before publishing, flatten the tree:

```sh
pnpm deploy --filter @volar-happy/language-server <staging>
# then vsce package from <staging>, or copy it into the extension's node_modules/
```

Not a concern for dev — the Extension Development Host follows symlinks fine.

### 8. Defining the language — `languagePlugin.ts`

**This is where the official guide stops.**

**Full file:** [`packages/language-server/src/languagePlugin.ts`](./packages/language-server/src/languagePlugin.ts). The shape, with only the lines that earn explanation:

```ts
export const happyLanguagePlugin = {
  getLanguageId(uri)                                { /* "happy" if uri.path.endsWith(".happy") */ },
  createVirtualCode(uri, languageId, snapshot)      { /* return new HappyVirtualCode(snapshot) */ },
  updateVirtualCode(uri, code: HappyVirtualCode, s) { code.update(s); return code; /* [+] mutate */ },
} satisfies LanguagePlugin<URI>;

export class HappyVirtualCode implements VirtualCode {
  id = "root";
  languageId = "happy";
  mappings: CodeMapping[] = [];                // [fix] REQUIRED — guide omits this field
  embeddedCodes: VirtualCode[] = [];

  // constructor + update() both call onSnapshotUpdated(), which:
  //  (a) writes an identity mapping over the whole document into `this.mappings`,
  //  (b) is the seam your parser plugs into to produce `this.embeddedCodes`.
}
```

**`[fix]`** — `mappings: CodeMapping[] = []` is **required** by the `VirtualCode` interface. The guide's `Html1Code` snippet declares `id`, `languageId`, `embeddedCodes`, and `snapshot` but omits `mappings`, so `implements VirtualCode` won't compile.

**`[+]`** — `update()` is the **mutation-on-update** pattern from the Volar 2.x `LanguagePlugin` API: Volar reuses the same `VirtualCode` identity across edits, and downstream caches keyed on it stay valid. The guide's older snippet creates a fresh class each edit.

The six `data` flags control which LSP features Volar routes through this mapping:

- `completion` — IntelliSense
- `format` — formatting edits
- `navigation` — go-to-def / references
- `semantic` — semantic tokens, type info
- `structure` — outline, folding
- `verification` — diagnostics

All-true is the default for "treat this region as full-featured."

That's the entire Volar boundary. **`(source: string) → AST` with positioned nodes is everything your future parser owes Volar.** Everything else — line splitting, tokenisation, AST shapes — is internal implementation behind that function.

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

### Cross-editor — the `bin` shim

The same `dist/happy-server.js` runs under any LSP-aware editor. VS Code uses `TransportKind.ipc` (in-tree, faster); Neovim, Zed, Helix and friends launch the server as a binary on `$PATH` — `packages/language-server/bin/happy-language-server.js` (wired via the `"bin"` field) is the entry point for that path. Same compiled server, two entry points.

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
