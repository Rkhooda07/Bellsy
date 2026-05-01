import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { DEFAULT_SOUND_MODE, SOUND_FILES } from '../core/constants';

const MACOS_NOTIFICATION_SYNC_DELAY_MS = 120;

export type SoundMode = 'focus' | 'vibe';

export function getSoundMode(): SoundMode {
  try {
    const vscode = require('vscode') as typeof import('vscode');
    const mode = vscode.workspace.getConfiguration('pingly').get<string>('soundMode', DEFAULT_SOUND_MODE);
    return mode === 'vibe' ? 'vibe' : 'focus';
  } catch {
    return 'focus';
  }
}

export class SoundService {
  private readonly soundsPaths: readonly string[];

  constructor(
    soundsPath: string | readonly string[],
    private readonly soundEnabled: boolean,
    private readonly volume: number,
    private readonly readSoundMode: () => SoundMode = getSoundMode,
  ) {
    this.soundsPaths = Array.isArray(soundsPath) ? soundsPath : [soundsPath];
  }

  playPermissionAlert(): void {
    this.play('permission');
  }

  playTaskComplete(): void {
    this.play('completed');
  }

  private play(kind: 'permission' | 'completed'): void {
    if (!this.soundEnabled) {
      return;
    }

    const mode = this.readSoundMode();
    const filenames = SOUND_FILES[mode][kind];
    const fullPath = this.resolveSoundPath(filenames);
    const command = this.buildCommand(fullPath);
    if (!command) {
      return;
    }

    const runPlayback = (): void => {
      exec(command, (error) => {
        if (error) {
          console.error(`[SoundService] Failed to play ${filenames[0]}: ${error.message}`);
        }
      });
    };

    if (os.platform() === 'darwin') {
      setTimeout(runPlayback, MACOS_NOTIFICATION_SYNC_DELAY_MS);
      return;
    }

    runPlayback();
  }

  private resolveSoundPath(filenames: readonly string[]): string | undefined {
    for (const soundsPath of this.soundsPaths) {
      for (const filename of filenames) {
        const fullPath = path.join(soundsPath, filename);
        if (fs.existsSync(fullPath)) {
          return fullPath;
        }
      }
    }

    const [fallback] = filenames;
    return fallback ? path.join(this.soundsPaths[0] ?? '', fallback) : undefined;
  }

  buildCommand(filePath: string | undefined): string | null {
    switch (os.platform()) {
      case 'darwin':
        if (filePath && fs.existsSync(filePath)) {
          return `afplay -v ${this.normalizedVolume} "${filePath}"`;
        }
        return null;
      case 'win32':
        if (!filePath || !fs.existsSync(filePath)) {
          return null;
        }

        return `powershell -NoProfile -Command "(New-Object Media.SoundPlayer '${filePath.replace(/'/g, "''")}').PlaySync();"`;
      case 'linux':
        if (!filePath || !fs.existsSync(filePath)) {
          return null;
        }

        return `paplay "${filePath}" || aplay "${filePath}"`;
      default:
        return null;
    }
  }

  private get normalizedVolume(): string {
    return Math.max(0, Math.min(this.volume, 100)).toFixed(0);
  }
}
