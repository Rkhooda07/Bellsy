#!/usr/bin/env node

const https = require('node:https');

function readRequiredEnv(name) {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

function buildPayload() {
  return JSON.stringify({
    prompt: {
      text: readRequiredEnv('CURSOR_AGENT_PROMPT'),
    },
    source: {
      repository: readRequiredEnv('CURSOR_REPOSITORY_URL'),
      ref: process.env.CURSOR_REPOSITORY_REF?.trim() || 'main',
    },
    model: process.env.CURSOR_AGENT_MODEL?.trim() || 'claude-4-sonnet',
    target: {
      autoCreatePr: process.env.CURSOR_AUTO_CREATE_PR === 'true',
      ...(process.env.CURSOR_TARGET_BRANCH?.trim()
        ? { branchName: process.env.CURSOR_TARGET_BRANCH.trim() }
        : {}),
    },
    webhook: {
      url: readRequiredEnv('CURSOR_WEBHOOK_URL'),
      secret: readRequiredEnv('CURSOR_WEBHOOK_SECRET'),
    },
  });
}

function requestCursorApi(apiKey, payload) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        method: 'POST',
        hostname: 'api.cursor.com',
        path: '/v0/agents',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload).toString(),
        },
      },
      (response) => {
        let responseBody = '';

        response.on('data', (chunk) => {
          responseBody += chunk.toString();
        });

        response.on('end', () => {
          const statusCode = response.statusCode ?? 0;
          if (statusCode < 200 || statusCode >= 300) {
            reject(new Error(`Cursor API request failed with ${statusCode}: ${responseBody}`));
            return;
          }

          resolve(responseBody);
        });
      },
    );

    request.on('error', reject);
    request.write(payload);
    request.end();
  });
}

async function main() {
  try {
    const apiKey = readRequiredEnv('CURSOR_API_KEY');
    const payload = buildPayload();
    const responseBody = await requestCursorApi(apiKey, payload);
    const result = JSON.parse(responseBody);

    console.log('Agent created successfully.');
    console.log(`Agent ID: ${result.id}`);
    console.log(`Status: ${result.status}`);
    console.log(`Cursor URL: ${result.target?.url ?? 'n/a'}`);
    console.log(`Branch: ${result.target?.branchName ?? 'n/a'}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}

void main();
