#!/usr/bin/env node

const [type, ...messageParts] = process.argv.slice(2);
const message = messageParts.join(' ').trim();

if (!type || !message) {
  console.error('Usage: node examples/send-event.js <permission_required|task_completed|attention_required> <message>');
  process.exit(1);
}

const payload = {
  type,
  message,
  metadata: process.env.BELLSY_TOOL ? { tool: process.env.BELLSY_TOOL } : {},
};

const endpoint = process.env.BELLSY_URL ?? 'http://127.0.0.1:9001/event';

async function main() {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const body = await response.text();
  if (!response.ok) {
    console.error(body);
    process.exit(1);
  }

  process.stdout.write(`${body}\n`);
}

void main();
