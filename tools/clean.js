const fs = require('fs/promises');

async function main() {
  await fs.rm('out', { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
