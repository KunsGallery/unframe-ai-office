#!/usr/bin/env node
// members.json 하나로 웹 멤버 목록(web/members.js)과 Firestore 보안 규칙(firestore.rules)을 만든다.
// 멤버를 추가/삭제하면: members.json 수정 → node scripts/build.js → 규칙을 Firebase에 다시 게시 → Netlify 재배포
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
// 웹페이지(공개)에는 이메일 대신 해시만 넣는다. 이메일은 비공개인 보안 규칙에만 들어간다.
const emailHash = e => crypto.createHash('sha256').update('claude-office:' + e).digest('hex');

const ROOT = path.join(__dirname, '..');
const members = JSON.parse(fs.readFileSync(path.join(ROOT, 'members.json'), 'utf8'))
  .map(m => ({ ...m, email: String(m.email).trim().toLowerCase() }));

for (const m of members) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m.email)) throw new Error('이메일 형식이 이상해요: ' + m.email);
  if (!/^[a-z0-9-]+$/.test(m.id || '')) throw new Error(`${m.name}의 id는 영문 소문자/숫자/-만 쓸 수 있어요: ${m.id}`);
  if (/_gmail@|paste|example/i.test(m.email)) console.warn(`⚠️  ${m.name}님의 이메일이 아직 예시값이에요: ${m.email}  (members.json을 고쳐주세요)`);
}

fs.writeFileSync(path.join(ROOT, 'web', 'members.js'),
  '// scripts/build.js가 members.json으로 만든 파일입니다. 직접 고치지 마세요.\n' +
  'export const MEMBERS = ' + JSON.stringify(members.map(({ id, name, title, char, email }) => ({ id, name, title: title || '', char: char ?? 0, emailHash: emailHash(email) })), null, 2) + ';\n');

