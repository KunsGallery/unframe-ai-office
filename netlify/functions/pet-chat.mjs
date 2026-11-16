// 🐾 펫과 대화 — 내 펫이 비서처럼 답하고, 필요하면 "할 일 제안"(기록·일정·할 일·기분)을 같이 돌려준다.
// 제안은 화면에서 사람이 "적용"을 눌러야 실제로 저장된다. 기록 자료(context)는 앱이 내 화면에 이미 있는 것만 보낸다.
// 필요한 환경변수: ANTHROPIC_API_KEY
import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { verifyIdToken } from '../lib/verify-token.mjs';
import { MEMBERS } from '../../web/members.js';
import { firebaseConfig } from '../../web/firebase-config.js';

const emailHash = email => crypto.createHash('sha256').update('claude-office:' + email).digest('hex');
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');

// 답 형식: 말 + 제안 목록 (구조화 출력으로 항상 이 모양)
const SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: '펫이 하는 말 (한국어, 1~4문장)' },
    actions: {
      type: 'array',
      description: '사용자가 명확히 말한 것만. 없으면 빈 배열',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['log', 'event', 'task', 'mood'] },
          tracker: { type: 'string', description: 'log: 습관 id (context.habits의 id). 그 외엔 빈 문자열' },
          amount: { type: 'number', description: 'log: 더할 양 (분/개수, 체크는 1). 그 외엔 0' },
          day: { type: 'string', description: 'YYYY-MM-DD. log·mood는 그날, event는 일정 날짜, task는 마감일(없으면 빈 문자열)' },
          time: { type: 'string', description: 'event: HH:MM 24시간 (모르면 빈 문자열). 그 외엔 빈 문자열' },
          title: { type: 'string', description: 'event: 일정 제목, task: 할 일 내용. 그 외엔 빈 문자열' },
          score: { type: 'integer', description: 'mood: 1(힘듦)~5(최고). 그 외엔 0' },
        },
        required: ['type', 'tracker', 'amount', 'day', 'time', 'title', 'score'],
        additionalProperties: false,
      },
    },
  },
  required: ['reply', 'actions'],
  additionalProperties: false,
};

// 🔮 내 패턴 찾기: 앱이 계산한 사실(요일별 기록률, 최근 30일 추세, 기분과 습관)에서 흥미로운 패턴을 고른다
const INS_SCHEMA = {
  type: 'object',
  properties: {
    insights: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          emoji: { type: 'string' },
          title: { type: 'string', description: '한 줄 요약 (25자 이내)' },
          detail: { type: 'string', description: '근거 숫자와 함께 1~2문장 + 작은 제안' },
        },
        required: ['emoji', 'title', 'detail'],
        additionalProperties: false,
      },
    },
  },
  required: ['insights'],
  additionalProperties: false,
};
async function insight(me, body) {
  const facts = JSON.stringify(body.facts || {}).slice(0, 16000);
  const pet = { name: str(body.pet && body.pet.name, 30) || '펫', ko: str(body.pet && body.pet.ko, 12) || '펫' };
  const client = new Anthropic();
  const msg = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: INS_SCHEMA } },
    system: `너는 ${me.name}님의 반려 ${pet.ko} "${pet.name}"이고, 기록을 읽어 주는 다정한 분석가야.
<facts>는 앱이 최근 90일 기록으로 계산한 숫자야. 여기서 ${me.name}님이 몰랐을 법한 패턴 3~5개를 골라.
- 예: 가장 잘 되는 요일/잘 끊기는 요일, 최근 30일과 그 전 30일 비교, 어떤 습관을 한 날 기분이 더 좋은지, 기분이 낮은 요일.
- 숫자는 facts에 있는 것만 그대로 쓰고 지어내지 마. 표본이 적으면(예: 기분 기록 5일 미만) 그 패턴은 쓰지 말거나 "아직 기록이 적지만"이라고 밝혀.
- 상관을 인과처럼 말하지 마("~한 날 기분이 좋았어요"는 되고 "~해서 좋아졌어요"는 안 돼).
- 각 패턴마다 작고 구체적인 제안 하나. 한국어, 다정하게, 펫 말투는 아주 살짝.`,
    messages: [{ role: 'user', content: `<facts>\n${facts}\n</facts>\n내 패턴을 찾아 줘.` }],
  }, { timeout: 25000 });
  if (msg.stop_reason === 'refusal') return { insights: [] };
  const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
  try { const j = JSON.parse(text); return { insights: (j.insights || []).slice(0, 5).map(x => ({ emoji: str(x.emoji, 8), title: str(x.title, 60), detail: str(x.detail, 300) })) }; }
  catch { return { insights: [] }; }
}

