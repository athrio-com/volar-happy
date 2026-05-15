# Volar Happy Path

🥬 **Volar Happy Path** — a minimal **working** Volar.js language extension scaffold distilled from real-world work.

🐌 If it saved you a weekend, consider supporting our education organisation
**Quadrivium Academy**: **[ko-fi.com/quadrivium](https://ko-fi.com/quadrivium)**. Thank you.

This repository is a complete, runnable guide to building a Volar.js-based VS Code language extension end-to-end — from an empty directory to an installable `.vsix`. It shadows the official [**Your First Volar Language Server**](https://volarjs.dev/guides/first-server/) guide and parallels [`volarjs/starter`](https://github.com/volarjs/starter), but uses the current toolchain (pnpm 11, Vite, Volar 2.4.28) and emphasises a console-traceable activation loop. Read the official guide and the starter alongside; Happy Path fills the gaps between them.

The language we'll implement is called **Happy**. It has no semantics — a file ending in `.happy` exists, nothing is parsed. The point is the **plumbing**.

> _Last verified: Volar `2.4.28`, Node 24 LTS, pnpm 11, vscode-languageclient 9 — 2026-05-15._

## Why this exists

The official guide is marked _"work in progress"_ and stops mid-implementation. The `volarjs/starter` is a complete working artifact from the Volar team, last touched September 2024, pins `pnpm@9.1.0`, and builds with a hand-written esbuild script. Happy Path occupies the gap between the two:

- **Current toolchain** — pnpm 11 workspace, Vite library mode for bundling, recent Volar.
- **Visible lifecycle** — `console.log` at every plugin entry point so you can _see_ activation in VS Code's Output panel before reaching for a debugger.
- **Full lifecycle covered** — init → dev loop → `.vsix` pack. The same surface as the starter, just current.

The starter's `.html1` example also covers embedded HTML/CSS to demonstrate Volar's embedded-language story. Happy Path leaves that exercise to the reader; the focus here is getting the plumbing live so your own language can slot in.

MIT licensed. Fork freely. Publishing to the Marketplace (`vsce publish`) is out of scope — that needs a publisher token and a marketplace account.

## Quick start

Prerequisites: Node 24+ (LTS) or Node 26 (current); pnpm 11+; VS Code.

```sh
git clone https://github.com/athrio-com/volar-happy.git
cd volar-happy
pnpm install
```

Open the repo in VS Code, press <kbd>F5</kbd>.

A second VS Code window opens ("Extension Development Host") with `samples/` already mounted. Open `samples/hello.happy`. Then:

1. **View → Output** (<kbd>Cmd/Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>U</kbd>)
2. Choose **"Happy Language Server"** from the channel dropdown.

You should see:

```text
[Happy] getLanguageId: /…/samples/hello.happy
[Happy]   -> matched 'happy'
[Happy] createVirtualCode: /…/samples/hello.happy languageId= happy
[Happy]   -> constructing HappyVirtualCode
[Happy]   HappyVirtualCode constructor: length = …
[Happy]   onSnapshotUpdated: text length = …
[Happy]   first 1000 chars: "…"
```

Type into the file. Every keystroke produces a fresh `updateVirtualCode` entry. That's the closed feedback loop with Volar.

To produce a `.vsix` you can install or share: `pnpm run pack:vsix`. Details in section 9 below.

---

## Architecture

```
volar-happy/
├── packages/
│   ├── language-server/                LSP server source (consumed by the vscode bundle)
│   │   ├── bin/happy-language-server.js   CLI shim for clients that launch the server as a binary
│   │   ├── src/
│   │   │   ├── index.ts                Wires Volar's connection, registers services
│   │   │   └── languagePlugin.ts       getLanguageId, createVirtualCode, updateVirtualCode
│   │   └── vite.config.ts              Standalone bundle for the bin shim → dist/happy-server.js
│   └── vscode/                         VS Code extension
│       ├── src/vscode-extension.ts     Spawns the bundled server, attaches LanguageClient
│       ├── language-configuration.json VS Code editor metadata: brackets, comments, auto-pairs
│       └── vite.config.ts              Bundles both client and server → dist/{client,server}.js
├── samples/hello.happy                 Demo file
├── .vscode/{launch,tasks}.json         F5 → build → launch wiring
├── pnpm-workspace.yaml
├── tsconfig.base.json                  Strict TS, NodeNext modules, declarations + sourcemaps
└── tsconfig.json                       Root — editor IntelliSense across the workspace
```

**Three processes:**

1. **VS Code** — the editor.
2. **The extension** (`packages/vscode`) — runs inside VS Code's extension host.
3. **The language server** — a Node subprocess the extension spawns on first `.happy` open.

**Two boundaries:**

- VS Code ↔ extension: in-process calls via the VS Code extension API.
- Extension ↔ server: LSP messages (JSON-RPC) over IPC.

All Volar-related code — the plugin, your future parser, your future services — runs in the **server**. The extension is a thin spawner.

When you open a `.happy` file:

1. VS Code activates the extension on `onLanguage:happy`.
2. The extension spawns the server via Node IPC.
3. Volar wraps the document text in a snapshot and calls your plugin:
   - `getLanguageId(uri)` → `'happy'`
   - `createVirtualCode(uri, 'happy', snapshot)` ← **your parser runs here**
4. Volar caches the returned `VirtualCode`. After that, it only re-enters your code on document changes (`updateVirtualCode`) or when an editor feature is requested (hover, completion, …).

---

## 📖 Building it from scratch

The sections below walk through assembling Happy Path from an empty directory. They follow the same numbering as the official guide. If you're cloning this repo, read them as commentary on the source; if you're starting your own, follow them step by step.

### 1. Prerequisites

- Node 20+ — Happy Path pins **Node 24 LTS** in `.nvmrc`; Node 26 (current) also works.
- pnpm 11+.
- VS Code.

### 2. Initial scaffold

```sh
mkdir volar-happy && cd volar-happy
pnpm init
mkdir -p packages/language-server packages/vscode
```

Replace the generated root `package.json` with:

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
    "watch": "pnpm -r --parallel watch",
    "pack:vsix": "pnpm --filter volar-happy run pack:vsix"
  },
  "devDependencies": {
    "@types/node": "^25.8.0",
    "typescript": "^6.0.3",
    "vite": "^8.0.12"
  }
}
```

The three root devDependencies are shared across the workspace: `typescript` powers the editor language service and any `tsc` invocation; `@types/node` so the root `tsconfig.json` can resolve Node globals; `vite` because both sub-packages' `build` scripts invoke it.

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - packages/*
allowBuilds:
  '@parcel/watcher': true
  esbuild: true
  msgpackr-extract: true
```

