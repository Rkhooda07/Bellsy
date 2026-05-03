import * as http from 'http';
import * as https from 'https';

export type RelayRegistration = {
  installId: string;
  deviceToken: string;
  publicWebhookUrl: string;
  cursorWebhookSecret: string;
  relayWebSocketUrl: string;
};

type RequestOptions = {
  method: 'GET' | 'POST';
  url: string;
  headers?: Record<string, string>;
  body?: string;
};

export class RelayHttpClient {
  async register(baseUrl: string): Promise<RelayRegistration> {
    return this.requestJson<RelayRegistration>({
      method: 'POST',
      url: new URL('/v1/installs/register', baseUrl).toString(),
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });
  }

  async restore(baseUrl: string, installId: string, deviceToken: string): Promise<RelayRegistration> {
    return this.requestJson<RelayRegistration>({
      method: 'POST',
      url: new URL('/v1/installs/restore', baseUrl).toString(),
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ installId, deviceToken }),
    });
  }

  async rotateSecret(baseUrl: string, installId: string, deviceToken: string): Promise<RelayRegistration> {
    return this.requestJson<RelayRegistration>({
      method: 'POST',
      url: new URL(`/v1/installs/${encodeURIComponent(installId)}/rotate-secret`, baseUrl).toString(),
      headers: {
        authorization: `Bearer ${deviceToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });
  }

  async postSignedWebhook(publicWebhookUrl: string, payload: string, signature: string, deliveryId: string): Promise<void> {
    await this.requestJson({
      method: 'POST',
      url: publicWebhookUrl,
      headers: {
        'content-type': 'application/json',
        'x-webhook-event': 'statusChange',
        'x-webhook-id': deliveryId,
        'x-webhook-signature': signature,
        'user-agent': 'Bellsy-Relay-Test/1.0',
      },
      body: payload,
    });
  }

  private async requestJson<T = Record<string, unknown>>(options: RequestOptions): Promise<T> {
    const response = await this.request(options);
    const payload = response.body.length > 0 ? (JSON.parse(response.body) as T) : ({} as T);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      const message =
        typeof payload === 'object' && payload && 'error' in payload
          ? String((payload as { error: unknown }).error)
          : `Relay request failed with ${response.statusCode}`;
      throw new Error(message);
    }

    return payload;
  }

  private request(options: RequestOptions): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
      const url = new URL(options.url);
      const client = url.protocol === 'https:' ? https : http;
      const request = client.request(
        {
          method: options.method,
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port ? Number(url.port) : undefined,
          path: `${url.pathname}${url.search}`,
          headers: {
            ...(options.body ? { 'content-length': Buffer.byteLength(options.body).toString() } : {}),
            ...options.headers,
          },
        },
        (response) => {
          let responseBody = '';

          response.on('data', (chunk) => {
            responseBody += chunk.toString();
          });

          response.on('end', () => {
            resolve({
              statusCode: response.statusCode ?? 0,
              body: responseBody,
            });
          });
        },
      );

      request.on('error', reject);

      if (options.body) {
        request.write(options.body);
      }

      request.end();
    });
  }
}
