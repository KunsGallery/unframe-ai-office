const OWNER_EMAILS = ["gallerykuns@gmail.com"];
const SOYEON_EMAILS = ["sylove887@gmail.com"];

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function resolveEmail(userOrEmail) {
  if (typeof userOrEmail === "string") {
    return normalizeEmail(userOrEmail);
  }

  return normalizeEmail(userOrEmail?.email);
}

export function isOwnerEmail(userOrEmail) {
  const email = resolveEmail(userOrEmail);
  return !email || OWNER_EMAILS.includes(email);
}

export function isSoyeonEmail(userOrEmail) {
  const email = resolveEmail(userOrEmail);
  return SOYEON_EMAILS.includes(email);
}

export function getUserToneProfile(userOrEmail) {
  const email = resolveEmail(userOrEmail);

  if (!email || isOwnerEmail(email)) {
    return {
      key: "owner",
      label: "대표님",
      greetingPrefix: "대표님,",
      chatPlaceholderPrefix: "대표님",
      roleBadge: "Director",
      avatarEmoji: "🧑‍💼",
      toneInstruction: [
        "사용자는 대표님이다.",
        '항상 "대표님"이라고 호칭하고, 첫 문장 또는 가장 자연스러운 첫 호흡에 호칭을 넣는다.',
        "보고하듯 정리된 말투를 사용하되 지나치게 딱딱하지 않게 쓴다.",
        "핵심 판단, 우선순위, 실행 포인트를 빠르게 파악할 수 있게 답한다.",
      ].join(" "),
    };
  }

  if (isSoyeonEmail(email) || email) {
    return {
      key: "soyeon",
      label: "소연님",
      greetingPrefix: "소연님,",
      chatPlaceholderPrefix: "소연님",
      roleBadge: "Team",
      avatarEmoji: "🙂",
      toneInstruction: [
        "사용자는 직원인 소연님이다.",
        '항상 "소연님"이라고 호칭하고, 첫 문장 또는 가장 자연스러운 첫 호흡에 호칭을 넣는다.',
        "아주 부드럽고 공손하며 조심스러운 말투를 사용한다.",
        "명령조는 피하고, 부담을 덜어주는 권유형 표현을 자연스럽게 섞는다.",
        '직접적으로 "공주님"이라는 단어를 반복하지 말고, 공주님을 모시듯 깍듯하고 다정하게 대한다.',
        "친절함, 대우, 존중, 세심함이 느껴지도록 하고, 차갑거나 사무적인 표현은 피한다.",
        "필요하면 편하게 확인해주세요, 천천히 보셔도 괜찮습니다, 필요한 부분만 진행하시면 됩니다 같은 표현을 자연스럽게 활용한다.",
      ].join(" "),
    };
  }

  return {
    key: "default",
    label: "대표님",
    greetingPrefix: "대표님,",
    chatPlaceholderPrefix: "대표님",
    roleBadge: "Director",
    avatarEmoji: "🧑‍💼",
    toneInstruction:
      '항상 "대표님"이라고 호칭하고, 첫 문장에 자연스럽게 호칭을 포함해 보고하듯 정리한다.',
  };
}

export function getUserDisplayLabel(userOrEmail) {
  return getUserToneProfile(userOrEmail).label;
}

export function getUserRoleBadge(userOrEmail) {
  return getUserToneProfile(userOrEmail).roleBadge;
}

export function getUserAvatarEmoji(userOrEmail) {
  return getUserToneProfile(userOrEmail).avatarEmoji;
}

export function buildToneInstruction(userOrEmail) {
  const profile = getUserToneProfile(userOrEmail);

  if (profile.key === "soyeon") {
    return [
      "호칭/말투 규칙:",
      `- ${profile.toneInstruction}`,
      "- 문장은 짧고 부드럽게 정리한다.",
      "- 사용자가 편하게 확인할 수 있도록 부담을 덜어주는 표현을 우선한다.",
      "- 필요한 부분만 선택해서 진행해도 된다는 안정감을 준다.",
      "- 모든 응답은 담당 agent 역할에 맞는 전문성을 유지한다.",
    ].join("\n");
  }

  return [
    "호칭/말투 규칙:",
    `- ${profile.toneInstruction}`,
    "- 모든 응답은 담당 agent 역할에 맞는 전문성을 유지한다.",
  ].join("\n");
}

export function buildAgentGreeting(agent, userOrEmail) {
  const profile = getUserToneProfile(userOrEmail);
  return `${profile.greetingPrefix} 저는 ${agent.name}입니다. ${agent.description}`;
}
