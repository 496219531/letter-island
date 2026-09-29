# Letter Island on the shared ECS

## 固定部署入口

后续部署使用仓库脚本，不再临时拼装 SSH、备份和上传命令。无第三方 Python 运行依赖；本机需要 Python 3、Node/npm、SSH，手机构建还需要 Xcode 和可用签名。

```bash
python3 scripts/deploy.py web                 # 测试、构建并部署网页及后端
python3 scripts/deploy.py iphone              # 测试、构建并原位更新 iPhone
python3 scripts/deploy.py all                 # 两端先准备完成，再依次发布网页、安装手机
python3 scripts/deploy.py all --prepare-only  # 仅测试、构建和打包，不上传、不安装
python3 scripts/deploy.py status              # 只读检查线上服务和设备状态
```

脚本使用当前工作区，包括未提交修改，不自动提交或清理 Git。网页发布前备份数据库与 Nginx 配置，验证完整性和文件哈希，失败回退代码且不回滚数据。脚本会从模板增量补齐8条精确OCR代理路由，保留其他配置；已有OCR配置不一致时停止，其他新增路由仍需按本文件的备份流程处理。远端上传包只允许部署清单中的普通文件，拒绝符号链接、路径穿越和敏感文件类型。部署锁避免脚本同时运行。

`--device ID` 可指定已明确选择的手机，默认是 iPhone 13 (hankk)。构建号自动高于源码和设备现有版本，可用 `--build-number N` 指定更大的值；部署构建使用独立 plist，不修改源码版本号。安装后通过设备应用列表确认版本；锁屏仅影响自动打开，不代表安装失败。

每次运行生成 `output/deploy/<运行号>/result.json` 及各阶段日志。`all` 模式如网页成功而手机失败，回执会分别记录；重试手机时运行 `iphone`，无需重复发布网页。SSH 断线时先运行 `status` 并核对远端备份目录中的 `deployment.json`，不要盲目重复发布。

个人 skill：`/Users/hkk/.codex/skills/letter-island-deploy/SKILL.md`。使用 `$letter-island-deploy` 或直接提出本项目的部署请求即可调用上述脚本。

脚本回归测试：`python3 -m unittest discover -s tests -p test_deploy.py`。2026-09-21 已完成网页/iPhone 全流程 prepare-only、签名和嵌入资源校验、只读线上状态检查及故障回退测试；这些验证没有发布工作区的新功能，也没有更新手机。

Current user instruction: implement and validate changes locally first. Do not deploy to Aliyun until the user explicitly says when to deploy. Completing a local change or build is not deployment authorization.

Latest authorized deployment: `20260920095331` (2026-09-20), explicitly authorized by “部署” after local public-library implementation and validation. Adds persistent public resources, owner-only publish/withdraw, anonymous browse/download, deduplicated download popularity, and public-bank duel selection with server-owned room snapshots. Nginx now allows the five exact `/api/library/public/{publish,list,detail,download,remove}` routes with a 2 MB body limit. Backup: `/opt/chuo-yixia/backups/letter-island-20260920095331-retry`; previous release: `20260919123725`. Initial activation was automatically rolled back when the immediate post-reload probe still received the old Nginx 403; reactivation with a bounded route-readiness check succeeded. SQLite backup and live integrity, all release-file hashes, four health endpoints, external public asset hashes and all five public-route status checks passed. Existing records were preserved; public schema additions are additive. Website/backend deployed; no native App installation performed.

Previous authorized deployment: `20260917221341` (2026-09-17), explicitly authorized for website publication and phone installation. Backup: `/opt/chuo-yixia/backups/letter-island-20260917221341`; previous release: `20260917183217`. SQLite backup integrity, Nginx validation, all four health endpoints, and public-file SHA-256 comparisons passed. Includes read-only standard vocabulary browsing, separate English/Chinese library playback, and the speaking example button next to skip. iPhone 13 (hankk) received App 1.0 build 60 by in-place installation. Full npm tests and iOS build passed.