pnpm 11 won't run native postinstall scripts unless they're explicitly listed under `allowBuilds`. The three above are pulled in by Vite and Volar's transitive dependencies; without them you get `Ignored build scripts` warnings and native modules fail to load.

Then create stub manifests so pnpm registers the two sub-packages. They'll be filled in fully in sections 5 and 6.

`packages/language-server/package.json`:
```json
{ "name": "@volar-happy/language-server", "version": "0.1.0" }
```

`packages/vscode/package.json`:
```json
{ "name": "volar-happy", "version": "0.1.0" }
```

The names look asymmetric on purpose: the VS Code extension package must be `volar-happy` (unscoped — VS Code marketplace extension names are restricted to `[a-z0-9-]+`); the language-server is scoped because it's a regular npm package, not a published extension.

Finally, install:

```sh
pnpm install
```

This materialises the workspace and installs the root devDependencies.

### 3. TypeScript configuration

`tsconfig.base.json` at the repo root:

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

These pin modern emit and lib types, real type-checking, fast rebuilds via `skipLibCheck`, shippable types and debuggable stacktraces, project references for the workspace, and dead-code warnings.

Each sub-package gets a thin `tsconfig.json` extending the base:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "out", "rootDir": "src" },
  "include": ["src"]
}
```

### 4. F5 wiring

Create `.vscode/launch.json`:

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
      "outFiles": ["${workspaceFolder}/packages/vscode/dist/server.js"]
    }
  ]
}
```

The `preLaunchTask: "build"` field is the bridge to `.vscode/tasks.json` — without that file, F5 would launch with stale or missing bundles:

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

`reveal: "always"` opens the terminal panel on every F5 so build output is visible. If the build fails you'll see why, instead of an Extension Development Host that mysteriously doesn't activate.

### 5. The client

Fill in `packages/vscode/package.json`:

```json
{
  "name": "volar-happy",
  "publisher": "athrio",
  "displayName": "Volar Happy Path",
  "description": "Reference Volar.js language extension — minimal stub for the .happy language.",
  "version": "0.1.0",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/athrio-com/volar-happy.git",
    "directory": "packages/vscode"
  },
  "engines": { "vscode": "^1.120.0" },
  "activationEvents": ["onLanguage:happy"],
  "main": "./dist/client.js",
  "contributes": {
    "languages": [{
      "id": "happy",
      "extensions": [".happy"],
      "configuration": "./language-configuration.json"
    }]
  },
  "scripts": {
    "build": "vite build",
    "watch": "vite build --watch",
    "pack:vsix": "vite build && vsce package --no-dependencies"
  },
  "devDependencies": {
    "@types/vscode": "^1.120.0",
    "@volar/language-server": "^2.4.28",
    "@volar/vscode": "^2.4.28",
    "vscode-languageclient": "^9.0.1"
  }
}
```

