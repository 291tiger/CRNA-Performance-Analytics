import * as fs from 'fs';

const required = [
  'README.md',
  'START-HERE.md',
  'public/manifest.json',
  'src/widgets/index.tsx',
  'src/widgets/analytics.tsx',
  'src/widgets/analytics-engine.ts',
  'src/widgets/widget-utils.ts',
  'src/widgets/sidebar-button.tsx',
  'src/widgets/queue-toolbar-button.tsx',
  'src/widgets/flashcard-analytics-button.tsx',
];
const missing = required.filter((path) => !fs.existsSync(path));
if (missing.length) {
  console.error(`Missing required project files: ${missing.join(', ')}`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync('public/manifest.json', 'utf8'));
if (!manifest.id || !manifest.name || manifest.manifestVersion !== 1) {
  console.error('public/manifest.json is missing required RemNote plugin metadata.');
  process.exit(1);
}
if (manifest.version?.major !== 2) {
  console.error('public/manifest.json was not updated to major version 2.');
  process.exit(1);
}
console.log('Project validation passed.');
