import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { SOUND_FILES } from '../core/constants';

const MACOS_SYSTEM_SOUNDS = {
  permission: '/System/Library/Sounds/Ping.aiff',
  completed: '/System/Library/Sounds/Glass.aiff',
} as const;

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

  private play(filename: string, macosSystemSoundPath: string): void {
    if (!this.soundEnabled) {
      return;
    }

    const fullPath = path.join(this.soundsPath, filename);
    const command = this.buildCommand(fullPath, macosSystemSoundPath);
    if (!command) {
      return;
    }

    exec(command, (error) => {
      if (error) {
        console.error(`[SoundService] Failed to play ${filename}: ${error.message}`);
      }
    });
  }

  private buildCommand(filePath: string, macosSystemSoundPath: string): string | null {
    switch (os.platform()) {
      case 'darwin':
        return `afplay -v ${this.normalizedVolume} "${macosSystemSoundPath}"`;
      case 'win32':
        if (!fs.existsSync(filePath)) {
          return null;
        }

        return `powershell -NoProfile -Command "(New-Object Media.SoundPlayer '${filePath.replace(/'/g, "''")}').PlaySync();"`;
      case 'linux':
        if (!fs.existsSync(filePath)) {
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
