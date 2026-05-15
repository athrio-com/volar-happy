import * as serverProtocol from "@volar/language-server/protocol";
import { activateAutoInsertion, createLabsInfo } from "@volar/vscode";
import * as vscode from "vscode";
import * as lsp from "vscode-languageclient/node";

let client: lsp.BaseLanguageClient;

export async function activate(context: vscode.ExtensionContext) {
  const serverModule = vscode.Uri.joinPath(
    context.extensionUri,
    "node_modules",
    "@volar-happy",
    "language-server",
    "dist",
    "happy-server.js",
  );
  const serverOptions: lsp.ServerOptions = {
    run: {
      module: serverModule.fsPath,
      transport: lsp.TransportKind.ipc,
      options: { execArgv: [] as string[] },
    },
    debug: {
      module: serverModule.fsPath,
      transport: lsp.TransportKind.ipc,
      options: { execArgv: ["--nolazy", "--inspect=6009"] },
    },
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
