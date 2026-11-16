# Claude Office (unframe-ai-office)

재우님·박소연(Director) 2인 회사의 사내 웹앱 **Unframe Log**: 습관 기록·성취(첫 화면) + 예전 Claude Office(각자 Claude Code 세션을 픽셀 사무실로 실시간 표시, 채팅·화이트보드·확인 요청·업무일지·AI 요약)는 함께/오피스 탭. 설계는 `docs/unframe-log-v1.md`, `docs/unframe-docs-v1.md`(문서·캘린더).

## 배포
- GitHub `KunsGallery/unframe-ai-office` **main에 푸시 → Netlify `unframe-office` 자동 배포** (https://unframe-office.netlify.app). 빌드 단계 없음, `web/`가 사이트, `netlify/functions/`가 함수.
- Firebase 프로젝트 `unframe-ai-office` (Firestore 서울, Google 로그인). 규칙 게시: `npx firebase-tools deploy --only firestore:rules --project unframe-ai-office` (이 PC의 Firebase CLI는 재우님 계정으로 로그인됨).
- Netlify 환경변수 `ANTHROPIC_API_KEY`(시크릿) 설정됨 → `netlify/functions/summarize.mjs`가 Claude Opus 5.5로 업무일지 요약.
- 🔔 웹 푸시: `netlify/functions/push.mjs`(Netlify 환경변수 `VAPID_PRIVATE_KEY` 필요, 공개 키는 `web/push-config.js`). 기기 구독은 Firestore `pushSubs`, 함수는 보내는 사람의 ID 토큰으로 Firestore REST를 읽음(서비스 계정 없음). 훅도 내 Claude 승인 대기·완료를 이 함수로 보냄. 서비스 워커 `web/sw.js`에 push/notificationclick.
- 🐾 펫 비서: Netlify 예약 함수 `pet-assistant.mjs`(10분마다, KST 기준 각자 시간 + 50분 창, `petNotes/{멤버}__{날짜}__{slot}` 먼저 만들어 중복 방지) + `pet-now.mjs`(지금 받아 보기). 서버는 Netlify 환경변수 `FIREBASE_SERVICE_ACCOUNT`(서비스 계정 JSON)로 Firestore REST를 읽음(`netlify/lib/gauth.mjs`), 글은 Claude Opus 5.5 effort low(`netlify/lib/pet.mjs`, 실패 시 정해진 문구). 💬 펫과 대화: `pet-chat.mjs`(앱이 보낸 내 자료로 답 + 기록·일정·할 일·기분 제안 → 화면에서 적용 눌러야 저장), 날씨는 Open-Meteo. 화면은 `web/log/pet.js`.

## 꼭 지킬 것
- **저장소가 공개.** 멤버 이메일이 든 `members.json`, `firestore.rules`는 .gitignore — 절대 커밋 금지. 커밋 전 `git grep --cached -l -F -f <(node -e 'require("./members.json").forEach(m=>console.log(m.email))')` 결과가 비어 있는지 확인.
- 멤버/규칙 변경: `members.json` 수정 → `node scripts/build.js` (web/members.js + firestore.rules 생성) → 규칙 게시 → 커밋·푸시.
- 공개 코드에서는 이메일 대신 `sha256('claude-office:' + email)` 해시로 멤버 확인 (web/app.js, summarize.mjs).
- Firebase 웹 API 키는 공개용 값(GitHub 시크릿 경고는 false positive). 키를 웹사이트로 제한해도 되도록 훅이 Referer로 사이트 주소를 보냄.

## 구조
- `web/office.js` 사무실 렌더러(Pixel Agents 스프라이트, MIT — `web/assets/LICENSE-pixel-agents.txt`). 배치는 `FURNITURE` 목록.
- `web/app.js` 로그인·Firestore·탭 전환(#today/#log/#achieve/#together/#office)·채팅·화이트보드·확인 요청·업무일지·꾸미기·알림·PWA. `?demo`로 가짜 데이터 데모(습관 200일치 포함).
- `web/log/` Unframe Log 화면: `model.js`(통계·업적·계산기 순수 함수), `store.js`(Firestore/데모 저장소), `charts.js`(SVG), `ui.js`(오늘·내 기록·성취·축하·습관 만들기), `report.js`(리포트·PNG 저장), `log.css`, `docs.js`(블록 편집기 — 문서 모델은 page.blocks 배열, 저장은 rev+1), `calendar.js`, `workstore.js`(pages·events 저장소+데모), `pet.js`(펫 카드·기분·펫 비서 설정·펫과 대화), `emoji.js`(data-emoji-picker 칸을 누르면 이모지 창). 서체 Oswald(Google Fonts)+Pretendard(jsDelivr). 탭: today·calendar·docs·log·achieve·together·office.
- `web/hook/` 각자 PC에 설치되는 Claude Code 훅 (`office-state.js`는 훅과 데모가 공유하는 상태 로직). 훅을 바꾸면 각자 "내 PC 연결" 재실행 필요.
- Firestore 컬렉션: sessions, chats/{id}/messages, board, requests, journal, presence(상태·위치 pos), profiles(생김새·펫·seenAchievements — 저장은 merge), pushSubs(기기별 웹 푸시 구독), moods(`멤버__날짜` 기분 score 1~5·note·lunch·shared), assistant(펫 비서 설정, 본인만), petNotes(펫이 보낸 말, 서버만 씀), notes(회의 메모), trackers(습관), logs(`멤버__습관__날짜` 하루 합산, private는 습관 값 복사), pages(문서, shared 기본 true, rev는 저장마다 정확히 +1), events(일정, shared).
- 토끼 펫은 `office.js`의 `makeRabbitSheet()`가 코드로 그린 픽셀 그림 (다른 펫은 Pixel Agents PNG).
- 미리보기 서버는 이 폴더에서 `node scripts/dev.js`로 직접 띄울 것 (브라우저 미리보기 도구가 옛 임시 폴더에서 띄운 적 있음).
- 미리보기: `node scripts/dev.js` → http://localhost:4545

## 참고
- 사용 설명서(Claude Docs): https://claude.ai/artifact/UJnPQC6QJ3fRpQDQq8ZCFJ — 이름표 방식(🤖 ○○의 Claude)·꾸미기 설명은 아직 반영 전.
- 예전 React 앱 폴더는 휴지통 `unframe-ai-office-이전버전-2026-10-21`에 있음 (미푸시 커밋 4개: 맥 앱·오버레이 등, .env 포함).
