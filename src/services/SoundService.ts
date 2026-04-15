import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { SOUND_FILES } from '../core/constants';

export class SoundService {
  constructor(
    private readonly soundsPath: string,
    private readonly soundEnabled: boolean,
    private readonly volume: number,
  ) {}

  playPermissionAlert(): void {
    this.play(SOUND_FILES.permission);
  }

  playTaskComplete(): void {
    this.play(SOUND_FILES.completed);
  }

  private play(filename: string): void {
    if (!this.soundEnabled) {
      return;
    }

    const fullPath = path.join(this.soundsPath, filename);
    if (!fs.existsSync(fullPath)) {
      return;
    }

    const command = this.buildCommand(fullPath);
    if (!command) {
      return;
    }

    exec(command, (error) => {
      if (error) {
        console.error(`[SoundService] Failed to play ${filename}: ${error.message}`);
      }
    });
  }

  private buildCommand(filePath: string): string | null {
    switch (os.platform()) {
      case 'darwin':
        return `afplay -v ${this.normalizedVolume} "${filePath}"`;
      case 'win32':
        return `powershell -NoProfile -Command "(New-Object Media.SoundPlayer '${filePath.replace(/'/g, "''")}').PlaySync();"`;
      case 'linux':
        return `paplay "${filePath}" || aplay "${filePath}"`;
      default:
        return null;
    }
  }

  private get normalizedVolume(): string {
    return Math.max(0, Math.min(this.volume, 100)).toFixed(0);
  }
}
