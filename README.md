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

- **`[fix]`** — Happy Path does it differently because the guide is wrong, incomplete, or breaks at runtime.
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

Root `package.json` (minimal):

```json
{
  "name": "volar-happy",
  "private": true,
  "packageManager": "pnpm@11.1.2",
  "engines": { "node": ">=24", "pnpm": ">=11" },
  "scripts": {
    "build": "pnpm -r build",
    "watch": "pnpm -r --parallel watch"
  }
}
```

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

Install runtime dependencies, scoped per package:

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

Finally, at the root:

```sh
pnpm install
```

This materialises the workspace symlinks (notably `packages/vscode/node_modules/@volar-happy/language-server` → `../../../language-server`), which the extension relies on at runtime to spawn the server.

### 3. Installing and configuring TypeScript

```sh
pnpm add -Dw typescript
```

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

**`[fix]`** — the guide's base is just `{ "module": "nodenext" }`. That inherits TypeScript's silent defaults: `target: ES5`, `strict: false`, no declarations, no sourcemaps. The base above is what `volarjs/starter` uses and what you actually want for a server you'll iterate on.

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
      "presentation": { "reveal": "silent", "panel": "shared" },
      "problemMatcher": []
    }
  ]
}
```

**`[fix]`** — `preLaunchTask: "build"` silently does nothing if the label doesn't match a task in `tasks.json` **exactly**. Case-sensitive, no error message.

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

`packages/vscode/src/vscode-extension.ts`:

```ts
import * as serverProtocol from "@volar/language-server/protocol";
import { activateAutoInsertion, createLabsInfo } from "@volar/vscode";
import * as vscode from "vscode";
import {
  type BaseLanguageClient,
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: BaseLanguageClient;

export async function activate(context: vscode.ExtensionContext) {
  const serverModule = vscode.Uri.joinPath(
    context.extensionUri,
    "node_modules", "@volar-happy", "language-server",
    "dist", "happy-server.js",
  );
  const serverOptions: ServerOptions = {
    run: {
      module: serverModule.fsPath,
      transport: TransportKind.ipc,
      options: { execArgv: [] as string[] },
    },
    debug: {
      module: serverModule.fsPath,
      transport: TransportKind.ipc,
      options: { execArgv: ["--nolazy", "--inspect=6009"] },
    },
  };
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ language: "happy" }],
    initializationOptions: {},
  };
  client = new LanguageClient(
    "happy-language-server",
    "Happy Language Server",
    serverOptions,
    clientOptions,
  );
  await client.start();
  activateAutoInsertion("happy", client);
  const labsInfo = createLabsInfo(serverProtocol);
  labsInfo.addLanguageClient(client);
  return labsInfo.extensionExports;
}

export function deactivate(): Thenable<any> | undefined {
  return client?.stop();
}
```

**`[fix]`** — **named imports** from `vscode-languageclient/node`, not `import * as lsp`. Some bundler + CJS interop combinations leave the namespace empty, so `TransportKind` arrives as `undefined` and activation fails with `Cannot read properties of undefined (reading 'ipc')`.

**`[fix]`** — `execArgv: [] as string[]`, not `<string[]>[]`. Node's built-in TypeScript type-stripping (Node 22+) rejects angle-bracket cast syntax. Even when bundled, the `as` form is safer.

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

`packages/language-server/bin/happy-language-server.js` — the CLI shim non-VS-Code clients (Neovim, Zed) invoke:

```js
#!/usr/bin/env node
if (process.argv.includes("--version")) {
  const pkgJSON = require("../package.json");
  console.log(pkgJSON.version);
} else {
  require("../dist/happy-server.js");
}
```

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

**`[fix]`** the guide implicitly assumes Node 22's built-in TypeScript type-stripping can run the server's `.ts` directly. It can't reliably — angle-bracket casts, enums, and TS-only syntax in some Volar dependencies all trip it. Bundle properly.

Both packages share the same `vite.config.ts` shape (only the entry path and output filename differ). The server's:

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
    conditions: ["node"],            // [fix] pick the Node export branch
    mainFields: ["main", "module"],
  },
  build: {
    target: "node20",
    outDir: "dist",
    sourcemap: true,
    minify: false,
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      formats: ["cjs"],              // VS Code's extension host expects CJS
      fileName: () => "happy-server.js",
    },
    rollupOptions: { external: isExternal },   // [fix] do not bundle runtime deps
  },
});
```

