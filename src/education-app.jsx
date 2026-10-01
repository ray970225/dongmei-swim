import { createRoot } from 'react-dom/client';

function MemberWorkspace({ displayName }) {
  return (
    <>
      <header className="member-home-heading">
        <h1>會員工作區</h1>
        <p>{displayName ? `${displayName}｜` : ''}隊內服務與選手資訊集中於此。</p>
      </header>
      <section className="member-service-group" aria-labelledby="memberServicesTitle">
        <div className="member-service-intro">
          <h2 id="memberServicesTitle">隊內服務</h2>
          <p>選擇要查看的資料。</p>
        </div>
        <div className="member-service-list">
          <section className="member-service-row">
            <div className="member-service-copy">
              <span className="member-service-label">升學與招生</span>
              <h3>升學資料庫</h3>
              <p>閱讀國內升學、海外留學、招生簡章與重要日期。</p>
            </div>
            <button
              id="openLibrary"
              className="member-service-action"
              type="button"
              onClick={() => document.dispatchEvent(new Event('tmsc:open-library'))}
            >
              <span>開啟升學資料庫</span><span aria-hidden="true">→</span>
            </button>
          </section>
          <a className="member-service-row member-service-link" href="athletes.html">
            <span className="member-service-copy">
              <span className="member-service-label">比賽與表現</span>
              <h3>選手資料</h3>
              <p>瀏覽選手成績、個人最佳與比賽紀錄。</p>
            </span>
            <span className="member-service-action"><span>查看選手資料</span><span aria-hidden="true">→</span></span>
          </a>
        </div>
      </section>
    </>
  );
}

let memberWorkspaceRoot;

export function renderMemberHome(displayName = '') {
  const host = document.getElementById('memberHome');
  if (!host) return;
  memberWorkspaceRoot ??= createRoot(host);
  memberWorkspaceRoot.render(<MemberWorkspace displayName={displayName} />);
}