Previous authorized deployment: `20260917222709` (2026-09-17), explicitly authorized to synchronize the website with App build 62: one speaker per library entry reads English then Chinese, skips empty fields, and explanation panels use white backgrounds with black text. Backup: `/opt/chuo-yixia/backups/letter-island-20260917222709`; previous release: `20260917221341`. SQLite backup integrity, Nginx validation, four health endpoints, and public asset hashes passed.

Previous authorized deployment: `20260919110438` (2026-09-19), explicitly authorized to publish all completed website changes. Includes cached upgrade decorations in eco mode, a new-skill offer after four consecutive misses (counter saved), Mandarin-only Chinese voice selection, a bounded speech queue, Safari 17-and-earlier desktop 30 FPS compatibility, and natural-sentence splitting for library recognition. Backup: `/opt/chuo-yixia/backups/letter-island-20260919110438`; previous release: `20260917222709`. SQLite backup integrity, Nginx validation, four health endpoints, and public key-asset hashes passed. Safari 17.6 whole-browser crash root cause remains unconfirmed; compatibility and queue changes are mitigations, not a verified old-system crash cure.

Previous authorized deployment: `20260919115638` (2026-09-19), explicitly authorized for the latest website update. Includes phone-style desktop home controls with translucent green backgrounds, double clone bullet damage, freezeStrength cards (+5 percentage points of slowing per stack, capped at 80%), and laserPower cards (+25% laser damage per stack, multiplied by magicPower). Backup: `/opt/chuo-yixia/backups/letter-island-20260919115638`; previous release: `20260919110438`. Full npm tests/build, SQLite backup integrity, Nginx validation, all four health endpoints, and public asset hashes passed. iPhone installed build remains unchanged.

Previous authorized deployment: `20260919123725` (2026-09-19), explicitly authorized for website and iPhone rollout. Includes wave-scaled skill damage, seven skill-specific upgrade types with equipment/cap gating, persisted upgraded effects, and capped clone projectile rendering with preserved aggregate damage. Backup: `/opt/chuo-yixia/backups/letter-island-20260919123725`; previous release: `20260919115638`. Full npm tests, one simulated hour of memory checks, web/iOS builds, SQLite backup integrity, Nginx validation, four health endpoints and public asset hashes passed. iPhone 13 (hankk) installed build 65.

Latest backend-only update: `20260915165722` (2026-09-15), required for the user's phone-only update. Backup: `/opt/chuo-yixia/backups/letter-api-20260915165722`. Only `library-service.mjs` and the organizer's accepted kind enum in `lan-server.mjs` changed. The entire `dist/` website remains the preceding release's files. SQLite backup, four health endpoints and a real Qwen mixed word/phrase/sentence classification passed. Client payload `kind: auto` now receives per-entry word/phrase/sentence categories; older word/sentence clients remain supported.

Previous authorized deployment: `20260914190954` (2026-09-14), explicitly authorized for performance rollout and phone installation. Backup: `/opt/chuo-yixia/backups/letter-island-20260914190954`; previous release: `20260914181015`. SQLite backup integrity and four health endpoints passed. Changes: App migrates once to eco (30 FPS, still user-selectable thereafter); stable HUD text/health markup; scene-orientation observers limited to body state and dialog lifecycle; bounding-box rejection and squared-distance swept bullet collisions; bounded native AVAudioPlayer reuse with skill priority. Simulation rules, damage and scoring preserved. Future changes stay local until separately authorized.

Cloud organizer: key only in root-owned mode-0600 `/etc/letter-island/qwen.env`, loaded via `/etc/systemd/system/letter-island.service.d/qwen.conf`. Never print either the key file or service environment. Artifact scanning confirmed the platform key is absent from website/App bundles. Only the exact `/api/library/organize` route is enabled (12 MB Nginx limit, 135s timeout); legacy library routes stay denied. Login is mandatory; provider URL/model are fixed and errors sanitized. Persistent `ai_usage` quotas by China date: account 5/day, IP 20/day, global 100/day. Concurrent requests: global 2, account 1. Upload parsing: 20s. Attempts reaching the provider consume quota even on failure. New quota table is additive; database is never replaced.

