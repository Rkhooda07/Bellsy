import * as crypto from 'crypto';
import * as http from 'http';
import * as https from 'https';
import * as net from 'net';

type MinimalWebSocketClientOptions = {
  url: string;
  headers?: Record<string, string>;
  onMessage: (message: string) => void;
  onClose: (code?: number, reason?: string) => void;
  onError: (error: Error) => void;
};

export class MinimalWebSocketClient {
  private socket?: net.Socket;
  private buffer = Buffer.alloc(0);
  private closed = false;

  constructor(private readonly options: MinimalWebSocketClientOptions) {}

  async connect(): Promise<void> {
    const url = new URL(this.options.url);
    const key = crypto.randomBytes(16).toString('base64');
    const client = url.protocol === 'wss:' ? https : http;

    await new Promise<void>((resolve, reject) => {
      const request = client.request({
        protocol: url.protocol === 'wss:' ? 'https:' : 'http:',
        hostname: url.hostname,
        port: url.port ? Number(url.port) : undefined,
        path: `${url.pathname}${url.search}`,
        headers: {
          connection: 'Upgrade',
          upgrade: 'websocket',
          'sec-websocket-version': '13',
          'sec-websocket-key': key,
          ...this.options.headers,
        },
      });

      request.once('upgrade', (_response, socket, head) => {
        this.socket = socket;
        this.closed = false;
        this.buffer = head;
        socket.on('data', (chunk) => this.handleData(chunk));
        socket.on('close', () => this.emitClose());
        socket.on('end', () => this.emitClose());
        socket.on('error', (error) => this.options.onError(error));
        resolve();
      });

      request.once('response', (response) => {
        reject(new Error(`WebSocket upgrade failed with ${response.statusCode ?? 0}`));
      });

      request.once('error', reject);
      request.end();
    });
  }

  sendText(message: string): void {
    if (!this.socket || this.closed) {
      throw new Error('WebSocket is not connected.');
    }

    this.socket.write(this.encodeFrame(Buffer.from(message), 0x1));
  }

  close(code = 1000, reason = ''): void {
    if (!this.socket || this.closed) {
      return;
    }

    const reasonBuffer = Buffer.from(reason);
    const payload = Buffer.alloc(2 + reasonBuffer.length);
    payload.writeUInt16BE(code, 0);
    reasonBuffer.copy(payload, 2);
    this.socket.write(this.encodeFrame(payload, 0x8));
    this.socket.end();
    this.closed = true;
  }

  private handleData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (true) {
      const frame = this.tryReadFrame();
      if (!frame) {
        return;
      }

      if (frame.opcode === 0x1) {
        this.options.onMessage(frame.payload.toString());
        continue;
      }

      if (frame.opcode === 0x8) {
        const code = frame.payload.length >= 2 ? frame.payload.readUInt16BE(0) : undefined;
        const reason = frame.payload.length > 2 ? frame.payload.subarray(2).toString() : undefined;
        this.emitClose(code, reason);
        this.socket?.end();
        return;
      }

      if (frame.opcode === 0x9) {
        this.socket?.write(this.encodeFrame(frame.payload, 0xA));
      }
    }
  }

  private tryReadFrame(): { opcode: number; payload: Buffer } | null {
    if (this.buffer.length < 2) {
      return null;
    }

    const firstByte = this.buffer[0] ?? 0;
    const secondByte = this.buffer[1] ?? 0;
    const opcode = firstByte & 0x0f;
    const masked = (secondByte & 0x80) !== 0;
    let offset = 2;
    let payloadLength = secondByte & 0x7f;

    if (payloadLength === 126) {
      if (this.buffer.length < offset + 2) {
        return null;
      }
      payloadLength = this.buffer.readUInt16BE(offset);
      offset += 2;
    } else if (payloadLength === 127) {
      if (this.buffer.length < offset + 8) {
        return null;
      }
      const length = this.buffer.readBigUInt64BE(offset);
      if (length > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error('WebSocket frame too large.');
      }
      payloadLength = Number(length);
      offset += 8;
    }

    const maskLength = masked ? 4 : 0;
    const frameLength = offset + maskLength + payloadLength;
    if (this.buffer.length < frameLength) {
      return null;
    }

    let payload = this.buffer.subarray(offset + maskLength, frameLength);
    if (masked) {
      const mask = this.buffer.subarray(offset, offset + 4);
      const unmasked = Buffer.alloc(payload.length);
      for (let index = 0; index < payload.length; index += 1) {
        const payloadByte = payload[index] ?? 0;
        const maskByte = mask[index % 4] ?? 0;
        unmasked[index] = payloadByte ^ maskByte;
      }
      payload = unmasked;
    }

    this.buffer = this.buffer.subarray(frameLength);
    return { opcode, payload };
  }

  private encodeFrame(payload: Buffer, opcode: number): Buffer {
    const mask = crypto.randomBytes(4);
    const header = [0x80 | opcode];

    if (payload.length < 126) {
      header.push(0x80 | payload.length);
    } else if (payload.length < 65_536) {
      header.push(0x80 | 126, (payload.length >> 8) & 0xff, payload.length & 0xff);
    } else {
      const extended = Buffer.alloc(8);
      extended.writeBigUInt64BE(BigInt(payload.length), 0);
      header.push(0x80 | 127, ...extended);
    }

    const maskedPayload = Buffer.alloc(payload.length);
    for (let index = 0; index < payload.length; index += 1) {
      const payloadByte = payload[index] ?? 0;
      const maskByte = mask[index % 4] ?? 0;
      maskedPayload[index] = payloadByte ^ maskByte;
    }

    return Buffer.concat([Buffer.from(header), mask, maskedPayload]);
  }

  private emitClose(code?: number, reason?: string): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.options.onClose(code, reason);
  }
}
