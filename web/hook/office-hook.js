#!/usr/bin/env node
// Claude Code 훅 → Firestore.
// 1) 표준입력으로 받은 이벤트로 이 PC의 세션 상태를 갱신하고 (빠름, 로컬 파일)
// 2) 실제 전송은 분리된 백그라운드 프로세스가 한다 → Claude Code는 절대 기다리지 않는다.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { applyEvent, applyJournal } = require('./office-state.js');

const DIR = path.join(os.homedir(), '.claude-office');
const STATE_DIR = path.join(DIR, 'state');
const OUTBOX = path.join(DIR, 'outbox');
const CONFIG = path.join(DIR, 'config.json');
const TOKEN_CACHE = path.join(DIR, 'id-token.json');

function readJSON(f, fallback) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fallback; } }
function safeName(s) { return String(s).replace(/[^\w.-]/g, '_'); }

// 같은 세션의 이벤트가 동시에 들어와도 상태 파일이 꼬이지 않도록 아주 짧은 잠금
function withLock(name, fn) {
  const lock = path.join(STATE_DIR, name + '.lock');
  for (let i = 0; i < 200; i++) {
    try { fs.mkdirSync(lock); break; } catch {
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 3000) fs.rmdirSync(lock); } catch {}
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
    }
  }
  try { return fn(); } finally { try { fs.rmdirSync(lock); } catch {} }
}

function main(input) {
  const config = readJSON(CONFIG, null);
  if (!config) return;
  let ev; try { ev = JSON.parse(input); } catch { return; }
  if (!ev || !ev.session_id) return;
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.mkdirSync(OUTBOX, { recursive: true });

  const name = safeName(ev.session_id);
  const file = path.join(STATE_DIR, name + '.json');
  const opts = { showDetails: config.showDetails !== false, journalPrompts: config.journalPrompts === true };
  const jobs = [];
  withLock(name, () => {
    const prev = readJSON(file, null);
    const { session, write, deleted } = applyEvent(prev, ev, opts);
    if (deleted) { try { fs.unlinkSync(file); } catch {} }
    else fs.writeFileSync(file, JSON.stringify(session));
    if (write) jobs.push(deleted ? { op: 'delete', coll: 'sessions', id: session.id } : { op: 'set', coll: 'sessions', id: session.id, data: session });
  });
  // 업무일지: 이 PC에 계속 쌓고, 작업 완료 때·10분마다만 올린다
  withLock('journal', () => {
    const jf = path.join(DIR, 'journal.json');
    const { journal, flush } = applyJournal(readJSON(jf, null), ev, opts);
    fs.writeFileSync(jf, JSON.stringify(journal));
    if (flush && config.memberId) jobs.push({ op: 'set', coll: 'journal', id: `${config.memberId}__${journal.day}`, data: journal });
  });
  if (!jobs.length) return;

  const jobFile = path.join(OUTBOX, `${Date.now()}-${process.pid}.json`);
  fs.writeFileSync(jobFile, JSON.stringify(jobs));
  spawn(process.execPath, [__filename, '--send', jobFile], { detached: true, stdio: 'ignore' }).unref();

  // 가끔 오래된 상태 파일 청소 (이틀 지난 것)
  if (Math.random() < 0.02) {
    for (const f of fs.readdirSync(STATE_DIR)) {
      try { if (Date.now() - fs.statSync(path.join(STATE_DIR, f)).mtimeMs > 2 * 86400_000) fs.rmSync(path.join(STATE_DIR, f), { recursive: true }); } catch {}
    }
  }
}

// ---------------- 전송 (백그라운드) ----------------
function encode(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)])) } };
}

async function idToken(config) {
  const cached = readJSON(TOKEN_CACHE, null);
  if (cached && cached.exp > Date.now() + 60_000 && cached.rt === config.refreshToken.slice(-12)) return cached;
  const base = process.env.OFFICE_TOKEN_URL || 'https://securetoken.googleapis.com/v1/token';
  const res = await fetch(`${base}?key=${encodeURIComponent(config.apiKey)}`, {
    method: 'POST',
    // API 키를 사이트 주소로 제한해 둔 경우를 위해 사이트 주소를 Referer로 보낸다
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(config.site ? { Referer: config.site + '/' } : {}) },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: config.refreshToken }),
  });
  if (!res.ok) throw new Error('token ' + res.status);
  const j = await res.json();
  const tok = { token: j.id_token, exp: Date.now() + Number(j.expires_in || 3600) * 1000, rt: config.refreshToken.slice(-12) };
  fs.writeFileSync(TOKEN_CACHE, JSON.stringify(tok), { mode: 0o600 });
  return tok;
}

async function send(jobFile) {
  const config = readJSON(CONFIG, null);
  const jobs = readJSON(jobFile, null);
  try { fs.unlinkSync(jobFile); } catch {}
  if (!config || !Array.isArray(jobs)) return;
  const tok = await idToken(config);
  const base = process.env.OFFICE_FIRESTORE_URL || 'https://firestore.googleapis.com/v1';
  const headers = { Authorization: 'Bearer ' + tok.token, 'Content-Type': 'application/json' };
  for (const job of jobs) {
    const url = `${base}/projects/${config.projectId}/databases/(default)/documents/${job.coll}/${encodeURIComponent(job.id)}`;
    if (job.op === 'delete') { await fetch(url, { method: 'DELETE', headers }); continue; }
    const data = { ...job.data, owner: config.memberId };
    // seq가 더 작은(늦게 도착한 옛날) 쓰기는 보안 규칙이 거절한다 → 순서가 뒤바뀌어도 최신 상태가 남는다
    await fetch(url, { method: 'PATCH', headers, body: JSON.stringify({ fields: encode(data).mapValue.fields }) });
  }
}

if (process.argv[2] === '--send') {
  send(process.argv[3]).catch(() => {});
} else {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', c => { input += c; });
  process.stdin.on('end', () => { try { main(input); } catch {} process.exit(0); });
}