const map = members.map(m => `'${m.email}': '${m.id}'`).join(', ');
const rules = `rules_version = '2';
// scripts/build.js가 members.json으로 만든 규칙입니다. Firebase 콘솔 → Firestore → 규칙에 붙여넣고 게시하세요.
service cloud.firestore {
  match /databases/{database}/documents {
    // 이메일 → 멤버 id
    function members() { return {${map}}; }
    function isMember() {
      return request.auth != null
        && request.auth.token.email_verified == true
        && request.auth.token.email in members();
    }
    function myId() { return members()[request.auth.token.email]; }

    // Claude Code 세션 (각자 PC의 훅이 씀). 자기 세션만 쓸 수 있고, seq가 커지는 쓰기만 받는다.
    match /sessions/{sid} {
      allow read: if isMember();
      allow create: if isMember() && request.resource.data.owner == myId() && request.resource.data.seq is int;
      allow update: if isMember() && resource.data.owner == myId() && request.resource.data.owner == myId()
        && request.resource.data.seq is int && request.resource.data.seq > resource.data.seq;
      allow delete: if isMember() && resource.data.owner == myId();
    }

    // 채팅. 'all'은 전체방, 'dm__a__b'는 a·b 둘만 읽고 쓸 수 있다.
    match /chats/{chatId}/messages/{mid} {
      function inChat() { return chatId == 'all' || chatId.split('__').hasAny([myId()]); }
      allow read: if isMember() && inChat();
      allow create: if isMember() && inChat()
        && request.resource.data.keys().hasOnly(['from', 'text', 'at'])
        && request.resource.data.from == myId()
        && request.resource.data.text is string
        && request.resource.data.text.size() > 0 && request.resource.data.text.size() <= 2000
        && request.resource.data.at == request.time;
      allow delete: if isMember() && resource.data.from == myId();
    }

    // 📋 화이트보드. 누구나 추가·체크, 지우기는 쓴 사람이나 완료된 항목만.
    match /board/{bid} {
      allow read: if isMember();
      function okAssignee(d) { return !('assignee' in d) || d.assignee == null || d.assignee in members().values(); }
      function okDue(d) { return !('due' in d) || d.due == null || (d.due is string && d.due.matches('[0-9]{4}-[0-9]{2}-[0-9]{2}')); }
      allow create: if isMember()
        && request.resource.data.keys().hasOnly(['text', 'by', 'at', 'day', 'done', 'doneBy', 'doneDay', 'assignee', 'due'])
        && okAssignee(request.resource.data) && okDue(request.resource.data)
        && request.resource.data.by == myId()
        && request.resource.data.text is string
        && request.resource.data.text.size() > 0 && request.resource.data.text.size() <= 200
        && request.resource.data.done == false
        && request.resource.data.at == request.time;
      allow update: if isMember()
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['done', 'doneBy', 'doneDay', 'assignee', 'due'])
        && okAssignee(request.resource.data) && okDue(request.resource.data)
        && request.resource.data.done is bool
        && (!request.resource.data.diff(resource.data).affectedKeys().hasAny(['done', 'doneBy'])
            || request.resource.data.done == false || request.resource.data.doneBy == myId());
      allow delete: if isMember() && (resource.data.by == myId() || resource.data.done == true);
    }

    // 🙋 확인 요청. 보낸 사람과 받는 사람만 볼 수 있고, 답은 받는 사람만, 취소는 보낸 사람만.
    match /requests/{rid} {
      allow read: if isMember() && (resource.data.from == myId() || resource.data.to == myId());
      allow create: if isMember()
        && request.resource.data.keys().hasOnly(['from', 'to', 'text', 'project', 'status', 'at', 'day', 'link'])
        && (!('link' in request.resource.data) || request.resource.data.link == ''
            || (request.resource.data.link is string && request.resource.data.link.size() <= 500 && request.resource.data.link.matches('https?://.+')))
        && request.resource.data.from == myId()
        && request.resource.data.to in members().values()
        && request.resource.data.to != myId()
        && request.resource.data.status == 'open'
        && request.resource.data.text is string
        && request.resource.data.text.size() > 0 && request.resource.data.text.size() <= 500
        && request.resource.data.at == request.time;
      allow update: if isMember() && resource.data.status == 'open' && (
        (resource.data.to == myId()
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'reply', 'repliedAt'])
          && request.resource.data.status in ['ok', 'changes']
          && request.resource.data.repliedAt == request.time)
        || (resource.data.from == myId()
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status'])
          && request.resource.data.status == 'canceled'));
    }

    // 📓 업무일지 (각자 PC의 훅이 하루 한 문서를 갱신: '멤버id__날짜')
    match /journal/{jid} {
      allow read: if isMember();
      allow create: if isMember() && request.resource.data.owner == myId()
        && jid == myId() + '__' + request.resource.data.day && request.resource.data.seq is int;
      allow update: if isMember() && resource.data.owner == myId() && request.resource.data.owner == myId()
        && jid == myId() + '__' + request.resource.data.day
        && request.resource.data.seq is int && request.resource.data.seq > resource.data.seq;
    }

    // 🎨 꾸미기: 각자 자기 모습과 자기 Claude의 모습·이름만 바꿀 수 있다
    match /profiles/{pid} {
      function okLook(c, h) { return c is int && c >= 0 && c <= 5 && h is int && h >= 0 && h < 360; }
      allow read: if isMember();
      allow write: if isMember() && pid == myId()
        && request.resource.data.keys().hasOnly(['char', 'hue', 'claudeChar', 'claudeHue', 'claudeName', 'pet', 'petName'])
        && (!('pet' in request.resource.data) || request.resource.data.pet in ['dog', 'cat', 'rabbit', 'none'])
        && (!('petName' in request.resource.data) || (request.resource.data.petName is string && request.resource.data.petName.size() <= 12))
        && okLook(request.resource.data.char, request.resource.data.hue)
        && okLook(request.resource.data.claudeChar, request.resource.data.claudeHue)
        && request.resource.data.claudeName is string && request.resource.data.claudeName.size() <= 16;
    }

    // 📝 회의 메모 (날짜마다 한 문서, 멤버 누구나 고침)
    match /notes/{day} {
      allow read: if isMember();
      allow write: if isMember()
        && request.resource.data.keys().hasOnly(['text', 'by', 'at'])
        && request.resource.data.by == myId()
        && request.resource.data.text is string && request.resource.data.text.size() <= 5000
        && request.resource.data.at == request.time;
    }

    // 접속 표시 (페이지를 열어둔 동안 1분마다 갱신)
    match /presence/{pid} {
      allow read: if isMember();
      allow write: if isMember() && pid == myId()
        && request.resource.data.keys().hasOnly(['at', 'status', 'pos'])
        && (!('status' in request.resource.data) || request.resource.data.status in ['work', 'meeting', 'focus', 'break', 'out', 'off'])
        && (!('pos' in request.resource.data) || request.resource.data.pos == null
            || (request.resource.data.pos.keys().hasOnly(['c', 'r']) && request.resource.data.pos.c is int && request.resource.data.pos.r is int));
    }
  }
}
`;
fs.writeFileSync(path.join(ROOT, 'firestore.rules'), rules);

console.log(`✓ 멤버 ${members.length}명: ${members.map(m => m.name + (m.title ? ` (${m.title})` : '')).join(', ')}`);
console.log('✓ web/members.js, firestore.rules 생성');
if (fs.readFileSync(path.join(ROOT, 'web', 'firebase-config.js'), 'utf8').includes('PASTE_')) console.warn('⚠️  web/firebase-config.js에 Firebase 설정값을 아직 안 넣었어요. 지금은 데모 모드로만 열립니다.');
