import {
  OWNER_DAILY_REQUEST_LIMIT,
  OWNER_EMAILS,
  STAFF_DAILY_REQUEST_LIMIT,
} from "../config/costControls";

const STORAGE_PREFIX = "unframe-ai-office-usage";

function padNumber(value) {
  return String(value).padStart(2, "0");
}

function getDailyLimit(userEmail) {
  return OWNER_EMAILS.includes(userEmail)
    ? OWNER_DAILY_REQUEST_LIMIT
    : STAFF_DAILY_REQUEST_LIMIT;
}

export function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = padNumber(now.getMonth() + 1);
  const day = padNumber(now.getDate());

  return `${year}-${month}-${day}`;
}

export function getLocalUsage(userEmail) {
  if (!userEmail || typeof window === "undefined") {
    return 0;
  }

  const storageKey = `${STORAGE_PREFIX}-${userEmail}-${getTodayKey()}`;
  const rawValue = window.localStorage.getItem(storageKey);
  const usageCount = Number(rawValue || 0);

  return Number.isFinite(usageCount) ? usageCount : 0;
}

export function incrementLocalUsage(userEmail) {
  if (!userEmail || typeof window === "undefined") {
    return 0;
  }

  const storageKey = `${STORAGE_PREFIX}-${userEmail}-${getTodayKey()}`;
  const nextUsage = getLocalUsage(userEmail) + 1;
  window.localStorage.setItem(storageKey, String(nextUsage));

  return nextUsage;
}

export function canSendMessage(userEmail) {
  if (!userEmail) {
    return false;
  }

  const usageCount = getLocalUsage(userEmail);
  const dailyLimit = getDailyLimit(userEmail);

  return usageCount < dailyLimit;
}

// Client-side guard only. Server-enforced limits can be added later with
// Firestore Admin SDK or Netlify Blobs for stronger protection.
