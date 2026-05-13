import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";

export default function LoginScreen() {
  const handleLogin = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  return (
    <main className="login-screen">
      <div className="login-card">
        <p className="eyebrow">UNFRAME AI OFFICE</p>
        <h1>AI 작업자들이 모인 작은 사무실</h1>
        <p>
          전시 기획, 카피라이팅, 디자인 프롬프트, 음악 큐레이션, 운영 업무를
          한 공간에서 함께 정리합니다.
        </p>

        <button onClick={handleLogin}>Google 계정으로 입장하기</button>

        <small>
          승인된 UNFRAME / Kün’s Gallery 직원 계정만 사용할 수 있습니다.
        </small>
      </div>
    </main>
  );
}