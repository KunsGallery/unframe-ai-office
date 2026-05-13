export const rooms = [
  {
    id: "general",
    name: "General Office",
    emoji: "🏢",
    description: "공통 업무와 빠른 요청을 처리하는 기본 오피스",
    theme: "office",
  },
  {
    id: "exhibition",
    name: "Exhibition Room",
    emoji: "🖼️",
    description: "현재 전시, 작가, 홍보 문구, 운영 자료를 정리하는 전시 프로젝트 룸",
    theme: "exhibition",
  },
  {
    id: "up",
    name: "UP",
    emoji: "🎧",
    description: "UNFRAME Playlist, 전시 OST, Suno 프롬프트 작업",
    theme: "music",
  },
  {
    id: "u-sharp",
    name: "U#",
    emoji: "📚",
    description: "매거진, 인터뷰, 아카이브 콘텐츠 작업",
    theme: "archive",
  },
  {
    id: "join",
    name: "UNFRAME JOIN",
    emoji: "📋",
    description: "공모, 신청, 협업 제안, 운영 자동화 작업",
    theme: "admin",
  },
  {
    id: "virtual-gallery",
    name: "Virtual Gallery",
    emoji: "🖼️",
    description: "가상 갤러리, AR, 온라인 전시 기술 작업",
    theme: "digital",
  },
];

// Future extension:
// currentExhibitionTitle 같은 필드를 추가하면 Exhibition Room 안에서
// 현재 전시 이름만 유연하게 바꿔 표시할 수 있습니다.
