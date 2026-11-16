// 🔔 이 기기 알림 (웹 푸시). 앱이 닫혀 있어도 휴대폰·PC로 알림이 온다.
// - 아이폰: iOS 16.4+, Safari에서 "홈 화면에 추가"한 앱에서만 가능
// - 구독 정보는 Firestore pushSubs/{멤버id}__{기기} 에 저장, 보내기는 Netlify 함수(push)가 한다
import { VAPID_PUBLIC_KEY } from './push-config.js';

export const KIND_LABEL = {
  chat: '💬 채팅 메시지',
  request: '🙋 확인 요청과 답',
  board: '📋 나에게 맡긴 할 일',
  event: '📅 새 일정',
  'claude-wait': '🤖 내 Claude가 승인을 기다릴 때',
  'claude-done': '✅ 내 Claude 작업이 끝났을 때',
};
export const DEFAULT_KINDS = ['chat', 'request', 'board', 'event', 'claude-wait'];

const ua = navigator.userAgent;
export const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const deviceName = () => (isIOS ? (/ipad/i.test(ua) ? 'iPad' : 'iPhone') : /android/i.test(ua) ? (/SM-|Samsung/i.test(ua) ? 'Galaxy' : 'Android') : /mac/i.test(ua) ? 'Mac' : /windows/i.test(ua) ? 'Windows PC' : '이 기기');
const pushCapable = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function b64ToBytes(s) {
  const b = atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}
async function subId(meId, endpoint) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return meId + '__' + [...new Uint8Array(h)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function reg() {
  if (!('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.getRegistration().then(r => r || navigator.serviceWorker.ready);
}

/**
 * 지금 상태:
 *  on        — 이 기기로 알림이 와요 (푸시 구독 있음, 허용됨)
 *  off       — 꺼짐
 *  blocked   — 브라우저/폰 설정에서 알림이 차단됨
 *  install   — 아이폰: 홈 화면에 추가해야 켤 수 있음
 *  unsupported — 이 브라우저는 웹 푸시를 지원하지 않음
 */
export async function pushState() {
  if (isIOS && !standalone()) return 'install';
  if (!pushCapable()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  const r = await reg();
  const sub = r && await r.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

/** 켜기: 반드시 버튼을 누른 순간에 불러야 한다 (아이폰은 사용자 동작 안에서만 권한을 물어봄) */
export async function enablePush(store, me, kinds) {
  if (isIOS && !standalone()) throw new Error('아이폰은 먼저 Safari에서 공유 → "홈 화면에 추가"를 하고, 홈 화면의 앱에서 켜 주세요.');
  if (!pushCapable()) throw new Error('이 브라우저는 알림을 지원하지 않아요. 크롬이나 사파리 최신 버전으로 열어 주세요.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied' ? '알림이 차단돼 있어요. 휴대폰 설정 → 알림에서 이 앱을 허용해 주세요.' : '알림 허용을 누르지 않았어요.');
  const r = await reg();
  let sub = await r.pushManager.getSubscription();
  if (!sub) sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC_KEY) });
  const j = sub.toJSON();
  const id = await subId(me.id, j.endpoint);
  await store.savePushSub(id, { endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth }, kinds, device: deviceName() });
  try { localStorage.setItem('unframe-push-id', id); localStorage.setItem('unframe-push-kinds', JSON.stringify(kinds)); } catch {}
  return id;
}
export async function disablePush(store, me) {
  const r = await reg();
  const sub = r && await r.pushManager.getSubscription();
  if (sub) {
    const id = await subId(me.id, sub.endpoint);
    await store.deletePushSub(id).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  try { localStorage.removeItem('unframe-push-id'); } catch {}
}
/** 알림 종류만 바꾸기 */
export async function updateKinds(store, me, kinds) {
  try { localStorage.setItem('unframe-push-kinds', JSON.stringify(kinds)); } catch {}
  if ((await pushState()) === 'on') await enablePush(store, me, kinds);
}
export function savedKinds() {
  try { const k = JSON.parse(localStorage.getItem('unframe-push-kinds')); if (Array.isArray(k)) return k; } catch {}
  return DEFAULT_KINDS;
}

/** 열려 있는 페이지에서 바로 띄우는 알림 (안드로이드 크롬은 new Notification()을 막아서 서비스 워커로 띄운다) */
export async function localNotify(title, body, tag, url) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const r = await reg();
    if (r && r.showNotification) { await r.showNotification(title, { body, tag: tag || undefined, icon: 'icons/icon-192.png', data: { url: url || './' } }); return; }
  } catch {}
  try { new Notification(title, { body, tag: tag || undefined }); } catch {}
}
