import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

import { OutputChannelLogger } from './OutputChannelLogger';

type TerminalEnvironmentCollectionLike = {
  prepend(variable: string, value: string): void;
};

const SHELL_BOOTSTRAP_START = '# >>> Bellsy >>>';
const SHELL_BOOTSTRAP_END = '# <<< Bellsy <<<';
const ENDPOINT_CONFIG_FILE = 'endpoint';

export function buildPosixBellsyRunShim(targetScriptPath: string, endpointFilePath: string): string {
  const escapedTargetPath = targetScriptPath.replace(/'/g, `'\\''`);
  const escapedEndpointFilePath = endpointFilePath.replace(/'/g, `'\\''`);
  return `#!/usr/bin/env sh
if [ -f '${escapedEndpointFilePath}' ]; then
  BELLSY_URL="$(cat '${escapedEndpointFilePath}')"
  export BELLSY_URL
fi
node '${escapedTargetPath}' "$@"
`;
}

export function buildWindowsBellsyRunShim(targetScriptPath: string, endpointFilePath: string): string {
  const normalizedTargetPath = targetScriptPath.replace(/\//g, '\\');
  const normalizedEndpointFilePath = endpointFilePath.replace(/\//g, '\\');
  return `@echo off\r\nif exist "${normalizedEndpointFilePath}" set /p BELLSY_URL=<"${normalizedEndpointFilePath}"\r\nnode "${normalizedTargetPath}" %*\r\n`;
}

export function buildPosixShellPathBootstrap(binDir: string): string {
  const escapedBinDir = binDir.replace(/'/g, `'\\''`);
  return [
    SHELL_BOOTSTRAP_START,
    `if [ -d '${escapedBinDir}' ]; then`,
    `  export PATH='${escapedBinDir}':"$PATH"`,
    'fi',
    SHELL_BOOTSTRAP_END,
  ].join('\n');
}

export function upsertShellBootstrap(content: string, block: string): string {
  const pattern = new RegExp(`${escapeRegExp(SHELL_BOOTSTRAP_START)}[\\s\\S]*?${escapeRegExp(SHELL_BOOTSTRAP_END)}\\n?`, 'm');
  const normalizedBlock = `${block}\n`;

  if (pattern.test(content)) {
    return content.replace(pattern, normalizedBlock);
  }

  const trimmed = content.trimEnd();
  return trimmed ? `${trimmed}\n\n${normalizedBlock}` : normalizedBlock;
}

export class CliShimService {
  constructor(
    private readonly globalStoragePath: string,
    private readonly extensionPath: string,
    private readonly envCollection: TerminalEnvironmentCollectionLike,
    private readonly logger: Pick<OutputChannelLogger, 'info' | 'warn'>,
    private readonly platform = process.platform,
    private readonly homeDir = os.homedir(),
  ) {}

  async install(): Promise<string | undefined> {
    const targetScriptPath = path.join(this.extensionPath, 'out', 'cli', 'bellsy-run.js');
    const binDir = path.join(this.globalStoragePath, 'bin');
    const endpointFilePath = path.join(this.globalStoragePath, ENDPOINT_CONFIG_FILE);

    try {
      await fs.mkdir(binDir, { recursive: true });
      await fs.writeFile(path.join(binDir, 'bellsy-run'), buildPosixBellsyRunShim(targetScriptPath, endpointFilePath), {
        encoding: 'utf8',
        mode: 0o755,
      });
      await fs.chmod(path.join(binDir, 'bellsy-run'), 0o755);

      if (this.platform === 'win32') {
        await fs.writeFile(
          path.join(binDir, 'bellsy-run.cmd'),
          buildWindowsBellsyRunShim(targetScriptPath, endpointFilePath),
          'utf8',
        );
      }

      this.envCollection.prepend('PATH', `${binDir}${path.delimiter}`);
      if (this.platform === 'win32') {
        this.envCollection.prepend('Path', `${binDir}${path.delimiter}`);
      } else {
        await this.ensureShellBootstrap(binDir);
      }

      this.logger.info(`Bellsy CLI shim ready in ${binDir}`);
      return binDir;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to install Bellsy CLI shim: ${message}`);
      return undefined;
    }
  }

  async updateEndpoint(endpoint: string | undefined): Promise<void> {
    if (!endpoint) {
      return;
    }

    try {
      await fs.mkdir(this.globalStoragePath, { recursive: true });
      await fs.writeFile(path.join(this.globalStoragePath, ENDPOINT_CONFIG_FILE), `${endpoint}\n`, 'utf8');
      this.logger.info(`Bellsy CLI shim endpoint set to ${endpoint}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to persist Bellsy CLI endpoint: ${message}`);
    }
  }

  private async ensureShellBootstrap(binDir: string): Promise<void> {
    const block = buildPosixShellPathBootstrap(binDir);
    const shellFiles = [path.join(this.homeDir, '.zprofile'), path.join(this.homeDir, '.zshrc'), path.join(this.homeDir, '.bash_profile'), path.join(this.homeDir, '.bashrc')];

    for (const shellFile of shellFiles) {
      try {
        const existing = await fs.readFile(shellFile, 'utf8').catch((error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') {
            return '';
          }
          throw error;
        });
        const next = upsertShellBootstrap(existing, block);
        if (next !== existing) {
          await fs.writeFile(shellFile, next, 'utf8');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Failed to update shell profile ${shellFile}: ${message}`);
      }
    }
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