All Volar/LSP packages live in `devDependencies` because the client bundle inlines them at build time; nothing is resolved through `node_modules` at runtime. That's the trick that lets the `.vsix` ship without `node_modules` at all (section 9).

`packages/vscode/src/vscode-extension.ts`:

```ts
import * as serverProtocol from "@volar/language-server/protocol";
import { activateAutoInsertion, createLabsInfo } from "@volar/vscode";
import * as vscode from "vscode";
import * as lsp from "vscode-languageclient/node";

let client: lsp.BaseLanguageClient;

export async function activate(context: vscode.ExtensionContext) {
  const serverModule = vscode.Uri.joinPath(
    context.extensionUri,
    "dist", "server.js",
  );
  const serverOptions: lsp.ServerOptions = {
    run:   { module: serverModule.fsPath, transport: lsp.TransportKind.ipc, options: { execArgv: [] as string[] } },
    debug: { module: serverModule.fsPath, transport: lsp.TransportKind.ipc, options: { execArgv: ["--nolazy", "--inspect=6009"] } },
  };
  const clientOptions: lsp.LanguageClientOptions = {
    documentSelector: [{ language: "happy" }],
    initializationOptions: {},
  };
  client = new lsp.LanguageClient(
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

The spawn path — `dist/server.js` — sits **inside the extension's own folder**. That's where Vite emits the bundled server alongside the bundled client (section 8). No workspace symlinks or `$PATH` lookups at runtime; the extension is fully self-contained.

`packages/vscode/language-configuration.json` adds editor-side ergonomics. No LSP involved — VS Code reads this directly:

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

### 6. The server

Fill in `packages/language-server/package.json`:

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

The language-server's runtime `dependencies` are real here — they're the Volar pieces the server's source actually imports. `vscode-uri` is a `devDependency`: Volar's published TypeScript types reference its `URI` class, but at runtime the LSP host hands URIs to the server, so the bundle never needs to construct them.

The cross-editor entry point — `packages/language-server/bin/happy-language-server.js`:

```js
#!/usr/bin/env node
if (process.argv.includes("--version")) {
  const pkgJSON = require("../package.json");
  console.log(pkgJSON.version);
} else {
  require("../dist/happy-server.js");
}
```

Installing the language-server package via `npm`/`pnpm` puts `happy-language-server` on `$PATH`; Neovim, Zed, Helix, and other LSP clients that launch a server by executing a binary can use it. VS Code doesn't go through this shim — it spawns `dist/server.js` directly via Node IPC, which is faster than stdio and doesn't depend on the binary being on the user's PATH. Same compiled server, two entry points for two audiences.

`packages/language-server/src/index.ts` wires Volar's connection and registers services:

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
    createSimpleProject([happyLanguagePlugin]),
    [createHtmlService(), createCssService()],
  );
});

connection.onInitialized(server.initialized);
connection.onShutdown(server.shutdown);
```

`createSimpleProject([happyLanguagePlugin])` is what makes the plugin actually run when a `.happy` file opens. With an empty array the LSP server starts but does nothing observable — no `getLanguageId` call, no `createVirtualCode` call, no log output.

### 7. The language plugin

`packages/language-server/src/languagePlugin.ts`:

```ts
// packages/language-server/src/languagePlugin.ts — excerpt

export const happyLanguagePlugin = {
  getLanguageId(uri) {
    if (uri.path.endsWith(".happy")) return "happy";
  },
  createVirtualCode(uri, languageId, snapshot) {
    if (languageId === "happy") return new HappyVirtualCode(snapshot);
  },
  updateVirtualCode(uri, languageCode: HappyVirtualCode, snapshot) {
    languageCode.update(snapshot);    // mutate the existing instance — Volar keeps the
    return languageCode;              // same VirtualCode identity across edits
  },
} satisfies LanguagePlugin<URI>;

export class HappyVirtualCode implements VirtualCode {
  id = "root";
  languageId = "happy";
  mappings: CodeMapping[] = [];   // required field — identity mapping written below
  embeddedCodes: VirtualCode[] = [];

  constructor(public snapshot: ts.IScriptSnapshot) { this.onSnapshotUpdated(); }
  update(snapshot: ts.IScriptSnapshot)             { this.snapshot = snapshot; this.onSnapshotUpdated(); }

  private onSnapshotUpdated() {
    // Identity mapping over the whole document — downstream services need
    // it to see source coordinates. Your future parser plugs in here too.
    this.mappings = [/* { sourceOffsets: [0], generatedOffsets: [0], lengths: [doc length], data: { … } } */];
  }
}
```

