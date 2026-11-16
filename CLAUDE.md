# Claude Office (unframe-ai-office)

재우님·박소연(Director) 2인 회사의 사내 웹앱 **Unframe Log**: 습관 기록·성취(첫 화면) + 예전 Claude Office(각자 Claude Code 세션을 픽셀 사무실로 실시간 표시, 채팅·화이트보드·확인 요청·업무일지·AI 요약)는 함께/오피스 탭. 설계는 `docs/unframe-log-v1.md`.

## 배포
- GitHub `KunsGallery/unframe-ai-office` **main에 푸시 → Netlify `unframe-office` 자동 배포** (https://unframe-office.netlify.app). 빌드 단계 없음, `web/`가 사이트, `netlify/functions/`가 함수.
- Firebase 프로젝트 `unframe-ai-office` (Firestore 서울, Google 로그인). 규칙 게시: `npx firebase-tools deploy --only firestore:rules --project unframe-ai-office` (이 PC의 Firebase CLI는 재우님 계정으로 로그인됨).
- Netlify 환경변수 `ANTHROPIC_API_KEY`(시크릿) 설정됨 → `netlify/functions/summarize.mjs`가 Claude Opus 5.5로 업무일지 요약.

## 꼭 지킬 것
- **저장소가 공개.** 멤버 이메일이 든 `members.json`, `firestore.rules`는 .gitignore — 절대 커밋 금지. 커밋 전 `git grep --cached -l -F -f <(node -e 'require("./members.json").forEach(m=>console.log(m.email))')` 결과가 비어 있는지 확인.
- 멤버/규칙 변경: `members.json` 수정 → `node scripts/build.js` (web/members.js + firestore.rules 생성) → 규칙 게시 → 커밋·푸시.
- 공개 코드에서는 이메일 대신 `sha256('claude-office:' + email)` 해시로 멤버 확인 (web/app.js, summarize.mjs).
- Firebase 웹 API 키는 공개용 값(GitHub 시크릿 경고는 false positive). 키를 웹사이트로 제한해도 되도록 훅이 Referer로 사이트 주소를 보냄.

## 구조
- `web/office.js` 사무실 렌더러(Pixel Agents 스프라이트, MIT — `web/assets/LICENSE-pixel-agents.txt`). 배치는 `FURNITURE` 목록.
- `web/app.js` 로그인·Firestore·탭 전환(#today/#log/#achieve/#together/#office)·채팅·화이트보드·확인 요청·업무일지·꾸미기·알림·PWA. `?demo`로 가짜 데이터 데모(습관 200일치 포함).
- `web/log/` Unframe Log 화면: `model.js`(통계·업적·계산기 순수 함수), `store.js`(Firestore/데모 저장소), `charts.js`(SVG), `ui.js`(오늘·내 기록·성취·축하·습관 만들기), `report.js`(리포트·PNG 저장), `log.css`. 서체 Oswald(Google Fonts)+Pretendard(jsDelivr).
- `web/hook/` 각자 PC에 설치되는 Claude Code 훅 (`office-state.js`는 훅과 데모가 공유하는 상태 로직). 훅을 바꾸면 각자 "내 PC 연결" 재실행 필요.
- Firestore 컬렉션: sessions, chats/{id}/messages, board, requests, journal, presence(상태·위치 pos), profiles(생김새·펫·seenAchievements — 저장은 merge), notes(회의 메모), trackers(습관), logs(`멤버__습관__날짜` 하루 합산, private는 습관 값 복사).
- 토끼 펫은 `office.js`의 `makeRabbitSheet()`가 코드로 그린 픽셀 그림 (다른 펫은 Pixel Agents PNG).
- 미리보기 서버는 이 폴더에서 `node scripts/dev.js`로 직접 띄울 것 (브라우저 미리보기 도구가 옛 임시 폴더에서 띄운 적 있음).
- 미리보기: `node scripts/dev.js` → http://localhost:4545

## 참고
- 사용 설명서(Claude Docs): https://claude.ai/artifact/UJnPQC6QJ3fRpQDQq8ZCFJ — 이름표 방식(🤖 ○○의 Claude)·꾸미기 설명은 아직 반영 전.
- 예전 React 앱 폴더는 휴지통 `unframe-ai-office-이전버전-2026-10-21`에 있음 (미푸시 커밋 4개: 맥 앱·오버레이 등, .env 포함).
