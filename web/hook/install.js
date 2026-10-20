#!/usr/bin/env node
// 사용법: node install.js <연결 코드>      (연결 코드는 사무실 웹페이지의 "내 PC 연결"에서 복사)
//         node install.js --uninstall
// ~/.claude/settings.json 에 훅을 추가한다. 기존 설정은 백업 후 그대로 둔다. 다시 실행해도 중복되지 않는다.
const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const DIR = path.join(HOME, '.claude-office');
const HOOK = path.join(DIR, 'office-hook.js');
const SETTINGS = path.join(HOME, '.claude', 'settings.json');
const EVENTS = ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Notification', 'Stop', 'SubagentStart', 'SubagentStop', 'PreCompact'];
const TOOL_EVENTS = new Set(['PreToolUse', 'PostToolUse']);

const settings = fs.existsSync(SETTINGS) ? JSON.parse(fs.readFileSync(SETTINGS, 'utf8')) : {};
const isOurs = h => /\.claude-office[\\/]office-hook\.(js|sh)/.test(h.command || '');

function strip() {
  for (const ev of Object.keys(settings.hooks || {})) {
    settings.hooks[ev] = settings.hooks[ev]
      .map(g => ({ ...g, hooks: (g.hooks || []).filter(h => !isOurs(h)) }))
      .filter(g => g.hooks.length);
    if (!settings.hooks[ev].length) delete settings.hooks[ev];
  }
  if (settings.hooks && !Object.keys(settings.hooks).length) delete settings.hooks;
}
function save() {
  fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
  if (fs.existsSync(SETTINGS)) fs.copyFileSync(SETTINGS, SETTINGS + '.bak-office');
  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
}

if (process.argv[2] === '--uninstall') {
  strip(); save();
  try { fs.rmSync(path.join(DIR, 'config.json')); fs.rmSync(path.join(DIR, 'id-token.json'), { force: true }); } catch {}
  console.log('✓ Claude Office 연결을 해제했습니다.');
  process.exit(0);
}

let conf;
try { conf = JSON.parse(Buffer.from(process.argv[2] || '', 'base64url').toString('utf8')); } catch {}
if (!conf || !conf.k || !conf.p || !conf.r || !conf.i) {
  console.log('사용법: node install.js <연결 코드>\n연결 코드는 사무실 웹페이지 오른쪽 위 "🔌 내 PC 연결"에서 복사하세요.');
  process.exit(1);
}

fs.mkdirSync(DIR, { recursive: true });
// 저장소에서 바로 실행한 경우 옆의 훅 파일을 복사 (웹에서 받은 경우엔 이미 DIR 안에 있음)
for (const f of ['office-hook.js', 'office-state.js', 'install.js']) {
  const src = path.join(__dirname, f), dst = path.join(DIR, f);
  if (path.resolve(src) !== path.resolve(dst)) fs.copyFileSync(src, dst);
}
fs.writeFileSync(path.join(DIR, 'config.json'), JSON.stringify({ apiKey: conf.k, projectId: conf.p, refreshToken: conf.r, memberId: conf.i, site: conf.o || '', showDetails: true }, null, 2), { mode: 0o600 });
try { fs.rmSync(path.join(DIR, 'id-token.json'), { force: true }); } catch {}

const q = s => JSON.stringify(s); // 공백이 있는 경로도 안전하게
strip();
settings.hooks = settings.hooks || {};
for (const ev of EVENTS) {
  const group = { hooks: [{ type: 'command', command: `${q(process.execPath)} ${q(HOOK)}`, timeout: 5 }] };
  if (TOOL_EVENTS.has(ev)) group.matcher = '*';
  (settings.hooks[ev] = settings.hooks[ev] || []).push(group);
}
save();

console.log(`✓ 연결 완료 (${conf.e || conf.p})
  설정: ${SETTINGS} (백업: settings.json.bak-office)
  새로 여는 Claude Code 세션부터 사무실에 출근합니다.
  연결 해제: node ${q(path.join(DIR, 'install.js'))} --uninstall`);
