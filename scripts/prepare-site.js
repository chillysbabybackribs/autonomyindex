const { spawnSync } = require('node:child_process');

function run(scriptPath) {
  const result = spawnSync(process.execPath, [scriptPath], {
    stdio: 'inherit',
    env: process.env
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function main() {
  run('scripts/build-weekly-brief-pages.js');
  run('scripts/generate-sitemap.js');
  run('scripts/inject-ga.js');
}

main();
