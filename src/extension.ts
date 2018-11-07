'use strict';
import * as child_process from 'child_process';
import * as os from 'os';
import * as path from 'path';
import {
  commands,
  ExtensionContext,
  OutputChannel,
  TextDocument,
  Uri,
  window,
  workspace,
  WorkspaceFolder
} from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  RevealOutputChannelOn,
  ServerOptions,
  TransportKind
} from 'vscode-languageclient';
import { ShowTypeHover } from './commands/showType';
import { DocsBrowser } from './docsBrowser';

const clients: Map<string, LanguageClient> = new Map();

const CONFIG_NAME = 'languageServerForthel';
function getExecutablePath(): string {
  return workspace.getConfiguration(CONFIG_NAME).get('executablePath', path.join(os.homedir(), '.local', 'bin', 'SAD'));
  //return "~/.local/bin/SAD"; //[HACK] make this slightly more PC independent please.
}
function getExecutableArgs(): string[] {
  return ['--lsp'];
}
function getLogLevel(): 'off' | 'messages' | 'verbose' {
  return workspace.getConfiguration(CONFIG_NAME).trace.server;
}
function getEnable(): boolean {
  return workspace.getConfiguration(CONFIG_NAME).get('enable', true);
}

export async function activate(context: ExtensionContext) {
  console.log('activating extension');
  // Register HIE to check every time a text document gets opened, to
  // support multi-root workspaces.
  workspace.onDidOpenTextDocument(async (document: TextDocument) => await activateHie(context, document));
  workspace.textDocuments.forEach(async (document: TextDocument) => await activateHie(context, document));
  // Stop HIE from any workspace folders that are removed.
  workspace.onDidChangeWorkspaceFolders(event => {
    for (const folder of event.removed) {
      const client = clients.get(folder.uri.toString());
      if (client) {
        clients.delete(folder.uri.toString());
        client.stop();
      }
    }
  });
}

async function activateHie(context: ExtensionContext, document: TextDocument) {
  // We are only interested in Haskell files.
  if (document.languageId !== 'forthel' || (document.uri.scheme !== 'file' && document.uri.scheme !== 'untitled')) {
    return;
  }

  const uri = document.uri;
  const folder = workspace.getWorkspaceFolder(uri);
  // Don't handle files outside of a folder.
  if (!folder) {
    return;
  }
  // If the client already has an LSP server, then don't start a new one.
  if (clients.has(folder.uri.toString())) {
    return;
  }
  activateNoCheck(context, folder, uri);
}

