import { mkdir, cp, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
execFileSync(process.execPath, ['build-dialogues.mjs'], { stdio: 'inherit' });
for (const script of ['custom-library.js', 'library-ui.js', 'speech-review.js', 'mode-copy.js', 'mobile.js', 'dialogues.js', 'build-dialogues.mjs', 'speech-bridge.mjs', 'press-to-talk.js', 'pcm-capture.js', 'system-speech.js', 'launch.mjs', 'game-ui.js', 'vocabulary.js', 'engine.js', 'save.js', 'sound.js', 'game.js', 'adventure.js', 'duel.cjs', 'lan-server.mjs', 'duel-client.js']) execFileSync(process.execPath, ['--check', script], { stdio: 'inherit' });
await mkdir('dist', { recursive: true });
for (const file of ['library.css', 'custom-library.js', 'library-ui.js', 'speech-review.js', 'mode-copy.js', 'mobile.js', 'mobile.css', 'index.html', 'dialogues.js', 'dialogue-guide.html', 'press-to-talk.js', 'pcm-capture.js', 'system-speech.js', 'immersive.css', 'game-ui.js', 'vocabulary.js', 'vocabulary-guide.html', 'licenses', 'styles.css', 'engine.js', 'save.js', 'sound.js', 'game.js', 'adventure.html', 'adventure.css', 'adventure.js', 'duel.html', 'duel.css', 'duel-client.js', 'assets']) {
  await cp(file, `dist/${file}`, { recursive: true });
}
const html = await readFile('dist/index.html', 'utf8');
if (!html.includes('id="startButton"') || !html.includes('lang="zh-CN"')) throw new Error('Missing game entry point');
console.log('Built Gulu Arcade into dist/');
