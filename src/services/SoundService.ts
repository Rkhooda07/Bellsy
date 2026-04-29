import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { SOUND_FILES } from '../core/constants';

const MACOS_SYSTEM_SOUNDS = {
  permission: '/System/Library/Sounds/Ping.aiff',
  completed: '/System/Library/Sounds/Glass.aiff',
} as const;
const MACOS_NOTIFICATION_SYNC_DELAY_MS = 120;

export class SoundService {
  constructor(
    private readonly soundsPath: string,
    private readonly soundEnabled: boolean,
    private readonly volume: number,
  ) {}

  playPermissionAlert(): void {
    this.play(SOUND_FILES.permission, MACOS_SYSTEM_SOUNDS.permission);
  }

  playTaskComplete(): void {
    this.play(SOUND_FILES.completed, MACOS_SYSTEM_SOUNDS.completed);
  }

  private play(filenames: readonly string[], macosSystemSoundPath: string): void {
    if (!this.soundEnabled) {
      return;
    }

    const fullPath = this.resolveSoundPath(filenames);
    const command = this.buildCommand(fullPath, macosSystemSoundPath);
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
    for (const filename of filenames) {
      const fullPath = path.join(this.soundsPath, filename);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }

    const [fallback] = filenames;
    return fallback ? path.join(this.soundsPath, fallback) : undefined;
  }

  buildCommand(filePath: string | undefined, macosSystemSoundPath: string): string | null {
    switch (os.platform()) {
      case 'darwin':
        if (filePath && fs.existsSync(filePath)) {
          return `afplay -v ${this.normalizedVolume} "${filePath}"`;
        }

        return `afplay -v ${this.normalizedVolume} "${macosSystemSoundPath}"`;
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
