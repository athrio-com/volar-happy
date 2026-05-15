import type { CodeMapping, LanguagePlugin, VirtualCode } from "@volar/language-core";
import type { URI } from "vscode-uri";
import type * as ts from "typescript";

// =============================================================================
// Happy language plugin — activation stub.
//
// No parsing. Every entry point logs its invocation so you can verify the
// expected sequence when a .happy file is opened, changed, and closed:
//
//   1. getLanguageId(uri)            once per file URI Volar inspects
//   2. createVirtualCode(...)        on open, returns a HappyVirtualCode
//   3. HappyVirtualCode constructor  triggers onSnapshotUpdated once
//   4. updateVirtualCode(...)        on every textDocument/didChange
//   5. HappyVirtualCode.update(...)  triggers onSnapshotUpdated again
//
// Logs surface in VS Code's Output panel under the
// "Happy Language Server" channel (View → Output, select from dropdown).
// =============================================================================

export const happyLanguagePlugin = {
  getLanguageId(uri) {
    console.log("[Happy] getLanguageId:", uri.path);
    if (uri.path.endsWith(".happy")) {
      console.log("[Happy]   -> matched 'happy'");
      return "happy";
    }
  },
  createVirtualCode(uri, languageId, _snapshot) {
    console.log("[Happy] createVirtualCode:", uri.path, "languageId=", languageId);
    if (languageId === "happy") {
      console.log("[Happy]   -> constructing HappyVirtualCode");
      return new HappyVirtualCode(_snapshot);
    }
  },
  updateVirtualCode(uri, languageCode: HappyVirtualCode, snapshot) {
    console.log("[Happy] updateVirtualCode:", uri.path);
    languageCode.update(snapshot);
    return languageCode;
  },
} satisfies LanguagePlugin<URI>;

export class HappyVirtualCode implements VirtualCode {
  id = "root";
  languageId = "happy";
  mappings: CodeMapping[] = [];
  embeddedCodes: VirtualCode[] = [];

  constructor(public snapshot: ts.IScriptSnapshot) {
    console.log("[Happy]   HappyVirtualCode constructor: length =", snapshot.getLength());
    this.onSnapshotUpdated();
  }

  update(newSnapshot: ts.IScriptSnapshot) {
    console.log("[Happy]   HappyVirtualCode.update: length =", newSnapshot.getLength());
    this.snapshot = newSnapshot;
    this.onSnapshotUpdated();
  }

  private onSnapshotUpdated() {
    const text = this.snapshot.getText(0, this.snapshot.getLength());

    // Identity mapping over the whole document.
    // Required by the VirtualCode interface; without it, Volar treats this
    // file as opaque and downstream services see no source coordinates.
    this.mappings = [{
      sourceOffsets: [0],
      generatedOffsets: [0],
      lengths: [text.length],
      data: {
        completion: true,
        format: true,
        navigation: true,
        semantic: true,
        structure: true,
        verification: true,
      },
    }];

    console.log("[Happy]   onSnapshotUpdated: text length =", text.length);
    console.log("[Happy]   first 200 chars:", JSON.stringify(text.slice(0, 200)));

    // Real work goes here once activation is confirmed:
    //   const ast = parseHappy(text)
    //   this.embeddedCodes = [...collectEmbeddedCodes(ast)]
  }
}
