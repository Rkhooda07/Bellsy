import { PermissionResponse } from '../core/types';

export interface IResponseTarget {
  send(response: PermissionResponse): Promise<void>;
}

export class ResponseDispatcher {
  private target: IResponseTarget | null = null;

  setTarget(target: IResponseTarget): void {
    this.target = target;
  }

  async dispatch(response: PermissionResponse): Promise<void> {
    if (!this.target) {
      return;
    }

    await this.target.send(response);
  }
}
