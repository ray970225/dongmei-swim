import { createRoot } from 'react-dom/client';
import { useState } from 'react';

export function MemberWorkspace({ displayName, data, actions }) {
  const [view, setView] = useState('home');
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [article, setArticle] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [attachmentMessage, setAttachmentMessage] = useState('');
  const [openingArticle, setOpeningArticle] = useState(false);
  const [signedUrls, setSignedUrls] = useState({});

  const categories = data.categories || [];
  const articles = data.articles || [];
  const categoryName = id => categories.find(item => item.id === id)?.name || '升學資訊';
  const openLibrary = () => {
    setView('library');
    actions.onOpenLibrary();
  };
  const openArticle = async item => {
    setArticle(item);
    setAttachments([]);
    setAttachmentMessage('');
    setSignedUrls({});
    setView('reader');
    setOpeningArticle(true);
    try {
      setAttachments(await actions.onLoadAttachments(item.id));
    } catch {
      setAttachmentMessage('附件載入失敗，請返回文章列表後重試。');
    } finally {
      setOpeningArticle(false);
    }
  };
  const filteredArticles = articles.filter(item => {
    const bodyText = Array.isArray(item.body) ? item.body.map(block => block?.text || '').join(' ') : String(item.body || '');
    return (!categoryId || item.category_id === categoryId) &&
      (!query.trim() || `${item.title} ${item.summary || ''} ${bodyText}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  });
  const bodyBlocks = article && (Array.isArray(article.body) ? article.body : String(article.body || '').split(/\n{2,}/).map(text => ({ type: 'paragraph', text })));

  return (
    <div className="member-dashboard">
      {view === 'home' && <>
        <header className="member-home-heading">
          <h1>會員工作台</h1>
          <p>{displayName ? `${displayName}，` : ''}選擇要使用的隊內服務。</p>
        </header>
        <section className="member-service-group" aria-labelledby="memberServicesTitle">
          <div className="member-service-intro">
            <h2 id="memberServicesTitle">會員服務</h2>
            <p>登入後可查閱東美隊內資訊與選手資料。</p>
          </div>
          <div className="member-service-list">
            <section className="member-service-row">
              <div className="member-service-copy">
                <span className="member-service-label">升學與招生</span>
                <h3>升學資料庫</h3>
                <p>國內升學、海外留學、招生簡章與重要日期。</p>
              </div>
              <button className="member-service-action" type="button" onClick={openLibrary}>
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
      </>}

      {view === 'library' && <section className="library-view">
        <div className="library-topline">
          <button className="text-button" type="button" onClick={() => setView('home')}>← 回到會員工作台</button>
          <span>會員限定・隊內資料</span>
        </div>
        <section className="education-hero"><div><h2>升學資料庫</h2><p>升學、招生文章與重要日期，登入後即可查閱。</p></div></section>
        <section className="library-section">
          <div className="library-heading">
            <div><h2>最新資訊</h2></div>
            <label className="search-field">
              <span className="sr-only">搜尋文章、學校或關鍵字</span>
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜尋文章、學校或關鍵字" />
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="10.8" cy="10.8" r="6.8"></circle><path d="m16 16 4.5 4.5"></path></svg>
            </label>
          </div>
          {!!data.deadlines?.length && <section className="deadline-strip" aria-label="重要日期">
            <h3>重要日期</h3><div className="deadline-list">{data.deadlines.slice(0, 4).map(item => <div className="deadline-item" key={item.id}>
              <strong>{new Intl.DateTimeFormat('zh-TW', { month: '2-digit', day: '2-digit' }).format(new Date(item.due_at))}</strong><span>{item.title}</span>
            </div>)}</div>
          </section>}
          <div className="category-list" aria-label="文章分類">
            {[['', '全部資訊'], ...categories.map(item => [item.id, item.name])].map(([id, name]) => <button key={id || 'all'} type="button" className={`category-chip${categoryId === id ? ' active' : ''}`} aria-pressed={categoryId === id} onClick={() => setCategoryId(id)}>{name}</button>)}
          </div>
          <div className="article-list" aria-live="polite">
            {data.libraryLoading && <p className="empty-state">正在載入隊內文章…</p>}
            {!data.libraryLoading && data.libraryError && <div className="empty-state"><p>{data.libraryError}</p><button className="text-button" type="button" onClick={actions.onRetry}>重新載入</button></div>}
            {!data.libraryLoading && !data.libraryError && !filteredArticles.length && <p className="empty-state">目前沒有符合的文章。</p>}
            {!data.libraryLoading && !data.libraryError && filteredArticles.map((item, index) => <button key={item.id} type="button" className="article-row" onClick={() => void openArticle(item)} aria-label={`閱讀文章：${item.title}，分類：${categoryName(item.category_id)}`}>
              <span className="article-index">{String(index + 1).padStart(2, '0')}</span>
              <span className={`article-cover${item.coverUrl ? '' : ' is-fallback'}`}>{item.coverUrl && <img src={item.coverUrl} alt="" loading="lazy" decoding="async" />}<span className="article-cover-label">東美會員升學資料庫</span></span>
              <span className="article-copy"><span className="article-category">{categoryName(item.category_id)}</span><strong>{item.title}</strong><span className="article-summary">{item.summary}</span></span>
              <time className="article-date">{item.published_at ? new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium' }).format(new Date(item.published_at)) : ''}</time>
              <span className="article-arrow" aria-hidden="true">↗</span>
            </button>)}
          </div>
        </section>
      </section>}

      {view === 'reader' && article && <section className="reader">
        <button className="text-button" type="button" onClick={() => { setView('library'); setSignedUrls({}); }}>← 回到文章列表</button>
        <article>
          <p className="eyebrow">{categoryName(article.category_id)}</p>
          <h2>{article.title}</h2>
          {article.summary && <p className="reader-summary">{article.summary}</p>}
          <div className="reader-body">{bodyBlocks?.map((block, index) => block?.text ? block.type === 'heading' ? <h3 key={index}>{block.text}</h3> : <p key={index}>{block.text}</p> : null)}</div>
          <div className="reader-attachments">
            {openingArticle && <p className="empty-state">正在載入附件…</p>}
            {attachmentMessage && <p className="empty-state" role="status">{attachmentMessage}</p>}
            {attachments.map(file => <section className="attachment-row" key={file.id}>
              <strong>{file.file_name}</strong>
              {signedUrls[file.id] ? file.mime_type === 'application/pdf' ? <iframe className="pdf-frame" title={file.file_name} src={signedUrls[file.id]} /> : <img className="article-image" alt={file.file_name} src={signedUrls[file.id]} /> : <button className="text-button" type="button" onClick={async event => {
                const button = event.currentTarget; button.disabled = true;
                try { const url = await actions.onSignAttachment(file); setSignedUrls(current => ({ ...current, [file.id]: url })); }
                catch { setAttachmentMessage('附件開啟失敗，請稍後再試。'); }
                finally { button.disabled = false; }
              }}>{file.mime_type === 'application/pdf' ? '開啟隊內 PDF 閱讀器' : '檢視圖片'}</button>}
            </section>)}
          </div>
        </article>
      </section>}
    </div>
  );
}

let educationRoot;
let currentProps;

export function mountEducationApp(host, props) {
  educationRoot ??= createRoot(host);
  currentProps = props;
  educationRoot.render(<MemberWorkspace {...props} />);
}

export function updateEducationApp(props) {
  if (!educationRoot) return;
  currentProps = { ...currentProps, ...props };
  educationRoot.render(<MemberWorkspace {...currentProps} />);
}

export function unmountEducationApp() {
  educationRoot?.unmount();
  educationRoot = undefined;
  currentProps = undefined;
}
