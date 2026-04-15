import { AgentEvent } from '../core/types';

export interface ITransport {
  start(): Promise<void>;
  stop(): Promise<void>;
  onEvent(callback: (event: AgentEvent) => void): void;
}
