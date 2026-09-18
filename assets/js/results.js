const input = document.getElementById('searchInput');
    const button = document.getElementById('searchBtn');
    const list = document.getElementById('resultsList');
    const meta = document.getElementById('metaText');
    const updatedAt = document.getElementById('updatedAt');
    let rows = [];

    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));

    const formatRank = rank => rank ? `第 ${rank} 名` : '名次未列';

    const formatUpdatedAt = value => {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '最後更新時間未提供';
      return `最後更新：${new Intl.DateTimeFormat('zh-TW', {
        timeZone: 'Asia/Taipei',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
      }).format(date)}（台灣時間）`;
    };

    const render = query => {
      const q = query.trim();
      if (!q) {
        list.innerHTML = '<div class="empty">請輸入選手姓名開始查詢。</div>';
        meta.textContent = `已同步 ${rows.length} 筆成績`;
        return;
      }

      const matches = rows
        .filter(row => String(row.swimmer || '').includes(q))
        .sort((a, b) => String(b.competition_date || '').localeCompare(String(a.competition_date || '')));

      meta.textContent = matches.length
        ? `找到 ${matches.length} 筆「${q}」相關成績`
        : `找不到「${q}」的成績`;

      if (!matches.length) {
        list.innerHTML = '<div class="empty">目前沒有符合的同步資料。可確認姓名是否完整，或稍後重新同步成績資料。</div>';
        return;
      }

      list.innerHTML = matches.slice(0, 80).map(row => `
        <article class="row">
          <div class="date">${escapeHtml(row.competition_date || '')}</div>
          <div>
            <div class="title">${escapeHtml(row.swimmer)}｜${escapeHtml(row.event || '未列項目')}</div>
            <div class="sub">
              ${escapeHtml(row.competition || '')}<br>
              ${escapeHtml(row.team || '')} · ${escapeHtml(row.age_group || '')} · ${escapeHtml(row.round || '')} · ${escapeHtml(formatRank(row.rank))}
            </div>
          </div>
          <div class="time">${escapeHtml(row.time || '-')}</div>
        </article>
      `).join('');
    };

    const search = () => {
      const q = input.value;
      const url = new URL(location.href);
      if (q.trim()) url.searchParams.set('q', q.trim());
      else url.searchParams.delete('q');
      history.replaceState(null, '', url);
      render(q);
    };

    button.addEventListener('click', search);
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') search();
    });
    Promise.all([
      fetch('data/swim-results.json').then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      }),
      fetch('data/swim-results-meta.json').then(response => response.ok ? response.json() : null).catch(() => null)
    ])
      .then(([data, metadata]) => {
        rows = Array.isArray(data) ? data : [];
        const fallbackTimestamp = rows.map(row => row.synced_at).filter(Boolean).sort().at(-1);
        updatedAt.textContent = formatUpdatedAt(metadata?.synced_at || fallbackTimestamp);
        const initial = new URLSearchParams(location.search).get('q') || '';
        input.value = initial;
        meta.textContent = `已同步 ${rows.length} 筆成績`;
        render(initial);
      })
      .catch(error => {
        meta.textContent = '資料載入失敗';
        updatedAt.textContent = '最後更新時間無法取得';
        list.innerHTML = `<div class="empty">無法載入成績資料：${escapeHtml(error.message)}</div>`;
      });