export default async req => {
  if (req.method !== 'POST') return json(405, { error: 'POST 요청만 받아요' });
  if (!process.env.ANTHROPIC_API_KEY) return json(500, { error: 'Netlify 환경변수 ANTHROPIC_API_KEY가 없어요' });
  let user;
  try { user = await verifyIdToken((req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''), process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId); }
  catch (e) { return json(401, { error: '로그인 확인 실패: ' + e.message }); }
  const me = user.email_verified === true && MEMBERS.find(m => m.emailHash === emailHash(String(user.email || '').toLowerCase()));
  if (!me) return json(403, { error: '멤버만 쓸 수 있어요' });

  const body = await req.json().catch(() => ({}));
  if (body.mode === 'insight') {
    try { return json(200, await insight(me, body)); }
    catch (e) { return json(e instanceof Anthropic.RateLimitError ? 429 : 502, { error: e instanceof Anthropic.APIError ? `Claude API 오류 (${e.status})` : '패턴을 찾는 중 오류가 났어요' }); }
  }
  const history = (Array.isArray(body.messages) ? body.messages : []).slice(-16)
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.slice(0, 1500) }));
  if (!history.length || history[history.length - 1].role !== 'user') return json(400, { error: '보낼 말이 없어요' });
  while (history[0] && history[0].role !== 'user') history.shift();
  const context = JSON.stringify(body.context || {}).slice(0, 14000);
  const pet = { name: str(body.pet && body.pet.name, 30) || `${me.name}의 펫`, ko: str(body.pet && body.pet.ko, 12) || '펫' };
  const style = str(body.style, 200);

  const system = `너는 ${me.name}님의 반려 ${pet.ko} "${pet.name}"이고, ${me.name}님의 다정하고 똑똑한 개인 비서야. Unframe Log 앱 안에서 대화해.
- 한국어로, 짧게(보통 1~4문장). ${pet.ko}다운 귀여운 말투를 살짝. 이모지는 0~2개.
- <context>의 습관 기록·일정·할 일·기분만 사실로 써. 없는 일정이나 숫자를 지어내지 마. 모르면 모른다고 해.
- 오늘 할 일 정리, 우선순위 제안, 응원, 기록 돌아보기, 습관 이어가기 조언을 잘해.
- 사용자가 무언가를 "했다"거나 일정·할 일을 "넣어 달라"고 분명히 말하면 actions에 제안을 넣어. 앱이 사용자에게 확인 버튼을 보여 주고, 눌러야 저장돼. reply에서는 "적용을 누르면 기록할게요"처럼 말해.
  · log: 습관 기록. tracker는 context.habits의 id만. 분 단위 습관은 분으로(1시간=60), 했다/안 했다 습관은 amount 1. 날짜를 말 안 하면 오늘.
  · event: 일정. "내일", "다음 주 화요일" 같은 말은 context.today 기준으로 YYYY-MM-DD로 바꿔.
  · task: 할 일(화이트보드). 마감을 말하면 day에.
  · mood: 기분을 말하면 1~5 점수로.
- 확실하지 않으면 actions는 비우고 되물어. 습관이 목록에 없으면 새로 만들라고 안내만 해.
${style ? `- ${me.name}님이 원하는 말투·스타일: ${style}` : ''}

<context>
${context}
</context>`;

  const client = new Anthropic();
  try {
    const msg = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 2000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system,
      messages: history,
    }, { timeout: 25000 });
    if (msg.stop_reason === 'refusal') return json(200, { reply: '음… 그건 제가 도와드리기 어려워요. 다른 얘기 해볼까요? 🐾', actions: [] });
    const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
    let out;
    try { out = JSON.parse(text); } catch { out = { reply: text.trim() || '앗, 잠깐 말을 놓쳤어요. 다시 말해 줄래요?', actions: [] }; }
    return json(200, { reply: str(out.reply, 1200), actions: Array.isArray(out.actions) ? out.actions.slice(0, 6) : [] });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json(429, { error: '요청이 많아요. 잠시 후 다시 말 걸어 주세요' });
    if (e instanceof Anthropic.APIConnectionError) return json(502, { error: 'Claude에 연결하지 못했어요' });
    if (e instanceof Anthropic.APIError) return json(502, { error: `Claude API 오류 (${e.status})` });
    return json(500, { error: '대화 중 오류가 났어요' });
  }
};