The client's `vite.config.ts` is identical except for the entry, the
output filename, and adding `"vscode"` to the externals (the editor
provides that module at runtime).

**`[fix: `resolve.conditions: ["node"]`]`** — Vite's default conditions are browser-first. `vscode-languageclient` and `@volar/language-server` both have a `node`-conditioned `exports` map. Without this line, the bundler resolves a browser-shaped module and `TransportKind` ends up `undefined` at runtime — same symptom as the namespace-import issue in section 5, different root cause.

**`[fix: externalise runtime deps]`** — rolldown (Vite 8's bundler) cannot rewrite `require()` calls inside UMD wrappers used by packages such as `vscode-html-languageservice`. Bundling them produces `MODULE_NOT_FOUND` at runtime. We externalise everything declared in `dependencies` and let Node resolve them through pnpm-linked `node_modules` instead.

Both bundles end up tiny (~3 KB — only your own source).

> **`[+]` VSIX packaging caveat** — `vsce package` does not follow pnpm's symlinks. Before publishing, flatten the tree:
> ```sh
> pnpm deploy --filter @volar-happy/language-server <staging>
> # then vsce package from <staging>, or copy it into the extension's node_modules/
> ```
> Not a concern for dev — the Extension Development Host follows symlinks fine.

### 8. Defining the language — `languagePlugin.ts`

**This is where the official guide stops.**

`packages/language-server/src/languagePlugin.ts`:

```ts
import type { CodeMapping, LanguagePlugin, VirtualCode } from "@volar/language-core";
import type { URI } from "vscode-uri";
import type * as ts from "typescript";

export const happyLanguagePlugin = {
  getLanguageId(uri) {
    if (uri.path.endsWith(".happy")) return "happy";
  },
  createVirtualCode(uri, languageId, snapshot) {
    if (languageId === "happy") return new HappyVirtualCode(snapshot);
  },
  updateVirtualCode(uri, code: HappyVirtualCode, snapshot) {
    code.update(snapshot);
    return code;
  },
} satisfies LanguagePlugin<URI>;

export class HappyVirtualCode implements VirtualCode {
  id = "root";
  languageId = "happy";
  mappings: CodeMapping[] = [];                // [fix] REQUIRED — guide omits this field
  embeddedCodes: VirtualCode[] = [];

  constructor(public snapshot: ts.IScriptSnapshot) {
    this.onSnapshotUpdated();
  }

  update(newSnapshot: ts.IScriptSnapshot) {    // [+] mutation-on-update pattern
    this.snapshot = newSnapshot;
    this.onSnapshotUpdated();
  }

  private onSnapshotUpdated() {
    const text = this.snapshot.getText(0, this.snapshot.getLength());

    // Identity mapping — required for downstream services to see the source.
    this.mappings = [{
      sourceOffsets:    [0],
      generatedOffsets: [0],
      lengths:          [text.length],
      data: {
        completion: true, format:    true, navigation:   true,
        semantic:   true, structure: true, verification: true,
      },
    }];

    // [+] Your parser plugs in here. For now: just log.
    //   const ast = parseHappy(text);
    //   this.embeddedCodes = [...collectEmbeddedCodes(ast)];
  }
}
```

**`[fix]`** — `mappings: CodeMapping[] = []` is **required** by the `VirtualCode` interface. The guide's `Html1Code` snippet declares `id`, `languageId`, `embeddedCodes`, and `snapshot` but omits `mappings`, so `implements VirtualCode` won't compile.

**`[+]`** — `update()` + `onSnapshotUpdated()` is the **mutation-on-update** pattern from the Volar 2.x `LanguagePlugin` API: Volar reuses the same `VirtualCode` identity across edits, and downstream caches keyed on it stay valid. The guide's older snippet creates a fresh class each edit.

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