Public site remains HTTP. Secret transfer uses SSH and provider calls use HTTPS, but client login-session transport still needs a verified HTTPS origin. Do not claim complete protection against session interception or all abuse.

The voice workshop (`zombie-recorder.html`) stores custom clips only on the current device/browser. Direct browser recording requires microphone support in a secure context; the public HTTP endpoint and native custom scheme can use audio-file import as a fallback. Native account calls use the fixed community endpoint through URLSession and its persistent cookie store.

The game is a separate systemd service and Linux user. Nginx routes `/letter-island/` to its loopback port 4174. The existing chuo-yixia root and backend route remain unchanged.

Runtime: pinned Node 22.22.0 under `/opt/letter-island/node`; source releases under `/opt/letter-island/releases`, symlink `/opt/letter-island/current`.

## Accounts, rankings, and traffic

Web rendering defaults to the low-resource profile (`performance.js`): a 30 FPS paint cap, device-pixel ratio capped at 1, 72 cosmetic particles, 12 cached walking poses, and no heavy Canvas filters, glow, decorative upgrade scenery, or backdrop blur. Standard mode restores the 60 FPS / DPR 2 profile. The choice is available in settings and persisted per browser. Simulation uses fixed 1/60-second steps independently of painting, with bounded catch-up after slow frames. Neither quality mode periodically saves game snapshots. Only manual save, pause, wave completion/upgrade selection, and return-home actions save the run. Start, resume, setting changes, and ranking responses do not serialize the game. Ranking responses retain only a small bounded ticket cache so pausing before a ticket arrives remains recoverable.

- The website uses a nickname, an HttpOnly login cookie (90 days), and a recovery code displayed once for use on other devices. Only hashes of session and recovery secrets are stored. Do not print recovery codes or cookies in deployment logs.
- Persistent SQLite state lives at `/var/lib/letter-island/community.sqlite`, outside release directories. `DATA_DIR`, `StateDirectory`, and `ReadWritePaths` in the service unit are required. Before deployment, use SQLite's backup API and verify `PRAGMA integrity_check`; never replace this database with a local/test database or roll it back with application code.
- Deploy `community-store.mjs` alongside `lan-server.mjs`, `library-service.mjs`, `speech-bridge.mjs`, `duel.cjs`, `engine.js`, `vocabulary.js`, `dialogues.js`, `custom-library.js`, `package.json`, and `dist/`. Node's built-in `node:sqlite` is required and available in the pinned runtime.
- Solo rankings keep each account's best score per mode and level. Login must precede a new standard-bank game; game state is local, only start and finish requests are sent. Tickets bind the score to an account/category, are idempotent, and apply basic bounds. This is a casual, client-calculated score board, not authoritative anti-cheat replay verification. Resumed eligible saves retain their ticket; failed uploads can be retried manually.
- Solo total score now includes kill points plus completed-practice points. A successful completed skill earns `alphabetic characters × 2 × (issued prompt level + 1) × actual completed repetitions`. Prompt level is captured when a prompt is issued, so a late difficulty change cannot multiply an old prompt or the entire run. Partial/wrong input, backspace cycling, and empty-field attempts earn no practice points. Practice totals and prompt metadata survive saves. Historical scores are retained, with no retroactive multiplication. Duel ranking points still come from server-settled wins/draws.
- Duel results are computed by the server, once per round. Two distinct signed-in accounts and at least 30 seconds of active play are required. Wins earn 3 points, draws 1, losses 0. At most 3 matches per opponent pair per China calendar day count. Leaving or timing out forfeits an eligible match. Guest games remain available but do not rank.
- No leaderboard polling or account heartbeat runs on idle/single-player pages. Opening/refreshing the panel fetches data. Waiting-room heartbeats are 15 seconds; active matches keep their 2-second heartbeat. No room simulation timer runs when there are no rooms.
- Text assets use gzip and ETag/304 revalidation. Build-generated content-versioned PNG URLs use immutable caching; images get a new URL when their content changes. Dynamic/account responses remain `no-store`.
- Nginx must overwrite `X-Real-IP` in the Letter Island location so account rate limits use the real remote address rather than the proxy address. Never trust a client-provided forwarded address from non-loopback connections.

