const esbuild = require('esbuild');
const fs = require('fs/promises');

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: false,
  logLevel: 'info',
};

async function main() {
  await Promise.all([
    esbuild.build({
      ...shared,
      entryPoints: ['src/extension.ts'],
      outfile: 'out/extension.js',
      external: ['vscode', 'node-notifier'],
    }),
    esbuild.build({
      ...shared,
      entryPoints: ['src/cli/bellsy-run.ts'],
      outfile: 'out/cli/bellsy-run.js',
    }),
  ]);

  await fs.chmod('out/cli/bellsy-run.js', 0o755);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
