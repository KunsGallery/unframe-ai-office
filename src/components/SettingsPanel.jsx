import { ASSET_CREDITS } from "../data/assetCredits";

export default function SettingsPanel({ isOpen, onClose }) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="settings-panel-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <aside
        className="settings-panel"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Settings and credits"
      >
        <div className="settings-panel-header">
          <div>
            <p className="eyebrow">SETTINGS</p>
            <h2>UNFRAME AI Office</h2>
            <p>Pixel Office UI</p>
          </div>

          <button
            type="button"
            className="settings-close-button"
            onClick={onClose}
            aria-label="설정 닫기"
          >
            닫기
          </button>
        </div>

        <section className="settings-section">
          <h3>Credits & Licenses</h3>
          <p>
            Pixel Agents의 VS Code extension logic과 Claude Code watcher는
            사용하지 않습니다.
          </p>
          <p>
            UNFRAME AI Office는 자체 React/Firebase/Netlify 구조로 작동합니다.
          </p>
          <p>라이선스가 확인된 에셋만 프로젝트에 포함합니다.</p>
        </section>

        <section className="settings-section">
          {ASSET_CREDITS.map((credit) => (
            <article key={credit.id} className="credit-card">
              <div className="credit-title-row">
                <div>
                  <div className="credit-title">{credit.name}</div>
                  <div className="credit-meta">{credit.author}</div>
                </div>
                <span className="license-badge">{credit.license}</span>
              </div>

              <p>{credit.usage}</p>
              <p>{credit.notice}</p>
              {credit.includedPaths?.length ? (
                <div className="credit-paths">
                  <strong>Assets in use</strong>
                  {credit.includedPaths.map((assetPath) => (
                    <code key={assetPath}>{assetPath}</code>
                  ))}
                </div>
              ) : (
                <div className="credit-paths">
                  <strong>Assets in use</strong>
                  <code>현재는 fallback sprites 사용 중</code>
                </div>
              )}
              {credit.excluded ? (
                <p className="credit-excluded">{credit.excluded}</p>
              ) : null}
              <a
                className="credit-source"
                href={credit.source}
                target="_blank"
                rel="noreferrer"
              >
                {credit.source}
              </a>
            </article>
          ))}
        </section>

        <section className="settings-section">
          <h3>Asset Policy</h3>
          <p>VS Code extension logic not used.</p>
          <p>Claude Code watcher not used.</p>
          <p>External paid or unclear-license tilesets not included.</p>
          <p>
            If an asset fails to load, UNFRAME AI Office uses fallback CSS
            sprites.
          </p>
        </section>
      </aside>
    </div>
  );
}