Build with `npm test && npm run build`. Deploy the built `dist` directory together with the Node server and its source dependencies, not the iOS application or credentials. `dist/mobile-app.js` is generated from the App's existing layout, without the native bridge. Phones get that layout automatically; desktop browsers retain the desktop UI. The mobile browser game uses a persisted page orientation (landscape by default), independent of browser orientation-lock support. Native audio stays in the App.

Current endpoint: `http://101.132.227.80/letter-island/`. HTTPS needs a separately verified hostname and certificate. Microphone access, browser speech recognition, and WeChat autoplay/orientation capabilities vary by browser; unsupported speech is disabled on both desktop and phone. Mac speech and legacy library routes are blocked; the authenticated cloud organizer is enabled, and the remote browser image-import controls explain that restriction before a file is selected. Room state is in memory and restarts clear rooms. Saves stay in each browser's local storage.

Phones expose “横屏游玩” on the home screen and screen-direction/layout options in the in-game settings. The page rotates its game surface when the physical browser viewport does not match the selected orientation; it does not call fullscreen/orientation-lock APIs. Canvas aiming, top-layer dialogs, safe-area padding, and keyboard layout use the same effective direction. Native builds keep their OS orientation controls. Sidebar and split-thumb landscape layouts share the App layout source. Portrait play uses the available battlefield height, proportion-preserving character art, a compact word prompt, and a four-row keyboard with backspace. Settings also expose save/restore, upgrades, and help. These shared source changes do not update an already-installed iOS binary; that requires a separate native build and installation.

Before changing the Nginx site or updating a release, save the old configuration and previous release target under `/opt/chuo-yixia/backups`. Run `nginx -t` before reload. Verify all four endpoints after activation or rollback:

- `http://127.0.0.1:4174/api/health`
- `http://101.132.227.80/letter-island/api/health`
- `http://127.0.0.1:8787/api/health`
- `http://101.132.227.80/backend/api/health`

For rollback restore the backed-up Nginx site and old `current` link, restart only `letter-island`, validate Nginx and reload. Never restore or modify the unrelated chuo-yixia database for a game deployment.

Battle notices are absolutely positioned inside `.battlefield`. Keep them out of arsenal flow and height measurement: showing/hiding a notice must not change battlefield or canvas dimensions. `web-layout.css` is appended to the generated phone stylesheet; it is not a separately served asset.

Latest native installation: 2026-09-20, iPhone 13 (hankk) updated in place to App 1.0 build 67 (`com.hankk.gulugarden`). Device app inventory verified bundle version 67. Includes public-library browsing/publishing/download and the online public-bank duel entry, with LAN entry retained. Build, signing, embedded resources and native/public-library tests passed. Automatic launch was denied because the phone was locked; on-device UI verification remains pending manual unlock/open.

Latest UI follow-up deployment: `20260920111319` (2026-09-20), continues the authorized website/iPhone rollout with the agreed library placement adjustment. Home now has a single 词句库 entry; 我的词句库 and 公共分享榜 are sibling tabs within one dialog, with fixed tab navigation and immediate local-list refresh after download. Public-bank duel selection is retained. Backup: `/opt/chuo-yixia/backups/letter-island-20260920111319`; previous release: `20260920095331`. SQLite backup integrity, Nginx validation, four health endpoints, public-list response and changed public-file hashes passed. Browser checks covered a 390px viewport, switching tabs and download-to-local; 18 targeted tests passed. iPhone 13 (hankk) updated in place and device inventory verified App 1.0 build 68. Code signing and embedded resources verified. Phone was locked, so automatic launch was denied; manual opening is needed.