function activateNoCheck(context: ExtensionContext, folder: WorkspaceFolder, uri: Uri) {
  if (!getEnable()) {
    return;
  }

  // Set up the documentation browser.
  // if (!docsBrowserRegistered) {
  //   const docsDisposable = DocsBrowser.registerDocsBrowser();
  //   context.subscriptions.push(docsDisposable);
  //   docsBrowserRegistered = true;
  // }

  const logLevel = getLogLevel();
  const serverPath = getExecutablePath();

  const tempDir = os.tmpdir();
  const runArgs: string[] = getExecutableArgs();
  let debugArgs: string[] = getExecutableArgs();
  if (logLevel === 'verbose') {
    debugArgs = ['-d', '-l', path.join(tempDir, 'hie.log'), '--vomit'];
  } else if (logLevel === 'messages') {
    debugArgs = ['-d', '-l', path.join(tempDir, 'hie.log')];
  }
  // if (!useCustomWrapper && hieExecutablePath !== '') {
  //   runArgs.unshift('--lsp');
  //   debugArgs.unshift('--lsp');
  // }

  // If the extension is launched in debug mode then the debug server options are used,
  // otherwise the run options are used.
  const serverOptions: ServerOptions = {
    run: { command: serverPath, transport: TransportKind.stdio, args: runArgs },
    debug: { command: serverPath, transport: TransportKind.stdio, args: debugArgs }
  };

  // Set a unique name per workspace folder (useful for multi-root workspaces).
  const langName = 'ForTheL (' + folder.name + ')';
  const outputChannel: OutputChannel = window.createOutputChannel(langName);
  const clientOptions: LanguageClientOptions = {
    // Use the document selector to only notify the LSP on files inside the folder
    // path for the specific workspace.
    documentSelector: [{ scheme: 'file', language: 'forthel', pattern: `${folder.uri.fsPath}/**/*` }],
    synchronize: {
      // Synchronize the setting section 'languageServerHaskell' to the server.
      configurationSection: 'languageServerForTheL',
      // Notify the server about file changes to '.clientrc files contain in the workspace.
      fileEvents: workspace.createFileSystemWatcher('**/.clientrc')
    },
    diagnosticCollectionName: langName,
    revealOutputChannelOn: RevealOutputChannelOn.Never,
    outputChannel,
    outputChannelName: langName,
    middleware: {
      provideHover: DocsBrowser.hoverLinksMiddlewareHook
    },
    // Set the current working directory, for HIE, to be the workspace folder.
    workspaceFolder: folder
  };

  // Create the LSP client.
  const langClient = new LanguageClient(langName, langName, serverOptions, clientOptions, true);

  // add show type on hover support.
  context.subscriptions.push(ShowTypeHover.registerTypeHover(clients));
  // Register editor commands for HIE, but only register the commands once.
  // if (!hieCommandsRegistered) {
  //   context.subscriptions.push(InsertType.registerCommand(clients));
  //   const showTypeCmd = ShowTypeCommand.registerCommand(clients);
  //   if (showTypeCmd !== null) {
  //     showTypeCmd.forEach(x => context.subscriptions.push(x));
  //   }
  //   context.subscriptions.push(ImportIdentifier.registerCommand());
  //   registerHiePointCommand('hie.commands.demoteDef', 'hare:demote', context);
  //   registerHiePointCommand('hie.commands.liftOneLevel', 'hare:liftonelevel', context);
  //   registerHiePointCommand('hie.commands.liftTopLevel', 'hare:lifttotoplevel', context);
  //   registerHiePointCommand('hie.commands.deleteDef', 'hare:deletedef', context);
  //   registerHiePointCommand('hie.commands.genApplicative', 'hare:genapplicative', context);
  //   registerHiePointCommand('hie.commands.caseSplit', 'ghcmod:casesplit', context);
  //   hieCommandsRegistered = true;
  // }

  // If the client already has an LSP server, then don't start a new one.
  // We check this again, as there may be multiple parallel requests.
  if (clients.has(folder.uri.toString())) {
    return;
  }

  // Finally start the client and add it to the list of clients.
  langClient.start();
  clients.set(folder.uri.toString(), langClient);
}

/*
 * Deactivate each of the LSP servers.
 */
export function deactivate(): Thenable<void> {
  const promises: Array<Thenable<void>> = [];
  for (const client of clients.values()) {
    promises.push(client.stop());
  }
  return Promise.all(promises).then(() => undefined);
}

/*
 * Check if HIE is installed.
 */
async function isHieInstalled(): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const cmd: string = process.platform === 'win32' ? 'where hie' : 'which hie';
    child_process.exec(cmd, (error, stdout, stderr) => resolve(!error));
  });
}

/*
 * Create an editor command that calls an action on the active LSP server.
 */
async function registerHiePointCommand(name: string, command: string, context: ExtensionContext) {
  const editorCmd = commands.registerTextEditorCommand(name, (editor, edit) => {
    const cmd = {
      command,
      arguments: [
        {
          file: editor.document.uri.toString(),
          pos: editor.selections[0].active
        }
      ]
    };
    // Get the current file and workspace folder.
    const uri = editor.document.uri;
    const folder = workspace.getWorkspaceFolder(uri);
    // If there is a client registered for this workspace, use that client.
    if (folder !== undefined && clients.has(folder.uri.toString())) {
      const client = clients.get(folder.uri.toString());
      if (client !== undefined) {
        client.sendRequest('workspace/executeCommand', cmd).then(
          hints => {
            return true;
          },
          e => {
            console.error(e);
          }
        );
      }
    }
  });
  context.subscriptions.push(editorCmd);
}
