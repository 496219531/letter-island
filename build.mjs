import { mkdir, cp, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
for (const script of ['engine.js', 'game.js', 'adventure.js']) execFileSync(process.execPath, ['--check', script], { stdio: 'inherit' });
await mkdir('dist', { recursive: true });
for (const file of ['index.html', 'styles.css', 'engine.js', 'game.js', 'adventure.html', 'adventure.css', 'adventure.js', 'assets']) {
  await cp(file, `dist/${file}`, { recursive: true });
}
const html = await readFile('dist/index.html', 'utf8');
if (!html.includes('id="startButton"') || !html.includes('lang="zh-CN"')) throw new Error('Missing game entry point');
console.log('Built Gulu Arcade into dist/');
