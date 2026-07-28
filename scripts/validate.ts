import * as fs from 'fs';

const required = ['README.md', 'public/manifest.json', 'src/widgets/index.tsx', 'src/widgets/analytics.tsx'];
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
console.log('Project validation passed.');
