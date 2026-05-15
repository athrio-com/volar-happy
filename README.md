# Volar Happy Path

🥬 **Volar Happy Path** — a minimal **working** Volar.js language extension scaffold distilled from real-world work.

🐌 If it saved you a weekend, consider supporting our education organisation
**Quadrivium Academy**: **[ko-fi.com/quadrivium](https://ko-fi.com/quadrivium)**. Thank you.

This repository is a complement to the official Volar guide,
[**Your First Volar Language Server**](https://volarjs.dev/guides/first-server/),
which is marked _"work in progress"_ and stops mid-implementation. The Happy Path gives you a **runnable starter** with the gaps filled in:

- pnpm 11 workspace
- Vite library mode for both packages
- A complete `HappyVirtualCode` class
- The plugin actually registered in `createSimpleProject([happyLanguagePlugin])`
- `.vscode/launch.json` + `.vscode/tasks.json` checked in, so <kbd>F5</kbd> just works
- Diagnostic `console.log` at every plugin entry point

The project's only language semantics are: _"a file ending in `.happy` exists."_
Nothing is parsed. Publishing is **out of scope**. MIT licensed. Fork freely.

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
[Happy]   first 1000 chars: "…"
```

Type into the file. Every keystroke produces an `updateVirtualCode` entry.
You now have a closed feedback loop with Volar. Build a real plugin on top.

---

## Architecture

```
volar-happy/
├── packages/
│   ├── language-server/                LSP server (Node subprocess)
│   │   ├── bin/happy-language-server.js   CLI shim for clients that launch the server as a binary (Neovim, Zed, …)
│   │   ├── src/
│   │   │   ├── index.ts                Wires Volar's connection, registers services
│   │   │   └── languagePlugin.ts       getLanguageId, createVirtualCode, updateVirtualCode
│   │   └── vite.config.ts              Library bundle → dist/happy-server.js (CJS, Node target)
│   └── vscode/                         VS Code extension (the "client")
│       ├── src/vscode-extension.ts     Spawns the server, attaches LanguageClient
│       ├── language-configuration.json VS Code editor metadata: brackets, comments, auto-pairs
│       └── vite.config.ts              Library bundle → dist/vscode-extension.js
├── samples/hello.happy                 Demo file to open in the Extension Development Host
├── .vscode/
│   ├── launch.json                     "Run Happy Extension" (F5) + "Attach to Happy Server"
│   └── tasks.json                      VSC build task, invoked by F5's preLaunchTask
├── pnpm-workspace.yaml
├── tsconfig.base.json                  Strict TS, NodeNext modules, declarations + sourcemaps
└── tsconfig.json                       Root — for editor IntelliSense across the workspace
```

## 📖 Step-by-step guide

Sections below shadow the official Volar [**Getting started guide**](https://volarjs.dev/guides/first-server/) — same numbering, same headings — and override only where Happy Path diverges. Read the two alongside: Happy Path is commentary on the guide, not a self-contained replacement for it. Anything the guide already covers correctly is not repeated here.

**`[+]`** marks a point where Happy Path diverges from the guide — either by adding what the guide skips or by correcting something that doesn't work as written.

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

Create the root `package.json`:

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

Root devDependencies are the build tools and types every package shares.

**`[+]`** Create `pnpm-workspace.yaml`:

```yaml
packages:
  - packages/*
allowBuilds:                      # [+] pnpm 11 requires explicit approval for native postinstalls
  '@parcel/watcher': true
  esbuild: true
  msgpackr-extract: true
```

**`[+]`** — without `allowBuilds`, pnpm 11 prints `Ignored build scripts: @parcel/watcher, esbuild, msgpackr-extract` and those packages don't fully install.

Create a stub `package.json` in each sub-package so pnpm registers them as workspaces:

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
pnpm --filter @volar-happy/language-server add -D vscode-uri   # [+] type-only need

# vscode client
pnpm --filter @volar-happy/vscode add \
  @volar-happy/language-server @volar/language-server @volar/vscode \
  vscode-languageclient
pnpm --filter @volar-happy/vscode add -D @types/vscode         # [+] devDependency, not dependency
```

**`[+]`** — `vscode-uri` is a **devDependency** of `language-server`. Volar's published TypeScript types reference `URI` from it, so the compiler needs it; but at runtime VS Code's host provides URIs, the bundle never constructs them, and shipping it as a runtime dep is not needed.

**`[+]`** — `@types/vscode` is a **devDependency** of `vscode`. Types are erased at build time and don't ship to users.

The `pnpm --filter @volar-happy/vscode add @volar-happy/language-server` step records `"workspace:*"` in the client's `package.json` and creates the symlink at `packages/vscode/node_modules/@volar-happy/language-server/`. That symlink is what the extension uses at runtime to spawn the server.

### 3. Installing and configuring TypeScript

Create `tsconfig.base.json` at the repo root:

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

In each sub-package, create a `tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "out", "rootDir": "src" },
  "include": ["src"]
}
```

### 4. Defining VS Code tasks

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
      "outFiles": ["${workspaceFolder}/packages/language-server/dist/*.js"]
    }
  ]
}
```

**`[+]`** Create `.vscode/tasks.json` — defines the `build` task F5 runs via `preLaunchTask` before launching the Extension Development Host:

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

Create `packages/vscode/package.json`:

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

**`[+]`** — `@volar-happy/language-server` must be declared as `"workspace:*"`. pnpm uses this to create the symlink at `packages/vscode/node_modules/@volar-happy/language-server/`. The extension code below spawns the server through that symlinked path; the spawn fails with `Cannot find module …` if the dependency isn't declared.

Create [`packages/vscode/src/vscode-extension.ts`](./packages/vscode/src/vscode-extension.ts). Notice:

```ts
// packages/vscode/src/vscode-extension.ts — excerpt
// …

// Resolved through the pnpm workspace:* symlink declared above.
const serverModule = vscode.Uri.joinPath(
  context.extensionUri,
  "node_modules", "@volar-happy", "language-server",
  "dist", "happy-server.js",
);

// IPC: child_process.fork() + Node IPC, no per-message JSON serialisation.
const serverOptions: lsp.ServerOptions = {
  run:   { module: serverModule.fsPath, transport: lsp.TransportKind.ipc, options: { execArgv: [] as string[] } },
  debug: { module: serverModule.fsPath, transport: lsp.TransportKind.ipc, options: { execArgv: ["--nolazy", "--inspect=6009"] } },
};

// …
```

The rest of `activate()` is conventional LSP wiring: build `clientOptions` with `documentSelector: [{ language: "happy" }]`, construct `lsp.LanguageClient`, `await client.start()`, register `activateAutoInsertion("happy", client)`, and return a `createLabsInfo(serverProtocol)` handle for the optional Volar Labs inspector.

**`[+]`** Create `packages/vscode/language-configuration.json` — VS-Code-side metadata only (brackets, comments, auto-pairs). No LSP involved; the editor reads it directly. The guide skips this; it's an easy ergonomic win:

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

Create `packages/language-server/package.json`:

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

Create [`packages/language-server/src/index.ts`](./packages/language-server/src/index.ts). Notice the plugin registration:

```ts
// packages/language-server/src/index.ts — excerpt
// …

connection.onInitialize((params) => {
  return server.initialize(
    params,
    createSimpleProject([happyLanguagePlugin]),    // [+] register the plugin
    [createHtmlService(), createCssService()],
  );
});

// …
```

**`[+]`** — the plugin must be **actually registered** in `createSimpleProject([happyLanguagePlugin])`. The guide's snippet passes an empty array, so opening a `.happy` file produces no logs and no virtual code construction — the LSP server runs but is inert.

### 7. Server configuration — bundling with Vite

**`[+]`** The official guide and `volarjs/starter` use esbuild via a hand-written build script; Happy Path uses Vite library mode for both packages. Same outcome (one CJS bundle per package), fewer moving parts.

Create [`packages/language-server/vite.config.ts`](./packages/language-server/vite.config.ts) and [`packages/vscode/vite.config.ts`](./packages/vscode/vite.config.ts). They share the similar shape — only the entry path, output filename, and the client's extra `"vscode"` external differ. Notice:

```ts
// packages/language-server/vite.config.ts — excerpt
// …

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
    rollupOptions: { external: isExternal },
  },
});
```

### 8. Defining the language — `languagePlugin.ts`

**This is where the official guide stops.**

Create [`packages/language-server/src/languagePlugin.ts`](./packages/language-server/src/languagePlugin.ts). Notice:

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
    languageCode.update(snapshot);    // [+] mutate the existing instance — Volar keeps the
    return languageCode;              //     same VirtualCode identity across edits
  },
} satisfies LanguagePlugin<URI>;

export class HappyVirtualCode implements VirtualCode {
  id = "root";
  languageId = "happy";
  mappings: CodeMapping[] = [];       // [+] REQUIRED — guide's class snippet omits this field
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

**`[+]`** — `mappings: CodeMapping[] = []` is **required** by the `VirtualCode` interface. The guide's `Html1Code` snippet declares `id`, `languageId`, `embeddedCodes`, and `snapshot` but omits `mappings`, so `implements VirtualCode` won't compile.

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

## Cross-editor — the `bin` shim

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
