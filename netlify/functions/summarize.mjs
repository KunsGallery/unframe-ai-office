// ✨ 업무일지 AI 요약 — 사무실 멤버만 호출할 수 있는 Netlify Function
// 필요한 환경변수 (Netlify → Site configuration → Environment variables): ANTHROPIC_API_KEY
import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { verifyIdToken } from '../lib/verify-token.mjs';
import { MEMBERS } from '../../web/members.js';
import { firebaseConfig } from '../../web/firebase-config.js';

// 저장소가 공개라서 이메일 대신 웹과 같은 해시로 멤버를 확인한다
const emailHash = email => crypto.createHash('sha256').update('claude-office:' + email).digest('hex');
const isMember = email => MEMBERS.some(m => m.emailHash === emailHash(email));

const MODEL = 'claude-opus-5-5';
const MAX_INPUT = 30000;

const SYSTEM = `당신은 작은 회사의 업무일지를 Director에게 보고하는 비서입니다.
<work_log> 안의 기록은 각 멤버의 Claude Code 활동(지시·완료 건수, 커밋 메시지, 수정 파일, 실행 명령, 조사 주제)과
팀의 화이트보드·확인 요청 내역입니다. 이 기록만 근거로 한국어 요약을 쓰세요.

형식:
1. 첫 줄: 오늘 하루를 한 문장으로 정리한 총평
2. 멤버별 2~3문장: 무엇을 진행했고 무엇을 끝냈는지. 커밋 메시지와 파일 이름에서 작업 내용을 읽어내되,
   기록에서 직접 확인되지 않는 추정은 "~로 보여요"처럼 추정임을 밝히세요.
3. "확인이 필요한 것" 항목: 남은 할 일, 마감 지난 일, 답을 기다리는 확인 요청이 있으면 짧은 목록으로. 없으면 생략.

숫자 나열보다 의미 위주로, 전체 600자 안팎으로 쓰세요. 기록에 없는 사실은 만들지 마세요.
마크다운 제목(#)이나 표는 쓰지 말고, 목록은 "• "로 시작하세요.`;

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

export default async req => {
  if (req.method !== 'POST') return json(405, { error: 'POST 요청만 받아요' });
  if (!process.env.ANTHROPIC_API_KEY) return json(500, { error: 'Netlify 환경변수 ANTHROPIC_API_KEY가 설정되지 않았어요' });

  // 1) 로그인한 사무실 멤버인지 확인
  const projectId = process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId;
  let user;
  try {
    user = await verifyIdToken((req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''), projectId);
  } catch (e) {
    return json(401, { error: '로그인 확인 실패: ' + e.message });
  }
  if (user.email_verified !== true || !isMember(String(user.email || '').toLowerCase())) {
    return json(403, { error: '사무실 멤버만 쓸 수 있어요' });
  }

  // 2) 입력 확인
  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return json(400, { error: '요약할 업무일지가 없어요' });
  if (text.length > MAX_INPUT) return json(413, { error: '업무일지가 너무 길어요' });

  // 3) Claude에게 요약 요청 (안전 필터가 거절하면 서버가 다른 모델로 자동 재시도하는 fallback 사용)
  const client = new Anthropic();
  try {
    const msg = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },  // 요약은 단순한 작업이라 빠르고 저렴한 설정
      system: SYSTEM,
      messages: [{ role: 'user', content: `<work_log>\n${text}\n</work_log>\n\n위 업무일지를 요약해 주세요.` }],
    });
    if (msg.stop_reason === 'refusal') return json(422, { error: 'Claude가 이 내용을 요약하지 않았어요' });
    const summary = msg.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
    if (!summary) return json(502, { error: '요약 결과가 비어 있어요' });
    return json(200, { summary, model: msg.model });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return json(500, { error: 'Anthropic API 키가 올바르지 않아요' });
    if (e instanceof Anthropic.RateLimitError) return json(429, { error: '요청이 많아요. 잠시 후 다시 시도해 주세요' });
    if (e instanceof Anthropic.APIConnectionError) return json(502, { error: 'Claude API에 연결하지 못했어요' });
    if (e instanceof Anthropic.APIError) return json(502, { error: `Claude API 오류 (${e.status})` });
    return json(500, { error: '요약 중 오류가 났어요' });
  }
};
