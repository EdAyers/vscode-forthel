import { commands, DocumentFilter, ExtensionContext, languages, Uri, workspace } from 'vscode';
import { Server } from './server';
import { ProcessTransport } from './process';
import { CONFIGURATION_KEY, DEFAULT_EXECUTABLE_PATH } from './constants';

export function getConfig() {return workspace.getConfiguration(CONFIGURATION_KEY);}
export function getExecutablePath() {return getConfig().get("executablePath", DEFAULT_EXECUTABLE_PATH);}

export function activate(context : ExtensionContext) {
        const wd = workspace.rootPath;
        const transport = new ProcessTransport(getExecutablePath(), wd, []);
        const server = new Server(transport);
        server.connect();

        
        
}