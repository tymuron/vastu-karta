// Copies the placeholder page into dist/ (Render publishes dist/).
import { mkdirSync, copyFileSync } from 'node:fs';
mkdirSync('dist', { recursive: true });
for (const f of ['index.html', '404.html', 'robots.txt']) copyFileSync(f, `dist/${f}`);
console.log('placeholder copied to dist/');
