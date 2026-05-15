import * as fs from 'fs/promises';
import * as path from 'path';

import { OutputChannelLogger } from './OutputChannelLogger';

type TerminalEnvironmentCollectionLike = {
  prepend(variable: string, value: string): void;
};

export function buildPosixBellsyRunShim(targetScriptPath: string): string {
  const escapedTargetPath = targetScriptPath.replace(/'/g, `'\\''`);
  return `#!/usr/bin/env sh
node '${escapedTargetPath}' "$@"
`;
}

export function buildWindowsBellsyRunShim(targetScriptPath: string): string {
  const normalizedTargetPath = targetScriptPath.replace(/\//g, '\\');
  return `@echo off\r\nnode "${normalizedTargetPath}" %*\r\n`;
}

export class CliShimService {
  constructor(
    private readonly globalStoragePath: string,
    private readonly extensionPath: string,
    private readonly envCollection: TerminalEnvironmentCollectionLike,
    private readonly logger: Pick<OutputChannelLogger, 'info' | 'warn'>,
    private readonly platform = process.platform,
  ) {}

  async install(): Promise<string | undefined> {
    const targetScriptPath = path.join(this.extensionPath, 'out', 'cli', 'bellsy-run.js');
    const binDir = path.join(this.globalStoragePath, 'bin');

    try {
      await fs.mkdir(binDir, { recursive: true });
      await fs.writeFile(path.join(binDir, 'bellsy-run'), buildPosixBellsyRunShim(targetScriptPath), {
        encoding: 'utf8',
        mode: 0o755,
      });
      await fs.chmod(path.join(binDir, 'bellsy-run'), 0o755);

      if (this.platform === 'win32') {
        await fs.writeFile(path.join(binDir, 'bellsy-run.cmd'), buildWindowsBellsyRunShim(targetScriptPath), 'utf8');
      }

      this.envCollection.prepend('PATH', `${binDir}${path.delimiter}`);
      if (this.platform === 'win32') {
        this.envCollection.prepend('Path', `${binDir}${path.delimiter}`);
      }

      this.logger.info(`Bellsy CLI shim ready in ${binDir}`);
      return binDir;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to install Bellsy CLI shim: ${message}`);
      return undefined;
    }
  }
}
