const fs = require('fs');

const assets = [
  ['manifest.json', 'dist/manifest.json'],
  ['src/sidebar/sidebar.html', 'dist/sidebar.html'],
  ['src/offscreen/offscreen.html', 'dist/offscreen.html'],
  ['src/options/options.html', 'dist/options.html'],
];

for (const [src, dest] of assets) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied: ${src} -> ${dest}`);
  } else {
    console.warn(`Warning: ${src} not found`);
  }
}
