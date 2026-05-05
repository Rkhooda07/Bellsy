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
    const config = vscode.workspace.getConfiguration('bellsy');
    const mode = config.get<string>('soundMode', DEFAULT_SOUND_MODE);
    return mode === 'vibe' ? 'vibe' : 'focus';
  } catch {
    return 'focus';
  }
}

export class SoundService {
  private readonly soundsPaths: readonly string[];
  private readonly runCommand: (command: string, onError: (error: Error | null) => void) => void;

  constructor(
    soundsPath: string | readonly string[],
    private readonly soundEnabled: boolean,
    private readonly volume: number,
    private readonly readSoundMode: () => SoundMode = getSoundMode,
    runCommand?: (command: string, onError: (error: Error | null) => void) => void,
  ) {
    this.soundsPaths = Array.isArray(soundsPath) ? soundsPath : [soundsPath];
    this.runCommand = runCommand ?? ((command, onError) => exec(command, onError));
  }

  playPermissionAlert(): void {
    this.play('permission');
  }

  playTaskComplete(): void {
    this.play('completed');
  }

  playTaskCompletePreview(mode: SoundMode): void {
    this.play('completed', mode, true);
  }

  resolveTaskCompleteSoundPath(mode: SoundMode = this.readSoundMode()): string | undefined {
    return this.resolveSoundPath(SOUND_FILES[mode].completed);
  }

  private play(kind: 'permission' | 'completed', modeOverride?: SoundMode, immediate = false): void {
    if (!this.soundEnabled) {
      return;
    }

    const mode = modeOverride ?? this.readSoundMode();
    const filenames = SOUND_FILES[mode][kind];
    const fullPath = kind === 'completed' ? this.resolveTaskCompleteSoundPath(mode) : this.resolveSoundPath(filenames);
    const command = this.buildCommand(fullPath);
    if (!command) {
      return;
    }

    const runPlayback = (): void => {
      this.runCommand(command, (error) => {
        if (error) {
          console.error(`[SoundService] Failed to play ${filenames[0]}: ${error.message}`);
        }
      });
    };

    if (os.platform() === 'darwin' && !immediate) {
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
