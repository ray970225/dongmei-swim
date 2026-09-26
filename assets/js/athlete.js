import { getSupabase, isSupabaseConfigured } from './supabase-client.js';

const $ = selector => document.querySelector(selector);
const params = new URLSearchParams(location.search);
const sourceSwimmerId = params.get('swimmer_id') || '';
let resultRows = [];
let selectedEvent = '';
let selectedPool = '';

function timeText(ms) {
  const total = ms / 1000;
  const minutes = Math.floor(total / 60);
  const seconds = (total % 60).toFixed(2).padStart(5, '0');
  return minutes ? `${minutes}:${seconds}` : `${total.toFixed(2)} 秒`;
}
function setState(title, detail) {
  $('#athleteState').hidden = false;
  $('#athleteState h1').textContent = title;
  $('#athleteState p:not(.eyebrow)').textContent = detail;
  $('#athleteContent').hidden = true;
}
function byDate(a, b) { return String(a.competition_date || '').localeCompare(String(b.competition_date || '')) || String(a.id).localeCompare(String(b.id)); }

function eventGroups(rows) {
  const groups = new Map();
  rows.forEach(row => {
    if (!(Number(row.time_milliseconds) > 0)) return;
    const key = `${row.event_name}\u0001${row.pool_type || '池別未列'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  groups.forEach(list => list.sort(byDate));
  return groups;
}

function fillFilters(groups) {
  const eventFilter = $('#eventFilter');
  const events = [...new Set([...groups.keys()].map(key => key.split('\u0001')[0]))].sort((a,b) => a.localeCompare(b, 'zh-Hant'));
  eventFilter.replaceChildren(...events.map(event => { const option = document.createElement('option'); option.value = event; option.textContent = event; return option; }));
  if (!events.includes(selectedEvent)) selectedEvent = events[0] || '';
  eventFilter.value = selectedEvent;
  const pools = [...new Set([...groups.keys()].filter(key => key.startsWith(`${selectedEvent}\u0001`)).map(key => key.split('\u0001')[1]))];
  $('#poolFilter').replaceChildren(...pools.map(pool => { const option = document.createElement('option'); option.value = pool; option.textContent = pool; return option; }));
  if (!pools.includes(selectedPool)) selectedPool = pools[0] || '';
  $('#poolFilter').value = selectedPool;
}

function renderHeroBest(groups) {
  const rows = groups.get(`${selectedEvent}\u0001${selectedPool}`) || [];
  if (!rows.length) return;
  const best = rows.reduce((fastest, row) => Number(row.time_milliseconds) < Number(fastest.time_milliseconds) ? row : fastest);
  $('#bestEvent').textContent = `${selectedEvent} · ${selectedPool}`;
  $('#bestTime').textContent = best.time_text || timeText(Number(best.time_milliseconds));
  $('#bestLabel').textContent = '所選項目個人最佳';
}

function formatMeet(row) { return row.meets?.name || row.meet_name || '賽事名稱未列'; }

function renderTrend(groups) {
  const key = `${selectedEvent}\u0001${selectedPool}`;
  const rows = groups.get(key) || [];
  const chart = $('#trendChart'); chart.replaceChildren();
  $('#trendHint').hidden = true;
  if (!rows.length) { chart.textContent = '目前沒有可繪製的計時成績。'; $('#progressSummary').replaceChildren(); return; }
  if (rows.length === 1) {
    const value = document.createElement('p'); value.className = 'single-point'; value.textContent = `${rows[0].time_text} · ${rows[0].competition_date || ''}`; chart.append(value);
  } else {
    const mobile = matchMedia('(max-width: 700px)').matches;
    const width = Math.max(mobile ? 340 : 900, 210 + rows.length * (mobile ? 65 : 84));
    const height = mobile ? 260 : 330;
    const pad = { left: mobile ? 60 : 82, right: 28, top: 38, bottom: 45 };
    const times = rows.map(row => Number(row.time_milliseconds));
    const min = Math.min(...times), max = Math.max(...times), span = Math.max(max - min, 1000);
    const low = min - span * .24, high = max + span * .24;
    const x = i => pad.left + i * (width - pad.left - pad.right) / (rows.length - 1);
    const y = value => pad.top + (high - value) * (height - pad.top - pad.bottom) / (high - low);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', `0 0 ${width} ${height}`); svg.setAttribute('width', width); svg.setAttribute('height', height); svg.setAttribute('role','img'); svg.setAttribute('aria-label', `${selectedEvent} ${selectedPool} 成績趨勢`);
    [0,.5,1].forEach(ratio => { const value = high - (high-low)*ratio; const line=document.createElementNS(ns,'line'); line.setAttribute('x1',pad.left); line.setAttribute('x2',width-pad.right); line.setAttribute('y1',y(value)); line.setAttribute('y2',y(value)); line.setAttribute('class','athlete-grid'); svg.append(line); const label=document.createElementNS(ns,'text'); label.setAttribute('x',pad.left-8); label.setAttribute('y',y(value)+4); label.setAttribute('text-anchor','end'); label.setAttribute('class','athlete-chart-label'); label.textContent=timeText(value); svg.append(label); });
    const path=document.createElementNS(ns,'path'); path.setAttribute('class','athlete-trend-line'); path.setAttribute('d',rows.map((row,i)=>`${i?'L':'M'} ${x(i)} ${y(Number(row.time_milliseconds))}`).join(' ')); svg.append(path);
    rows.forEach((row,i)=>{ const circle=document.createElementNS(ns,'circle'); circle.setAttribute('cx',x(i)); circle.setAttribute('cy',y(Number(row.time_milliseconds))); circle.setAttribute('r',mobile?'5':'6'); circle.setAttribute('class','athlete-point'); const title=document.createElementNS(ns,'title'); title.textContent=`${row.competition_date || ''} · ${formatMeet(row)} · ${row.time_text}`; circle.append(title); svg.append(circle); const date=document.createElementNS(ns,'text'); date.setAttribute('x',x(i)); date.setAttribute('y',height-12); date.setAttribute('text-anchor','middle'); date.setAttribute('class','athlete-chart-label'); date.textContent=String(row.competition_date || '').slice(5).replace('-','/'); svg.append(date); });
    chart.append(svg);
    $('#trendHint').hidden = !mobile || width <= chart.clientWidth;
  }
  const bestByYear = new Map();
  rows.forEach(row => { const year = String(row.competition_date || '').slice(0,4); if (!year) return; const old = bestByYear.get(year); if (!old || Number(row.time_milliseconds) < Number(old.time_milliseconds)) bestByYear.set(year,row); });
  const years = [...bestByYear.keys()].sort();
  const summary = $('#progressSummary'); summary.replaceChildren();
  if (years.length > 1) {
    const first=bestByYear.get(years[0]), last=bestByYear.get(years.at(-1));
    const delta = Number(last.time_milliseconds)-Number(first.time_milliseconds);
    const label=document.createElement('span'); label.textContent=`${years[0]} → ${years.at(-1)} 年度最佳`;
    const value=document.createElement('strong'); value.textContent=`${delta <= 0 ? '快' : '慢'} ${timeText(Math.abs(delta))}`;
    const track=document.createElement('div'); track.className='year-bests';
    years.forEach(year=>{ const item=document.createElement('span'); item.textContent=`${year}  ${bestByYear.get(year).time_text}`; track.append(item); });
    summary.append(label,value,track);
  }
}

function renderRecent(rows) {
  const valid=rows.filter(row=>Number(row.time_milliseconds)>0).sort((a,b)=>String(b.competition_date||'').localeCompare(String(a.competition_date||''))).slice(0,5);
  const comparable=rows.filter(row=>row.event_name===selectedEvent&&(row.pool_type||'池別未列')===selectedPool&&Number(row.time_milliseconds)>0).sort((a,b)=>String(b.competition_date||'').localeCompare(String(a.competition_date||''))).slice(0,5);
  const average=comparable.length ? comparable.reduce((sum,row)=>sum+Number(row.time_milliseconds),0)/comparable.length : null;
  $('#recentAverage').textContent=average ? `${selectedEvent} · 最近 ${comparable.length} 筆平均 ${timeText(average)}` : '';
  const host=$('#recentResults'); host.replaceChildren();
  valid.forEach(row=>{ const item=document.createElement('div'); item.className='recent-row'; const date=document.createElement('time'); date.textContent=row.competition_date||''; const info=document.createElement('span'); info.textContent=`${row.event_name} · ${row.pool_type||''} · ${formatMeet(row)}`; const time=document.createElement('strong'); time.textContent=row.time_text||''; item.append(date,info,time); host.append(item); });
  const meets=new Map(); rows.forEach(row=>{ const key=`${row.competition_date||''}|${formatMeet(row)}`; if(!meets.has(key)) meets.set(key,[]); meets.get(key).push(row); });
  const history=$('#meetHistory'); history.replaceChildren();
  [...meets.entries()].sort((a,b)=>b[0].localeCompare(a[0])).forEach(([key,items])=>{ const item=document.createElement('div'); item.className='recent-row'; const date=document.createElement('time'); date.textContent=key.split('|')[0]; const info=document.createElement('span'); info.textContent=key.split('|')[1]; const time=document.createElement('strong'); time.textContent=`${items.length} 項成績`; item.append(date,info,time); history.append(item); });
}

function renderSplits(splits, rows) {
  if (!splits?.length) return;
  const byResult=new Map(); splits.forEach(split=>{ if(!byResult.has(split.result_id))byResult.set(split.result_id,[]);byResult.get(split.result_id).push(split); });
  const visible=rows.filter(row=>byResult.has(row.id)); if(!visible.length)return;
  $('#splitSection').hidden=false;
  const host=$('#splitChart'); host.replaceChildren();
  visible.slice(0,8).forEach(row=>{ const group=byResult.get(row.id).sort((a,b)=>a.distance_m-b.distance_m); const item=document.createElement('div'); item.className='split-row'; const title=document.createElement('strong');title.textContent=`${row.event_name} · ${row.competition_date||''}`; const values=document.createElement('span');values.textContent=group.map(split=>`${split.distance_m}m ${timeText(Number(split.split_milliseconds))}`).join('   /   ');item.append(title,values);host.append(item); });
}

async function start() {
  if (!sourceSwimmerId) { setState('請從選手資料名單選擇選手', '此頁僅載入可查閱的真實賽事成績。'); return; }
  let supabase = null;
  let athlete;
  if (isSupabaseConfigured()) {
    supabase=await getSupabase();
    const {data,error}=await supabase.from('athletes').select('id,source_swimmer_id,full_name,english_name,gender,birth_year,visibility').eq('source_swimmer_id',sourceSwimmerId).eq('active',true).maybeSingle();
    if(error||!data){setState('找不到公開選手資料','此選手資料目前不可公開查閱，或尚未完成資料庫匯入。');return;}
    athlete=data;
    const response=await supabase.from('results').select('id,event_name,competition_date,team_name,rank,time_text,time_milliseconds,pool_type,round_name,age_group,meet_id,meets(name)').eq('athlete_id',athlete.id).order('competition_date',{ascending:false});
    if(response.error){setState('成績暫時無法載入','請稍後再試。');return;}
    resultRows=response.data||[];
  } else {
    // Compatibility view over the already-public legacy snapshot until Supabase is configured.
    const response=await fetch('data/swim-results.json');
    if(!response.ok)throw new Error(`成績載入失敗：${response.status}`);
    const snapshot=await response.json();
    resultRows=snapshot.filter(row=>String(row.swimmer_id)===sourceSwimmerId).map(row=>({
      ...row,event_name:row.event,competition_date:row.competition_date,time_text:row.time,
      pool_type:row.pool_type||'池別未列',meets:{name:row.competition||'賽事名稱未列'}
    }));
    const first=resultRows[0];
    athlete=first?{full_name:first.swimmer,english_name:first.swimmer_en,gender:first.gender,birth_year:first.birth_year}:null;
  }
  if(!athlete){setState('找不到選手資料','此選手尚無可查閱的公開成績。');return;}
  if(!resultRows.length){setState('目前沒有公開成績','之後同步到的公開紀錄會顯示在這裡。');return;}
  resultRows = resultRows.filter(row => Number(row.time_milliseconds) > 0);
  if(!resultRows.length){setState('目前沒有可用的計時成績','目前紀錄中沒有有效計時資料，暫時無法製作項目最佳或趨勢圖。');return;}
  $('#athleteState').hidden=true; $('#athleteContent').hidden=false;
  $('#athleteName').textContent=athlete.full_name;
  $('#athleteMeta').textContent=[athlete.english_name,athlete.gender,athlete.birth_year?`${athlete.birth_year} 年生`:null,'TMSC'].filter(Boolean).join(' / ');
  $('#resultCount').textContent=`${resultRows.length} 筆有效紀錄`;
  const groups=eventGroups(resultRows);
  const bestRows=[...groups.entries()].map(([key,list])=>({key,row:list.reduce((best,row)=>Number(row.time_milliseconds)<Number(best.time_milliseconds)?row:best)})).sort((a,b)=>a.key.localeCompare(b.key,'zh-Hant'));
  const latest = [...resultRows].sort((a,b)=>byDate(b,a))[0];
  selectedEvent = latest.event_name;
  selectedPool = latest.pool_type || '池別未列';
  const host=$('#eventBests');host.replaceChildren();bestRows.forEach(({key,row})=>{const item=document.createElement('button');item.type='button';item.className='event-best';const parts=key.split('\u0001');const label=document.createElement('span');label.textContent=parts.join(' · ');const time=document.createElement('strong');time.textContent=row.time_text||timeText(Number(row.time_milliseconds));item.setAttribute('aria-label',`查看 ${parts.join('、')} 趨勢，項目最佳 ${time.textContent}`);item.append(label,time);item.addEventListener('click',()=>{selectedEvent=parts[0];selectedPool=parts[1];fillFilters(groups);renderHeroBest(groups);renderTrend(groups);});host.append(item);});
  fillFilters(groups);renderHeroBest(groups);renderTrend(groups);renderRecent(resultRows);
  $('#eventFilter').addEventListener('change',()=>{selectedEvent=$('#eventFilter').value;selectedPool='';fillFilters(groups);renderHeroBest(groups);renderTrend(groups);});
  $('#poolFilter').addEventListener('change',()=>{selectedPool=$('#poolFilter').value;renderHeroBest(groups);renderTrend(groups);});
  const ids=resultRows.map(row=>row.id);
  if(supabase){
    const splitResults=await supabase.from('splits').select('id,result_id,distance_m,split_milliseconds').in('result_id',ids);
    if(!splitResults.error)renderSplits(splitResults.data,resultRows);
  }
}

void start().catch(error=>{console.error(error);setState('選手資料載入失敗','請重新整理後再試。');});
CSS