Two patterns worth pointing at.

**Mutation on update.** `updateVirtualCode` mutates the existing `HappyVirtualCode` instance via `code.update(snapshot)` rather than creating a fresh one. Volar reuses the same `VirtualCode` identity across edits and any downstream caches keyed on it stay valid.

**The `mappings` field.** The `VirtualCode` interface declares `mappings: CodeMapping[]` as required. Without it, `implements VirtualCode` doesn't compile. Even the stub needs an identity mapping over the whole document so downstream services can see source coordinates.

The diagnostic `console.log` lines in the actual source fire from these methods. That's how the `[Happy]` trace surfaces in the Output panel.

### 8. Bundling

Both packages build with Vite library mode, targeting CJS for Node — the format VS Code's extension host expects. The vscode package's `vite.config.ts` has two entries — the extension client and the server — emitting into `packages/vscode/dist/`:

```ts
// packages/vscode/vite.config.ts — excerpt

const umd2esm = {
  name: "umd2esm",
  enforce: "pre" as const,
  resolveId(source, importer) {
    if (/^(vscode-.*-languageservice|jsonc-parser)/.test(source)) {
      const fromDir = importer ? dirname(importer) : here
      const resolved = requireFromHere.resolve(source, { paths: [fromDir] })
      return resolved.replace(/\/umd\//, "/esm/").replace(/\\umd\\/g, "\\esm\\")
    }
    return null
  },
}

export default defineConfig({
  plugins: [umd2esm],
  resolve: { conditions: ["node"], mainFields: ["main", "module"] },
  build: {
    target: "node20",
    sourcemap: true,
    lib: {
      entry: {
        client: resolve(here, "src/vscode-extension.ts"),
        server: resolve(here, "../language-server/src/index.ts"),
      },
      formats: ["cjs"],
    },
    rollupOptions: {
      external: ["vscode", ...nodeBuiltins],
      output: { entryFileNames: "[name].js" },
    },
  },
})
```

Two specifics worth knowing.

**The `umd2esm` plugin** is the trick `volarjs/starter` uses (there as an esbuild `onResolve` hook). Packages like `vscode-html-languageservice` and `jsonc-parser` ship UMD bundles whose internal `require("./parser/…")` calls confuse rolldown; rewriting imports to use the package's parallel `/esm/` build sidesteps the issue. `enforce: "pre"` is critical — without it Vite's built-in resolver handles the package first and the rewrite never fires.

**`resolve.conditions: ["node"]`.** Vite's defaults are browser-first. `vscode-languageclient` and `@volar/language-server` have `node`-conditioned export maps; without this line the bundler resolves browser-shaped modules and `TransportKind` ends up `undefined` at runtime.

The language-server package has its own `vite.config.ts` with the same `umd2esm` plugin and the same fully-bundled posture, but with a single entry producing `dist/happy-server.js` for the bin shim. The two server bundles are interchangeable — one ships inside the extension, the other is for cross-editor consumers.

### 9. Packaging

`pnpm run pack:vsix` runs `vite build` followed by `vsce package --no-dependencies`. Because the build produces a fully-bundled `dist/`, there's nothing in `node_modules` to walk; `--no-dependencies` tells `vsce` to skip dependency resolution and just zip what's in the extension folder, minus what `.vscodeignore` excludes:

```
src/**
vite.config.ts
tsconfig.json
**/*.map
.vscode/**
```

The result — `packages/vscode/volar-happy-0.1.0.vsix` — is around 230 KB, fully self-contained.

Install it locally with:

```sh
code --install-extension packages/vscode/volar-happy-0.1.0.vsix
```

…or via the Extensions panel's **"Install from VSIX…"** menu. Open a `.happy` file in any VS Code window and you should see the same activation trace as F5 produced.

---

## Reference

- **Official Volar guide** (incomplete): https://volarjs.dev/guides/first-server/
- **`volarjs/starter`** (last touched 2024-09-12, Volar 2.4.0): https://github.com/volarjs/starter
- **Real-world plugins:**
  - [`vuejs/language-tools`](https://github.com/vuejs/language-tools) — canonical reference, especially `packages/language-core`.
  - [`withastro/language-tools`](https://github.com/withastro/language-tools) — smaller scope, easier to read end-to-end.
- **`@volar/language-core` types** — `node_modules/@volar/language-core/types.d.ts`. Treat these as the authoritative API reference.

## License

MIT — see [LICENSE](./LICENSE).
