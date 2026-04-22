// ═══════════════════════════════════════════════════════════
//  DRIVE CONFIG — cross-device sync via Google Drive JSON file
//  Falls back to localStorage when not yet connected.
//  Config keys stored remotely: url, budget, startDay,
//  catBudgets, recurring, insightProfile
// ═══════════════════════════════════════════════════════════
const DriveConfig = (() => {
  // In-memory cache of the full config object
  let _cache = null;
  let _saveTimer = null;
  let _scriptUrl = ''; // set after first localStorage read

  // ── localStorage shim (always available as bootstrap) ──
  const ls = {
    get: (k, fb='') => { try { const v=localStorage.getItem(k); return v===null?fb:v; } catch(e){ return fb; } },
    set: (k, v) => { try { localStorage.setItem(k,v); } catch(e){} },
    getJ: (k, fb={}) => { try { const r=localStorage.getItem(k); return r?JSON.parse(r):fb; } catch(e){ return fb; } },
    setJ: (k, v) => { try { localStorage.setItem(k,JSON.stringify(v)); } catch(e){} },
    clear: () => { try { localStorage.clear(); } catch(e){} }
  };

  // ── Drive API via Apps Script ──
  async function driveGet(url) {
    if (!url) return null;
    try {
      const r = await fetch(url + '?action=loadConfig', { method:'GET' });
      const j = await r.json();
      if (j && j.config) return j.config;
      return null;
    } catch(e) { return null; }
  }
  async function driveSave(url, cfg) {
    if (!url) return;
    try {
      await fetch(url, {
        method:'POST',
        body: JSON.stringify({ action:'saveConfig', config: cfg })
      });
    } catch(e) { /* silent — localStorage already updated */ }
  }

  // ── Config helpers ──
  function defaults() {
    return {
      url: ls.get('bt_url',''),
      budget: parseFloat(ls.get('bt_budget','1800')),
      startDay: parseInt(ls.get('bt_startday','10')),
      catBudgets: ls.getJ('bt_catb', {}),
      recurring: ls.getJ('bt_recurring', []),
      insightProfile: ls.getJ('bt_ins_profile', {})
    };
  }
  function applyToLS(cfg) {
    ls.set('bt_url', cfg.url||'');
    ls.set('bt_budget', cfg.budget||1800);
    ls.set('bt_startday', cfg.startDay||10);
    ls.setJ('bt_catb', cfg.catBudgets||{});
    ls.setJ('bt_recurring', cfg.recurring||[]);
    ls.setJ('bt_ins_profile', cfg.insightProfile||{});
  }

  // ── Public API ──
  return {
    // Called once on startup — loads from Drive if URL is known
    async load() {
      _cache = defaults(); // start with localStorage values
      _scriptUrl = _cache.url;
      if (_scriptUrl) {
        showConfigStatus('syncing');
        const remote = await driveGet(_scriptUrl);
        if (remote) {
          _cache = { ...defaults(), ...remote };
          applyToLS(_cache); // keep localStorage in sync
        } else {
          // First time — push existing localStorage config to Drive
          await driveSave(_scriptUrl, _cache);
        }
        showConfigStatus('synced');
      }
      return _cache;
    },

    // Get a config value (synchronous — from cache)
    get(key, fallback=null) {
      if (_cache && _cache[key] !== undefined) return _cache[key];
      return fallback;
    },

    // Update one or more keys and schedule a Drive save
    set(updates) {
      if (!_cache) _cache = defaults();
      Object.assign(_cache, updates);
      applyToLS(_cache); // immediate localStorage write
      _scriptUrl = _cache.url || _scriptUrl;
      // Debounced Drive save (500ms)
      clearTimeout(_saveTimer);
      _saveTimer = setTimeout(() => {
        if (_scriptUrl) {
          showConfigStatus('saving');
          driveSave(_scriptUrl, _cache)
            .then(() => showConfigStatus('synced'))
            .catch(() => showConfigStatus(''));
        }
      }, 500);
    },

    // Full reset
    clear() {
      _cache = null;
      ls.clear();
    },

    // Raw localStorage access (for migration / backup use)
    ls
  };
})();

// Status badge in header
function showConfigStatus(state) {
  const el = document.getElementById('cfg-status');
  if (!el) return;
  if (state === 'saving')  { el.textContent = '↑ saving…';  el.className = 'cfg-status saving'; }
  else if (state === 'synced') { el.textContent = '✓ synced';  el.className = 'cfg-status synced'; setTimeout(()=>{ if(el.textContent==='✓ synced') el.textContent=''; el.className='cfg-status'; }, 3000); }
  else if (state === 'syncing') { el.textContent = '↻ syncing'; el.className = 'cfg-status saving'; }
  else { el.textContent = ''; el.className = 'cfg-status'; }
}

// Legacy shim so existing code using App.storage still works
const App = {
  storage: {
    get: (k, fb='') => DriveConfig.ls.get(k, fb),
    set: (k, v)     => DriveConfig.ls.set(k, v),
    getJSON: (k, fb={}) => DriveConfig.ls.getJ(k, fb),
    setJSON: (k, v) => DriveConfig.ls.setJ(k, v),
    clear: ()       => DriveConfig.clear()
  }
};


// ═══════════════════════════════════════
//  CATEGORIES
// ═══════════════════════════════════════
const CATS = [
  { id:'groceries', name:'Groceries',     icon:'🛒', color:'#4ade80', bg:'rgba(74,222,128,.13)'  },
  { id:'lunches',   name:'Lunches',       icon:'🥗', color:'#60a5fa', bg:'rgba(96,165,250,.13)'  },
  { id:'transport', name:'Transport',     icon:'🚆', color:'#fbbf24', bg:'rgba(251,191,36,.13)'  },
  { id:'running',   name:'Running',       icon:'👟', color:'#f472b6', bg:'rgba(244,114,182,.13)' },
  { id:'hobbies',   name:'Hobbies',       icon:'♟',  color:'#a78bfa', bg:'rgba(167,139,250,.13)' },
  { id:'health',    name:'Health',        icon:'💊', color:'#34d399', bg:'rgba(52,211,153,.13)'  },
  { id:'media',     name:'Media & Subs',  icon:'📱', color:'#fb923c', bg:'rgba(251,146,60,.13)'  },
  { id:'travel',    name:'Travel',        icon:'✈️', color:'#38bdf8', bg:'rgba(56,189,248,.13)'  },
  { id:'extras',    name:'Extras',        icon:'🎁', color:'#f87171', bg:'rgba(248,113,113,.13)' },
  { id:'refund',    name:'Refund/Income', icon:'💚', color:'#4ade80', bg:'rgba(74,222,128,.13)'  },
];
function catById(id){ return CATS.find(c=>c.id===id)||{name:id||'—',icon:'·',color:'#62627a',bg:'rgba(98,98,122,.12)'}; }

// ═══════════════════════════════════════
//  STATE
// ═══════════════════════════════════════
const S = { url:'', budget:1800, startDay:10, sheet:'', cc:[], dd:[], stats:{}, spreadsheetUrl:'' };

function persist(){
  DriveConfig.set({ url: S.url, budget: S.budget, startDay: S.startDay });
}
function restore(){
  S.url      = DriveConfig.get('url', '');
  S.budget   = parseFloat(DriveConfig.get('budget', 1800));
  S.startDay = parseInt(DriveConfig.get('startDay', 10));
}
function getCatBudgets(){ return DriveConfig.get('catBudgets', {}); }
function saveCatBudgets(){
  const b={};
  CATS.forEach(c=>{ const el=document.getElementById('cbi-'+c.id); if(el) b[c.id]=parseFloat(el.value)||0; });
  DriveConfig.set({ catBudgets: b });
  renderCatDetail(); renderDashCats();
  toast('Category budgets saved ✓');
}

// ═══════════════════════════════════════
//  PERIOD
// ═══════════════════════════════════════
const ABBR=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function currentSheet(){
  const n=new Date(); let m=n.getMonth(),y=n.getFullYear();
  if(n.getDate()<S.startDay){m--;if(m<0){m=11;y--;}}
  return String(y).slice(-2)+'.'+ABBR[m];
}
function periodBounds(name){
  const [yy,mon]=name.split('.');
  const mi=ABBR.indexOf(mon), yr=2000+parseInt(yy);
  const start=new Date(yr,mi,S.startDay), end=new Date(yr,mi+1,S.startDay);
  const now=new Date();
  const total=Math.round((end-start)/86400000);
  const passed=Math.max(0,Math.min(total,Math.round((now-start)/86400000)));
  const fmt=d=>d.toLocaleDateString('en-CH',{day:'2-digit',month:'short'});
  return {start,end,total,passed,left:total-passed,label:fmt(start)+' → '+fmt(end)};
}

// ═══════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════
let _tt;
function toast(msg,type='s',dur=2800){
  const el=document.getElementById('toast');
  el.className='show '+type;
  el.innerHTML=type==='l'?`<div class="spin"></div>${msg}`:msg;
  clearTimeout(_tt);
  if(type!=='l') _tt=setTimeout(()=>el.classList.remove('show'),dur);
}
function hideToast(){ document.getElementById('toast').classList.remove('show'); }

// ═══════════════════════════════════════
//  NAV
// ═══════════════════════════════════════
const VIEWS=['setup','dashboard','credit','debit','categories','monthly','insights','settings'];
const TABS=document.querySelectorAll('.tab');
const NAV_MAP=['dashboard','credit','debit','categories','monthly','insights','settings'];

function go(name){
  VIEWS.forEach(v=>{ const el=document.getElementById('v-'+v); if(el) el.classList.remove('on'); });
  const t=document.getElementById('v-'+name); if(t) t.classList.add('on');
  TABS.forEach(t=>t.classList.remove('on'));
  const idx=NAV_MAP.indexOf(name); if(idx>=0) TABS[idx].classList.add('on');
  // sync mobile nav
  const mBtns=document.querySelectorAll('.mnav-btn');
  mBtns.forEach(b=>b.classList.remove('on'));
  const mIdx=NAV_MAP.indexOf(name); if(mIdx>=0&&mBtns[mIdx]) mBtns[mIdx].classList.add('on');
  // scroll to top on page change
  window.scrollTo({top:0,behavior:'smooth'});
  if(name==='insights'){ loadInsightProfile(); renderInsights(); }
}

// ═══════════════════════════════════════
//  API — no Content-Type header on fetch
// ═══════════════════════════════════════
async function apiGet(p){
  const r=await fetch(S.url+'?'+new URLSearchParams(p));
  if(!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}
async function apiPost(body){
  const r=await fetch(S.url,{method:'POST',body:JSON.stringify(body)});
  if(!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}

// ═══════════════════════════════════════
//  STATUS
// ═══════════════════════════════════════
function setStatus(st){
  document.getElementById('dot').className='dot'+(st==='ok'?' on':st==='err'?' err':'');
  document.getElementById('stxt').textContent=st==='ok'?'Connected':st==='err'?'Error':'Not connected';
}

// ═══════════════════════════════════════
//  SETUP / SETTINGS
// ═══════════════════════════════════════
function setup(){
  const url=document.getElementById('s-url').value.trim();
  if(!url){toast('Please enter the Apps Script URL','e');return;}
  S.url=url;
  S.budget=parseFloat(document.getElementById('s-budget').value)||1800;
  S.startDay=parseInt(document.getElementById('s-startday').value)||10;
  persist(); init();
}
function saveSettings(){
  S.url=document.getElementById('cfg-url').value.trim();
  S.budget=parseFloat(document.getElementById('cfg-budget').value)||1800;
  S.startDay=parseInt(document.getElementById('cfg-startday').value)||10;
  persist(); init();
}
function resetApp(){ if(!confirm('Reset all settings?')) return; App.storage.clear(); location.reload(); }

function copyScript(){
  const txt=document.getElementById('appsScriptCode').textContent;
  navigator.clipboard.writeText(txt).then(()=>toast('Script copied ✓')).catch(()=>toast('Copy failed','e'));
}

// ═══════════════════════════════════════
//  SYNC
// ═══════════════════════════════════════
async function syncAll(){
  toast('Syncing…','l');
  document.getElementById('dot').className='dot syncing';
  try{
    S.sheet=currentSheet();
    const [d,m]=await Promise.all([
      apiGet({action:'getData',sheet:S.sheet}),
      apiGet({action:'getMonthly'})
    ]);
    if(d.error) throw new Error(d.error);
    S.cc=ensureClientIds(d.cc||[], 'cc'); S.dd=ensureClientIds(d.dd||[], 'dd'); S.stats=d.stats||{};
    if(d.spreadsheetUrl){
      S.spreadsheetUrl=d.spreadsheetUrl;
      const l=document.getElementById('sheetLnk');
      l.href=d.spreadsheetUrl; l.style.display='';
    }
    if(!m.error&&m.data) renderMonthly(m.data);
    setStatus('ok'); renderAll(); hideToast(); toast('Synced ✓');
  }catch(err){
    setStatus('err'); hideToast(); toast('Sync failed: '+err.message,'e');
  }
}
async function syncMonthly(){
  toast('Loading…','l');
  try{
    const m=await apiGet({action:'getMonthly'});
    if(m.error) throw new Error(m.error);
    renderMonthly(m.data||[]); hideToast(); toast('Updated ✓');
  }catch(err){ hideToast(); toast(err.message,'e'); }
}

// ═══════════════════════════════════════
//  ADD / DELETE
// ═══════════════════════════════════════
async function addExp(type){
  const p=type==='CC'?'cc':'dd';
  clearFormError(p);
  const date=document.getElementById(p+'-date').value;
  const desc=document.getElementById(p+'-desc').value.trim();
  const cat =document.getElementById(p+'-cat').value;
  const rawAmt=parseFloat(document.getElementById(p+'-amt').value);
  const entryType=document.getElementById(p+'-type').value;
  const amt=entryType==='refund'?-Math.abs(rawAmt):Math.abs(rawAmt);
  if(!date){ showFormError(p,'Please enter a date','date'); return; }
  if(!desc){ showFormError(p,'Please enter a description','desc'); return; }
  if(!cat){ showFormError(p,'Please choose a category','cat'); return; }
  if(isNaN(rawAmt)||rawAmt===0){ showFormError(p,'Please enter a non-zero amount','amt'); return; }
  const btn=document.getElementById(p+'-btn'); btn.disabled=true; toast('Saving…','l');
  try{
    const res=await apiPost({action:'addExpense',sheet:S.sheet,type,date,desc,cat,amount:amt,budget:S.budget});
    if(res.error) throw new Error(res.error);
    S.cc=ensureClientIds(res.cc||S.cc, 'cc'); S.dd=ensureClientIds(res.dd||S.dd, 'dd'); S.stats=res.stats||S.stats;
    document.getElementById(p+'-desc').value='';
    document.getElementById(p+'-amt').value='';
    renderAll(); hideToast(); toast('Added ✓');
  }catch(err){ hideToast(); toast(err.message,'e'); }
  finally{ btn.disabled=false; }
}

let _pendingDel={type:null,row:null,timer:null};
let _lastDeleted=null;
async function delExp(type,row){
  const btn=event.currentTarget;
  if(_pendingDel.type===type&&_pendingDel.row===row){
    clearTimeout(_pendingDel.timer);
    _pendingDel={type:null,row:null,timer:null};
    btn.textContent='×'; btn.style.color=''; btn.classList.remove('armed');
  } else {
    if(_pendingDel.timer) clearTimeout(_pendingDel.timer);
    _pendingDel={type,row,timer:setTimeout(()=>{
      _pendingDel={type:null,row:null,timer:null};
      document.querySelectorAll('.del-btn.armed').forEach(b=>{b.textContent='×';b.classList.remove('armed');b.style.color='';});
    },2500)};
    btn.textContent='?'; btn.style.color='var(--red)'; btn.classList.add('armed');
    return;
  }
  const source = type==='CC' ? (S.cc||[]) : (S.dd||[]);
  const target = source.find(e => Number(e.row)===Number(row));
  if(target) _lastDeleted = { ...target, type };
  toast('Deleting…','l');
  try{
    const res=await apiPost({action:'deleteExpense',sheet:S.sheet,type,row});
    if(res.error) throw new Error(res.error);
    S.cc=ensureClientIds(res.cc||S.cc, 'cc'); S.dd=ensureClientIds(res.dd||S.dd, 'dd'); S.stats=res.stats||S.stats;
    renderAll(); hideToast();
    if(_lastDeleted){
      toastWithUndo('Deleted entry', async ()=>{
        try{
          const restore=await apiPost({action:'addExpense',sheet:S.sheet,type:_lastDeleted.type,date:_lastDeleted.date,desc:_lastDeleted.desc,cat:_lastDeleted.cat,amount:_lastDeleted.amount,budget:S.budget});
          if(restore.error) throw new Error(restore.error);
          S.cc=ensureClientIds(restore.cc||S.cc, 'cc'); S.dd=ensureClientIds(restore.dd||S.dd, 'dd'); S.stats=restore.stats||S.stats;
          renderAll(); hideToast(); toast('Restored ✓');
          _lastDeleted=null;
        }catch(err){ hideToast(); toast('Undo failed: '+err.message,'e'); }
      });
    } else { toast('Deleted ✓'); }
  }catch(err){ hideToast(); toast(err.message,'e'); }
}

// ═══════════════════════════════════════
//  RENDER
// ═══════════════════════════════════════
function chf(n){
  const v=parseFloat(n)||0;
  const s=Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,"'");
  return (v<0?'-':'')+'CHF '+s;
}

function eRowHTML(e,type){
  const neg=e.amount<0;
  const c=e.cat?catById(e.cat):null;
  const chip=c&&e.cat?`<span class="cat-chip" style="background:${c.bg};color:${c.color}">${c.icon} ${c.name}</span>`:'';
  const safeDesc=e.desc.replace(/'/g,"&#39;").replace(/"/g,'&quot;');
  return `<div class="erow">
    <span class="edate">${(e.date||'').slice(5)}</span>
    <span class="edesc"><span class="edesc-txt" title="${e.desc}">${e.desc}</span>${chip}</span>
    <span class="eamt ${neg?'cr':''}">${parseFloat(e.amount).toFixed(2)}</span>
    <span class="erun">${parseFloat(e.running).toFixed(2)}</span>
    <span class="edel">
      <button class="edit-btn" onclick="openEdit('${type}',${e.row},'${e.date||''}','${safeDesc}','${e.cat||''}',${parseFloat(e.amount)})">✎</button>
      <button class="del-btn" onclick="delExp('${type}',${e.row})">×</button>
    </span>
  </div>`;
}

function catSpending(){
  // Returns NET per category — refunds (negative amounts) reduce the total
  const map={};
  [...S.cc,...S.dd].forEach(e=>{
    const k=e.cat||'extras';
    if(!map[k]) map[k]=0;
    map[k]+=parseFloat(e.amount)||0;  // include negatives
  });
  return map;
}

// ═══════════════════════════════════════
//  CATEGORY FILTER STATE
// ═══════════════════════════════════════
let _activeCatFilter = null; // null = all, cat.id = filtered
let _expandedCat = null;     // cat.id shown in categories drawer

function setDashCatFilter(catId){
  _activeCatFilter = catId;
  renderDashCats();
  renderLists();
  renderCharts();
  // update pill styles
  document.querySelectorAll('.cat-pill').forEach(p=>{
    p.classList.toggle('active', p.dataset.cat===(catId||'all'));
  });
}

function buildCatFilterBar(){
  const bar = document.getElementById('dash-cat-filter');
  if(!bar) return;
  const spent = catSpending();
  const activeCats = CATS.filter(c => (spent[c.id]||0)!==0 || (getCatBudgets()[c.id]||0)>0);
  if(!activeCats.length){ bar.innerHTML=''; return; }
  bar.innerHTML = `<button class="cat-pill all${!_activeCatFilter?' active':''}" data-cat="all" onclick="setDashCatFilter(null)">All</button>`
    + activeCats.map(c=>`<button class="cat-pill${_activeCatFilter===c.id?' active':''}" data-cat="${c.id}" style="color:${c.color}" onclick="setDashCatFilter('${c.id}')">${c.icon} ${c.name}</button>`).join('');
}


function clearFormError(prefix){ const box=document.getElementById(prefix+'-form-error'); if(box) box.textContent=''; ['date','desc','cat','amt'].forEach(k=>{ const el=document.getElementById(prefix+'-'+k); if(el) el.classList.remove('input-error'); }); }
function showFormError(prefix,msg,field){ const box=document.getElementById(prefix+'-form-error'); if(box) box.textContent=msg; if(field){ const el=document.getElementById(prefix+'-'+field); if(el){ el.classList.add('input-error'); el.focus(); } } }
function ensureClientIds(list, prefix){ return (list||[]).map((item, index)=>({ ...item, clientId: item.clientId || `${prefix}-${item.row || index}-${String(item.date||'').slice(0,10)}-${String(item.desc||'').slice(0,12)}` })); }
function syncClientIds(){ S.cc = ensureClientIds(S.cc, 'cc'); S.dd = ensureClientIds(S.dd, 'dd'); }
function getRecurringTemplates(){ return DriveConfig.get('recurring', []); }
function saveRecurringTemplates(list){ DriveConfig.set({ recurring: list }); }
function saveRecurringFromForm(type){ const p=type==='CC'?'cc':'dd'; const desc=document.getElementById(p+'-desc').value.trim(); const cat=document.getElementById(p+'-cat').value; const rawAmt=parseFloat(document.getElementById(p+'-amt').value); const entryType=document.getElementById(p+'-type').value; if(!desc || !cat || isNaN(rawAmt) || rawAmt===0){ showFormError(p,'Fill description, category, and amount before saving recurring','desc'); return; } const amount=entryType==='refund' ? -Math.abs(rawAmt) : Math.abs(rawAmt); const list=getRecurringTemplates(); list.push({ id: Date.now(), type, desc, cat, amount, entryType }); saveRecurringTemplates(list); renderRecurringTemplates(); toast('Recurring entry saved ✓'); }
function removeRecurringTemplate(id){ const list=getRecurringTemplates().filter(x=>String(x.id)!==String(id)); saveRecurringTemplates(list); renderRecurringTemplates(); toast('Recurring entry removed'); }
function renderRecurringTemplates(){ const el=document.getElementById('recurring-list'); if(!el) return; const list=getRecurringTemplates(); if(!list.length){ el.innerHTML='<div class="empty">No recurring entries saved yet</div>'; return; } el.innerHTML=list.map(item=>{ const c=catById(item.cat); return `<div class="rec-row"><div class="rec-meta"><div class="rec-title">${item.type} · ${item.desc}</div><div class="rec-sub">${c.icon} ${c.name} · ${chf(item.amount)}</div></div><button class="btn btn-r" type="button" onclick="removeRecurringTemplate('${item.id}')">Remove</button></div>`; }).join(''); }
function sameDay(a,b){ return String(a||'').slice(0,10)===String(b||'').slice(0,10); }
function allTransactions(){ const cc = (S.cc||[]).map(x => ({ ...x, account: 'CC' })); const dd = (S.dd||[]).map(x => ({ ...x, account: 'DD' })); return [...cc, ...dd].sort((a,b)=> String(a.date||'').localeCompare(String(b.date||''))); }
function hasMatchingTransaction(item, dateOverride=''){ const date = dateOverride || new Date().toISOString().slice(0,10); return allTransactions().some(x => String(x.account||x.type||'')===String(item.type||'') && sameDay(x.date, date) && String(x.desc||'').trim().toLowerCase()===String(item.desc||'').trim().toLowerCase() && String(x.cat||'')===String(item.cat||'') && Number(x.amount||0)===Number(item.amount||0)); }
async function applyRecurringTemplates(){ const list=getRecurringTemplates(); if(!list.length){ toast('No recurring entries saved yet','e'); return; } toast('Applying recurring entries…','l'); try{ for(const item of list){ const today=new Date().toISOString().slice(0,10); if(hasMatchingTransaction(item, today)) continue; const res=await apiPost({action:'addExpense',sheet:S.sheet,type:item.type,date:today,desc:item.desc,cat:item.cat,amount:item.amount,budget:S.budget}); if(res.error) throw new Error(res.error); S.cc=ensureClientIds(res.cc||S.cc, 'cc'); S.dd=ensureClientIds(res.dd||S.dd, 'dd'); S.stats=res.stats||S.stats; } renderAll(); hideToast(); toast('Recurring entries applied ✓'); }catch(err){ hideToast(); toast('Recurring apply failed: '+err.message,'e'); } }
function downloadFile(filename, content, type='text/plain;charset=utf-8'){ const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url), 500); }
function exportTransactionsCSV(){ const rows = allTransactions(); if(!rows.length){ toast('Nothing to export yet','e'); return; } const headers = ['account','date','desc','cat','amount','running','row']; const esc = v => '"' + String(v ?? '').replace(/"/g, '""') + '"'; const csv = [headers.join(',')].concat(rows.map(r => headers.map(h => esc(r[h])).join(','))).join('\n'); downloadFile(`budget-transactions-${S.sheet||'export'}.csv`, csv, 'text/csv;charset=utf-8'); toast('CSV exported ✓'); }
function exportBackupJSON(){ const backup = { exportedAt: new Date().toISOString(), period: S.sheet || currentSheet(), settings: { url: S.url, budget: S.budget, startDay: S.startDay, spreadsheetUrl: S.spreadsheetUrl || '' }, categoryBudgets: getCatBudgets(), insightProfile: DriveConfig.get('insightProfile', {}), transactions: allTransactions(), stats: S.stats || {} }; downloadFile(`budget-backup-${S.sheet||'export'}.json`, JSON.stringify(backup, null, 2), 'application/json;charset=utf-8'); toast('Backup exported ✓'); }
async function importBackupJSON(event){ const file = event.target.files && event.target.files[0]; if(!file){ return; } try{ const text = await file.text(); const data = JSON.parse(text); let added = 0, skipped = 0; if(data.settings){ if(data.settings.url) S.url = data.settings.url; if(data.settings.budget) S.budget = parseFloat(data.settings.budget) || S.budget; if(data.settings.startDay) S.startDay = parseInt(data.settings.startDay) || S.startDay; persist(); } if(data.categoryBudgets) DriveConfig.set({ catBudgets: data.categoryBudgets }); if(data.insightProfile) DriveConfig.set({ insightProfile: data.insightProfile }); if(Array.isArray(data.transactions) && data.transactions.length){ toast('Importing backup…','l'); for(const item of data.transactions){ const type = item.account || item.type; if(!type){ skipped++; continue; } if(hasMatchingTransaction({type, desc:item.desc, cat:item.cat, amount:item.amount}, item.date)){ skipped++; continue; } const res = await apiPost({action:'addExpense',sheet:S.sheet,type,date:(item.date||new Date().toISOString().slice(0,10)),desc:item.desc||'',cat:item.cat||'',amount:item.amount||0,budget:S.budget}); if(res.error) throw new Error(res.error); S.cc=ensureClientIds(res.cc||S.cc, 'cc'); S.dd=ensureClientIds(res.dd||S.dd, 'dd'); S.stats=res.stats||S.stats; added++; } } document.getElementById('cfg-url').value=S.url; document.getElementById('cfg-budget').value=S.budget; document.getElementById('cfg-startday').value=S.startDay; document.getElementById('about-startday').textContent=S.startDay+'th'; renderRecurringTemplates(); renderAll(); hideToast(); toast(`Backup imported ✓ Added ${added}, skipped ${skipped}`); }catch(err){ hideToast(); toast('Import failed: '+err.message,'e'); } finally{ event.target.value=''; } }
function toastWithUndo(msg, undoFn, dur=5000){ const el=document.getElementById('toast'); el.className='show s'; el.innerHTML=''; const span=document.createElement('span'); span.textContent=msg; const btn=document.createElement('button'); btn.className='toast-action'; btn.type='button'; btn.textContent='Undo'; btn.onclick=()=>{ clearTimeout(_tt); undoFn(); }; el.append(span, btn); clearTimeout(_tt); _tt=setTimeout(()=>el.classList.remove('show'),dur); }

function renderAll(){ renderDash(); renderLists(); renderDashCats(); renderCatDetail(); renderCharts(); refreshSuggestions(); if(document.getElementById('v-insights').classList.contains('on')) renderInsights(); }

function renderDash(){
  const st=S.stats, budget=st.budget||S.budget, total=st.total||0;
  const ccT=st.ccTotal||0, ddT=st.ddTotal||0;
  const remain=budget-total, saving=budget-total;
  const pd=periodBounds(S.sheet);

  document.getElementById('p-dates').textContent=pd.label;
  document.getElementById('p-sheet').textContent=S.sheet;
  document.getElementById('p-days').textContent=pd.passed+' / '+pd.total+' days';

  const pct=pd.total?Math.min(100,pd.passed/pd.total*100):0;
  const pf=document.getElementById('prog');
  pf.style.width=pct+'%';
  pf.className='prog-f'+(pct>90?' r':pct>70?' a':'');
  document.getElementById('prog-lbl').textContent=pd.passed+' days passed · '+pd.left+' remaining';
  const hintTxt='Period: '+pd.label;
  ['cc-period-hint','dd-period-hint'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=hintTxt;});

  document.getElementById('k-budget').textContent=chf(budget);
  document.getElementById('k-budget-d').textContent=chf(budget/(pd.total||30))+' /day';

  document.getElementById('k-spent').textContent=chf(total);
  document.getElementById('k-spent').className='kpi-val '+(total>budget?'r':'a');
  document.getElementById('k-spent-p').textContent=(budget?(total/budget*100).toFixed(1):0)+'% of budget';
  document.getElementById('kc-spent').className='kpi '+(total>budget?'r':'a');

  document.getElementById('k-remain').textContent=chf(remain);
  document.getElementById('k-remain').className='kpi-val '+(remain<0?'r':'g');
  document.getElementById('k-remain-d').textContent=chf(pd.left>0?remain/pd.left:0)+' /day left';
  document.getElementById('kc-remain').className='kpi '+(remain<0?'r':'g');

  document.getElementById('k-saving').textContent=chf(saving);
  document.getElementById('k-saving').className='kpi-val '+(saving<0?'r':'g');
  document.getElementById('kc-saving').className='kpi '+(saving<0?'r':'g');

  document.getElementById('k-cc').textContent=chf(ccT);
  document.getElementById('k-cc-d').textContent=chf(pd.passed>0?ccT/pd.passed:0)+' /day';
  document.getElementById('k-dd').textContent=chf(ddT);
  document.getElementById('b-cc').textContent=S.cc.length;
  document.getElementById('b-dd').textContent=S.dd.length;
  document.getElementById('cc-count').textContent=S.cc.length;
  document.getElementById('dd-count').textContent=S.dd.length;

  // ── PROJECTION ──
  const dailyRate = pd.passed > 0 ? total / pd.passed : 0;
  const projTotal = dailyRate * pd.total;
  const projSaving = budget - projTotal;
  const overBudget = projTotal > budget;
  const nearBudget = projTotal > budget * 0.9;

  document.getElementById('proj-daily').textContent = chf(dailyRate) + ' /day (net)';
  document.getElementById('proj-total').textContent = chf(projTotal);
  document.getElementById('proj-saving').textContent = chf(projSaving);

  const badge = document.getElementById('proj-badge');
  if (overBudget) {
    badge.className = 'proj-badge over';
    badge.textContent = 'Over budget';
  } else if (nearBudget) {
    badge.className = 'proj-badge warn';
    badge.textContent = 'Watch spending';
  } else {
    badge.className = 'proj-badge ok';
    badge.textContent = 'On track';
  }
}

// ═══════════════════════════════════════
//  EDIT MODAL
// ═══════════════════════════════════════
let _editCtx={type:null,row:null};
let _lastFocus=null;

function openEdit(type,row,date,desc,cat,amount){
  _lastFocus=document.activeElement;
  _editCtx={type,row};
  document.getElementById('edit-date').value=date;
  document.getElementById('edit-desc').value=desc;
  document.getElementById('edit-amt').value=amount;
  // populate cat select
  const sel=document.getElementById('edit-cat');
  sel.innerHTML='<option value="">— no category —</option>'+CATS.map(c=>`<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
  sel.value=cat||'';
  // populate suggestions for edit modal from all entries
  updateSuggestions('desc-suggestions', [...S.cc,...S.dd].map(e=>e.desc));
  const modal=document.getElementById('editModal');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
  document.getElementById('edit-desc').focus();
}

function closeEditModal(){
  const modal=document.getElementById('editModal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden','true');
  if(_lastFocus&&_lastFocus.focus) _lastFocus.focus();
}

document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeEditModal(); });

async function saveEdit(){
  const date=document.getElementById('edit-date').value;
  const desc=document.getElementById('edit-desc').value.trim();
  const cat =document.getElementById('edit-cat').value;
  const amt =parseFloat(document.getElementById('edit-amt').value);
  if(!date){ toast('Please enter a date','e'); document.getElementById('edit-date').focus(); return; }
  if(!desc){ toast('Please enter a description','e'); document.getElementById('edit-desc').focus(); return; }
  if(isNaN(amt)||amt===0){ toast('Please enter a non-zero amount','e'); document.getElementById('edit-amt').focus(); return; }
  toast('Saving…','l');
  try{
    const res=await apiPost({action:'editExpense',sheet:S.sheet,type:_editCtx.type,row:_editCtx.row,date,desc,cat,amount:amt,budget:S.budget});
    if(res.error) throw new Error(res.error);
    S.cc=ensureClientIds(res.cc||S.cc, 'cc'); S.dd=ensureClientIds(res.dd||S.dd, 'dd'); S.stats=res.stats||S.stats;
    closeEditModal();
    renderAll(); hideToast(); toast('Updated ✓');
  }catch(err){ hideToast(); toast(err.message,'e'); }
}

function updateSuggestions(listId, descs){
  const uniq=[...new Set(descs.filter(Boolean))].sort();
  const dl=document.getElementById(listId);
  if(dl) dl.innerHTML=uniq.map(d=>`<option value="${d.replace(/"/g,'&quot;')}">`).join('');
}

function refreshSuggestions(){
  updateSuggestions('cc-desc-list', S.cc.map(e=>e.desc));
  updateSuggestions('dd-desc-list', S.dd.map(e=>e.desc));
}

function filterList(type){
  const q=(document.getElementById(type+'-search')||{}).value||'';
  const term=q.toLowerCase();
  const items=type==='cc'?[...S.cc].reverse():[...S.dd].reverse();
  const filtered=term?items.filter(e=>(e.desc||'').toLowerCase().includes(term)):items;
  const el=document.getElementById(type+'-list');
  if(el) el.innerHTML=filtered.length?filtered.map(e=>eRowHTML(e,type.toUpperCase())).join(''):'<div class="empty">No matches</div>';
}

function renderLists(){
  const fill=(id,items,type,max)=>{
    const el=document.getElementById(id);
    const slice=max?items.slice(0,max):items;
    el.innerHTML=slice.length?slice.map(e=>eRowHTML(e,type)).join(''):'<div class="empty">No entries yet</div>';
  };
  const catF=_activeCatFilter;
  const ccR=[...S.cc].filter(e=>!catF||e.cat===catF).reverse();
  const ddR=[...S.dd].filter(e=>!catF||e.cat===catF).reverse();
  fill('dash-cc',ccR,'CC',8); fill('dash-dd',ddR,'DD',8);
  // respect active search filters
  const ccQ=(document.getElementById('cc-search')||{}).value||'';
  const ddQ=(document.getElementById('dd-search')||{}).value||'';
  if(ccQ) filterList('cc'); else fill('cc-list',[...S.cc].reverse(),'CC');
  if(ddQ) filterList('dd'); else fill('dd-list',[...S.dd].reverse(),'DD');
}

function renderDashCats(){
  const spent=catSpending(), budgets=getCatBudgets();
  const pd=periodBounds(S.sheet);
  const el=document.getElementById('dash-cat-grid');
  const active=CATS.filter(c=>(spent[c.id]||0)!==0||(budgets[c.id]||0)>0);
  buildCatFilterBar();
  if(!active.length){el.innerHTML='<div style="color:var(--muted);font-family:var(--font-mono);font-size:12px">Add expenses to see breakdown</div>';return;}
  el.innerHTML=active.map(c=>{
    const s=spent[c.id]||0, b=budgets[c.id]||0;
    const net=Math.max(0,s); // for bar display use positive
    const pct=b>0?Math.min(100,net/b*100):0;
    const bc=pct>90?'#f87171':pct>70?'#fbbf24':c.color;
    const remaining=b>0?b-net:null;
    const daysLeft=pd.left>0?pd.left:1;
    const perDay=remaining!==null?(remaining/daysLeft):null;
    const perDayTxt=perDay!==null
      ?(perDay>=0
        ?`<span style="color:var(--muted);font-size:10px">${chf(perDay)}/day left</span>`
        :`<span style="color:var(--red);font-size:10px">over by ${chf(Math.abs(remaining))}</span>`)
      :'';
    const isFiltered = _activeCatFilter && _activeCatFilter!==c.id;
    return `<div class="cat-card" style="${isFiltered?'opacity:.35;':''}${_activeCatFilter===c.id?'border-color:'+c.color+';':''}" onclick="setDashCatFilter(_activeCatFilter===c.id?null:'${c.id}')">
      <div class="cat-card-head">
        <div class="cat-card-name"><span>${c.icon}</span>${c.name}</div>
        ${b>0?`<span style="font-family:var(--font-mono);font-size:10px;color:var(--muted)">${pct.toFixed(0)}%</span>`:''}
      </div>
      ${b>0?`<div class="cat-bar-track"><div class="cat-bar-fill" style="width:${pct}%;background:${bc}"></div></div>`:''}
      <div class="cat-card-nums">
        <span style="color:${s<0?'var(--green)':c.color};font-weight:500">${chf(s)}</span>
        <span style="color:var(--muted)">${b>0?'of '+chf(b):'no budget set'}</span>
      </div>
      ${b>0?`<div style="margin-top:5px">${perDayTxt}</div>`:''}
    </div>`;
  }).join('');
}

function openCatDrawer(catId){
  const c=catById(catId);
  const entries=[...S.cc,...S.dd].filter(e=>e.cat===catId).sort((a,b)=>b.date.localeCompare(a.date));
  const drawer=document.getElementById('cat-detail-drawer');
  // toggle
  if(_expandedCat===catId){ _expandedCat=null; drawer.classList.remove('open'); document.querySelectorAll('#cat-detail-grid .cat-card').forEach(el=>el.classList.remove('expanded')); return; }
  _expandedCat=catId;
  document.querySelectorAll('#cat-detail-grid .cat-card').forEach(el=>el.classList.remove('expanded'));
  document.querySelector(`#cat-detail-grid .cat-card[data-catid="${catId}"]`)?.classList.add('expanded');
  const total=entries.reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
  drawer.innerHTML=`
    <div style="padding:10px 14px;border-bottom:1px solid var(--b1);display:flex;align-items:center;justify-content:space-between">
      <span style="font-family:var(--font-mono);font-size:11px;font-weight:500;color:${c.color}">${c.icon} ${c.name} — ${entries.length} entries</span>
      <span style="font-family:var(--font-mono);font-size:12px;font-weight:500;color:${total<0?'var(--green)':c.color}">${chf(total)}</span>
    </div>
    <div class="cat-drawer-header"><span>Date</span><span>Description</span><span style="text-align:right">Amount</span></div>
    ${entries.length?entries.map(e=>`
      <div class="cat-drawer-row">
        <span style="font-family:var(--font-mono);font-size:11px;color:var(--muted)">${(e.date||'').slice(5)}</span>
        <span style="font-size:12px;padding:0 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e.desc}</span>
        <span style="font-family:var(--font-mono);font-size:12px;text-align:right;color:${parseFloat(e.amount)<0?'var(--green)':'var(--text)'}">${parseFloat(e.amount).toFixed(2)}</span>
      </div>`).join(''):'<div class="empty">No entries</div>'}
  `;
  drawer.classList.add('open');
  // scroll drawer into view
  drawer.scrollIntoView({behavior:'smooth',block:'nearest'});
}

function renderCatDetail(){
  const spent=catSpending(), budgets=getCatBudgets();
  const el=document.getElementById('cat-detail-grid');
  el.innerHTML=CATS.map(c=>{
    const s=spent[c.id]||0, b=budgets[c.id]||0;
    const pct=b>0?Math.min(100,s/b*100):0;
    const bc=pct>90?'#f87171':pct>70?'#fbbf24':c.color;
    const isExpanded=_expandedCat===c.id;
    return `<div class="cat-card${isExpanded?' expanded':''}" data-catid="${c.id}" onclick="openCatDrawer('${c.id}')">
      <div class="cat-card-head">
        <div class="cat-card-name"><span>${c.icon}</span>${c.name}</div>
        ${b>0?`<span style="font-family:var(--font-mono);font-size:10px;color:var(--muted)">${pct.toFixed(0)}% used</span>`:'<span style="font-family:var(--font-mono);font-size:10px;color:var(--muted)">no limit</span>'}
      </div>
      <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${pct}%;background:${bc}"></div></div>
      <div class="cat-card-nums">
        <span style="color:${s<0?'var(--green)':s>0?c.color:'var(--muted)'};font-weight:500">${chf(s)}</span>
        <span style="color:var(--muted)">${b>0?'limit '+chf(b):'—'}</span>
      </div>
      <div style="margin-top:6px;font-family:var(--font-mono);font-size:9px;color:var(--faint)">click to ${isExpanded?'collapse':'expand'} entries ↓</div>
    </div>`;
  }).join('');
  const il=document.getElementById('cat-settings-list');
  il.innerHTML=CATS.map(c=>`
    <div style="display:flex;align-items:center;gap:10px;background:var(--s2);border:1px solid var(--b1);border-radius:6px;padding:10px 14px">
      <span style="font-size:16px">${c.icon}</span>
      <span style="flex:1;font-size:13px;font-weight:500">${c.name}</span>
      <span style="font-family:var(--font-mono);font-size:11px;color:var(--muted)">CHF</span>
      <input id="cbi-${c.id}" type="number" value="${budgets[c.id]||0}" min="0" step="10"
        style="width:80px;padding:6px 8px;font-size:12px;background:var(--bg);border:1px solid var(--b2);border-radius:5px;color:var(--text);font-family:var(--font-mono)">
    </div>`).join('');
}

function renderMonthly(data){
  _monthlyData=data||[];
  const tb=document.getElementById('monthly-tbody');
  const thead=document.getElementById('monthly-thead');
  if(!data||!data.length){tb.innerHTML='<tr><td colspan="7" class="empty">No data yet</td></tr>';return;}

  const curSpent=catSpending();
  const sorted=[...data].reverse();
  const n=sorted.length;

  // Averages across all periods
  const avg={budget:0,cc:0,dd:0,total:0,saving:0};
  const catAvg={};
  CATS.forEach(c=>{catAvg[c.id]=0;});
  sorted.forEach(r=>{
    avg.budget+=parseFloat(r.budget)||0;
    avg.cc+=parseFloat(r.cc)||0;
    avg.dd+=parseFloat(r.dd)||0;
    avg.total+=parseFloat(r.total)||0;
    avg.saving+=parseFloat(r.saving)||0;
    if(r.period===S.sheet) CATS.forEach(c=>{catAvg[c.id]+=(curSpent[c.id]||0);});
  });
  Object.keys(avg).forEach(k=>avg[k]/=n);
  CATS.forEach(c=>{catAvg[c.id]/=n;});

  // Rebuild thead with category columns
  thead.innerHTML='<tr><th>Period</th><th>Budget</th><th>CC</th><th>Debit</th><th>Total</th><th>vs Budget</th><th>Saving</th>'
    +CATS.map(c=>'<th>'+c.icon+' '+c.name+'</th>').join('')+'</tr>';

  // Averages row
  const avgVsB=avg.total-avg.budget;
  const avgCatCols=CATS.map(c=>{const v=catAvg[c.id];return '<td class="num" style="color:'+c.color+';opacity:.7">'+(v>0?chf(v):'—')+'</td>';}).join('');
  const avgRow='<tr style="background:rgba(96,165,250,.06);border-bottom:2px solid var(--b2)">'
    +'<td><span class="chip" style="background:rgba(96,165,250,.18);color:var(--blue)">×'+n+' avg</span></td>'
    +'<td class="num" style="color:var(--muted)">'+chf(avg.budget)+'</td>'
    +'<td class="num" style="color:var(--muted)">'+chf(avg.cc)+'</td>'
    +'<td class="num" style="color:var(--muted)">'+chf(avg.dd)+'</td>'
    +'<td class="num" style="color:var(--text);font-weight:500">'+chf(avg.total)+'</td>'
    +'<td class="num '+(avgVsB<=0?'pos':'neg')+'" style="font-weight:500">'+(avgVsB>0?'+':'')+chf(avgVsB)+'</td>'
    +'<td class="num '+(avg.saving>=0?'pos':'neg')+'">'+chf(avg.saving)+'</td>'
    +avgCatCols+'</tr>';

  // Period rows
  const rows=sorted.map(r=>{
    const cur=r.period===S.sheet;
    const total=parseFloat(r.total)||0;
    const budget=cur?S.budget:(parseFloat(r.budget)||S.budget);
    const saving=cur?(S.budget-total):(parseFloat(r.saving)||0);
    const vsB=total-budget;
    const catCells=CATS.map(c=>{
      if(cur){const v=curSpent[c.id]||0;return '<td class="num" style="color:'+c.color+'">'+(v>0?chf(v):'—')+'</td>';}
      return '<td class="num" style="color:var(--faint)">—</td>';
    }).join('');
    return '<tr '+(cur?'style="background:rgba(74,222,128,.07)"':'')+'>'
      +'<td><span class="chip '+(cur?'cur':'')+'">'+r.period+'</span></td>'
      +'<td class="num">'+chf(budget)+'</td>'
      +'<td class="num">'+chf(r.cc)+'</td>'
      +'<td class="num">'+chf(r.dd)+'</td>'
      +'<td class="num">'+chf(total)+'</td>'
      +'<td class="num '+(vsB<=0?'pos':'neg')+'">'+(vsB>0?'+':'')+chf(vsB)+'</td>'
      +'<td class="num '+(saving>=0?'pos':'neg')+'">'+chf(saving)+'</td>'
      +catCells+'</tr>';
  }).join('');

  tb.innerHTML=avgRow+rows;
  renderMonthlyCharts(sorted);
}

// ═══════════════════════════════════════
//  MONTHLY CHARTS
// ═══════════════════════════════════════
let _mBar=null, _mSaving=null, _mCats=null;

function renderMonthlyCharts(sorted){
  if(!sorted||!sorted.length) return;

  // Shared x-axis labels (oldest → newest)
  const periods=[...sorted].reverse().map(r=>r.period);
  const totals=periods.map(p=>{ const r=sorted.find(x=>x.period===p); return parseFloat(r&&r.total)||0; });
  const budgets=periods.map(p=>{ const r=sorted.find(x=>x.period===p); return parseFloat(r&&r.budget)||S.budget; });
  const savings=periods.map(p=>{ const r=sorted.find(x=>x.period===p); return parseFloat(r&&r.saving)||0; });
  const ccArr=periods.map(p=>{ const r=sorted.find(x=>x.period===p); return parseFloat(r&&r.cc)||0; });
  const ddArr=periods.map(p=>{ const r=sorted.find(x=>x.period===p); return parseFloat(r&&r.dd)||0; });

  const cs=getComputedStyle(document.documentElement);
  const gridColor=cs.getPropertyValue('--b1').trim()||'#1e3050';
  const tickClr=cs.getPropertyValue('--muted').trim()||'#64748b';
  const tickStyle={color:tickClr,font:{family:'JetBrains Mono',size:10}};
  const legStyle={color:tickClr,font:{family:'JetBrains Mono',size:10},boxWidth:10,padding:8};

  // ── Bar: Total vs Budget ──
  const bCtx=document.getElementById('m-chart-bar');
  if(bCtx){
    if(_mBar) _mBar.destroy();
    _mBar=new Chart(bCtx,{
      type:'bar',
      data:{
        labels:periods,
        datasets:[
          {label:'Budget',data:budgets,backgroundColor:'rgba(96,165,250,.18)',borderColor:'#60a5fa',borderWidth:1.5,borderRadius:3,order:2},
          {label:'CC',data:ccArr,backgroundColor:'rgba(248,113,113,.7)',borderColor:'#f87171',borderWidth:0,borderRadius:3,stack:'s',order:1},
          {label:'Debit',data:ddArr,backgroundColor:'rgba(251,191,36,.7)',borderColor:'#fbbf24',borderWidth:0,borderRadius:3,stack:'s',order:1},
        ]
      },
      options:{
        responsive:true,
        plugins:{legend:{labels:legStyle},tooltip:{callbacks:{label:ctx=>ctx.dataset.label+': '+chf(ctx.raw)}}},
        scales:{
          x:{ticks:tickStyle,grid:{color:gridColor}},
          y:{ticks:{...tickStyle,callback:v=>'CHF '+v},grid:{color:gridColor}}
        }
      }
    });
  }

  // ── Bar: Saving per period (green/red) ──
  const sCtx=document.getElementById('m-chart-saving');
  if(sCtx){
    if(_mSaving) _mSaving.destroy();
    _mSaving=new Chart(sCtx,{
      type:'bar',
      data:{
        labels:periods,
        datasets:[{
          label:'Saving',
          data:savings,
          backgroundColor:savings.map(v=>v>=0?'rgba(74,222,128,.65)':'rgba(248,113,113,.65)'),
          borderColor:savings.map(v=>v>=0?'#4ade80':'#f87171'),
          borderWidth:1.5,
          borderRadius:3,
        }]
      },
      options:{
        responsive:true,
        plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>chf(ctx.raw)}}},
        scales:{
          x:{ticks:tickStyle,grid:{color:gridColor}},
          y:{ticks:{...tickStyle,callback:v=>'CHF '+v},grid:{color:gridColor}}
        }
      }
    });
  }

  // ── Stacked bar: category breakdown per period ──
  const cCtx=document.getElementById('m-chart-cats');
  if(cCtx){
    if(_mCats) _mCats.destroy();
    // Build per-cat data — current period from live data, past from sheet cols
    const curSpent=catSpending();
    const catDatasets=CATS.map(cat=>{
      const data=periods.map(p=>{
        const r=sorted.find(x=>x.period===p);
        if(!r) return 0;
        if(p===S.sheet) return curSpent[cat.id]||0;
        return parseFloat(r[cat.id])||0;
      });
      if(data.every(v=>v===0)) return null;
      return {
        label:cat.icon+' '+cat.name,
        data,
        backgroundColor:cat.color+'aa',
        borderColor:cat.color,
        borderWidth:1,
        borderRadius:2,
        stack:'cats',
      };
    }).filter(Boolean);

    _mCats=new Chart(cCtx,{
      type:'bar',
      data:{labels:periods,datasets:catDatasets},
      options:{
        responsive:true,
        plugins:{
          legend:{labels:{...legStyle,boxWidth:10}},
          tooltip:{callbacks:{label:ctx=>ctx.dataset.label+': '+chf(ctx.raw)}}
        },
        scales:{
          x:{ticks:tickStyle,grid:{color:gridColor},stacked:true},
          y:{ticks:{...tickStyle,callback:v=>'CHF '+v},grid:{color:gridColor},stacked:true}
        }
      }
    });
  }
}

// ═══════════════════════════════════════
//  INIT
// ═══════════════════════════════════════
// ═══════════════════════════════════════
//  CHARTS
// ═══════════════════════════════════════
let _line=null;
function renderCharts(){
  const lCtx=document.getElementById('chart-line');
  if(!lCtx) return;
  if(_line){ _line.destroy(); _line=null; }

  const pd=periodBounds(S.sheet);
  const now=new Date(); now.setHours(0,0,0,0);

  // Build day labels for the period so far
  const dayLabels=[];
  const days=[];
  for(let d=new Date(pd.start);d<=now&&d<pd.end;d.setDate(d.getDate()+1)){
    days.push(d.toISOString().slice(0,10));
    dayLabels.push(d.toLocaleDateString('en-CH',{day:'2-digit',month:'short'}));
  }

  // Helper: cumulative daily totals for a set of entries (negatives = refunds, go below 0)
  function cumulative(entries){
    let run=0;
    return days.map(key=>{
      const amt=entries.filter(e=>e.date&&e.date.slice(0,10)===key).reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
      run+=amt;
      return +run.toFixed(2);
    });
  }

  // ── Primary series: Total, CC, Debit (thick) ──
  const totalData=cumulative([...S.cc,...S.dd]);
  const ccData=cumulative(S.cc);
  const ddData=cumulative(S.dd);

  // CC+Debit combined (gross, no category filter — shows true net with refunds)
  const combinedData=days.map((_,i)=>+(ccData[i]+ddData[i]).toFixed(2));

  const datasets=[
    // Total — thickest, white/bright, filled
    {label:'Total',data:totalData,borderColor:getComputedStyle(document.documentElement).getPropertyValue('--text').trim()||'#e2e8f0',backgroundColor:'rgba(45,212,191,.07)',borderWidth:3,tension:.35,fill:true,pointRadius:2,pointHoverRadius:5,order:1},
    // CC — thick, red
    {label:'Credit Card',data:ccData,borderColor:'#f87171',backgroundColor:'transparent',borderWidth:2.5,tension:.35,pointRadius:1.5,pointHoverRadius:4,borderDash:[],order:2},
    // Debit — thick, amber (will go negative for refunds)
    {label:'Debit',data:ddData,borderColor:'#fbbf24',backgroundColor:'transparent',borderWidth:2.5,tension:.35,pointRadius:1.5,pointHoverRadius:4,borderDash:[],order:3},
    // CC+Debit combined — medium, cyan dashed
    {label:'CC+Debit',data:combinedData,borderColor:'#2dd4bf',backgroundColor:'transparent',borderWidth:1.5,tension:.35,pointRadius:0,pointHoverRadius:3,borderDash:[5,3],order:4},
  ];

  // ── Category series: thin dashed, active filter = bold + opaque ──
  CATS.forEach((cat,i)=>{
    const catEntries=[...S.cc,...S.dd].filter(e=>e.cat===cat.id);
    if(!catEntries.length) return;
    const isActive=!_activeCatFilter||_activeCatFilter===cat.id;
    datasets.push({
      label:cat.icon+' '+cat.name,
      data:cumulative(catEntries),
      borderColor:cat.color,
      backgroundColor:'transparent',
      borderWidth:_activeCatFilter===cat.id?2.5:1,
      tension:.35,
      pointRadius:_activeCatFilter===cat.id?2:0,
      pointHoverRadius:3,
      borderDash:_activeCatFilter===cat.id?[]:[3,3],
      order:_activeCatFilter===cat.id?2:10+i,
      borderOpacity:isActive?1:.2,
      // use alpha on color for dimming
      borderColor:isActive?cat.color:cat.color+'33',
    });
  });

  _line=new Chart(lCtx,{
    type:'line',
    data:{labels:dayLabels,datasets},
    options:{
      responsive:true,
      interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{
          display:true,
          position:'bottom',
          labels:{color:getComputedStyle(document.documentElement).getPropertyValue('--muted').trim()||'#64748b',font:{family:'JetBrains Mono',size:10},boxWidth:12,padding:12,
            filter:(item)=>{
              // dim category items visually via label prefix
              return true;
            }
          }
        },
        tooltip:{
          callbacks:{
            label:ctx=>'  '+ctx.dataset.label+': '+chf(ctx.raw)
          }
        }
      },
      scales:{
        x:{ticks:{color:getComputedStyle(document.documentElement).getPropertyValue('--muted').trim()||'#64748b',font:{family:'JetBrains Mono',size:10},maxTicksLimit:12},grid:{color:getComputedStyle(document.documentElement).getPropertyValue('--b1').trim()||'#1e3050'}},
        y:{ticks:{color:getComputedStyle(document.documentElement).getPropertyValue('--muted').trim()||'#64748b',font:{family:'JetBrains Mono',size:10},callback:v=>'CHF '+v},grid:{color:getComputedStyle(document.documentElement).getPropertyValue('--b1').trim()||'#1e3050'}}
      }
    }
  });
}

// ═══════════════════════════════════════
//  INSIGHTS
// ═══════════════════════════════════════

// Swiss FSO benchmark data (CHF/month, Zürich, 2023)
// Source: BFS Haushaltsbudgeterhebung — adjusted for single/couple/family
const BENCHMARKS = {
  single: {
    '25-34': { groceries:320, lunches:280, transport:180, running:60,  hobbies:150, health:80,  media:60,  travel:180, extras:120 },
    '35-44': { groceries:340, lunches:260, transport:190, running:70,  hobbies:180, health:100, media:65,  travel:200, extras:130 },
    '45-54': { groceries:360, lunches:240, transport:200, running:60,  hobbies:160, health:130, media:60,  travel:220, extras:140 },
    '55+':   { groceries:380, lunches:200, transport:190, running:50,  hobbies:140, health:180, media:55,  travel:240, extras:120 },
  },
  couple: {
    '25-34': { groceries:520, lunches:400, transport:280, running:100, hobbies:220, health:140, media:90,  travel:300, extras:180 },
    '35-44': { groceries:560, lunches:380, transport:300, running:110, hobbies:260, health:160, media:95,  travel:340, extras:200 },
    '45-54': { groceries:600, lunches:360, transport:310, running:100, hobbies:240, health:200, media:90,  travel:360, extras:210 },
    '55+':   { groceries:620, lunches:300, transport:290, running:80,  hobbies:220, health:260, media:80,  travel:380, extras:180 },
  },
  family: {
    '25-34': { groceries:780, lunches:400, transport:360, running:120, hobbies:300, health:200, media:110, travel:400, extras:260 },
    '35-44': { groceries:840, lunches:380, transport:380, running:130, hobbies:340, health:240, media:115, travel:450, extras:280 },
    '45-54': { groceries:880, lunches:340, transport:370, running:120, hobbies:320, health:280, media:110, travel:480, extras:290 },
    '55+':   { groceries:900, lunches:280, transport:340, running:100, hobbies:280, health:340, media:100, travel:500, extras:250 },
  }
};

// Income adjustment factor (base = CHF 6000/month)
function incomeAdjust(benchmark, income){
  const factor = Math.max(0.6, Math.min(1.8, income / 6000));
  const out = {};
  Object.keys(benchmark).forEach(k => out[k] = Math.round(benchmark[k] * factor));
  return out;
}

function getProfile(){
  return {
    age:    (document.getElementById('ins-age')||{value:'35-44'}).value||'35-44',
    income: parseFloat((document.getElementById('ins-income')||{value:'6000'}).value)||6000,
    hh:     (document.getElementById('ins-hh')||{value:'single'}).value||'single',
  };
}

function saveInsightProfile(){
  const p=getProfile();
  DriveConfig.set({ insightProfile: p });
}

function loadInsightProfile(){
  try{
    const p=DriveConfig.get('insightProfile', {});
    if(p.age)    document.getElementById('ins-age').value=p.age;
    if(p.income) document.getElementById('ins-income').value=p.income;
    if(p.hh)     document.getElementById('ins-hh').value=p.hh;
  }catch(e){}
}

function getBenchmark(){
  const p=getProfile();
  const base=BENCHMARKS[p.hh]?.[p.age]||BENCHMARKS.single['35-44'];
  return incomeAdjust(base, p.income);
}

// Get all monthly history data (from last renderMonthly call)
let _monthlyData=[];

function getMyAvgPerCat(){
  // Average per category from all past periods (from MONTHLY sheet)
  const avgs={};
  CATS.forEach(c=>{ avgs[c.id]=0; });
  const n=_monthlyData.length;
  if(!n) return avgs;
  _monthlyData.forEach(r=>{
    CATS.forEach(c=>{ avgs[c.id]+=(parseFloat(r[c.id])||0); });
  });
  CATS.forEach(c=>{ avgs[c.id]/=n; });
  return avgs;
}

function renderInsights(){
  try{
    if(!S.url){
      document.getElementById('ins-scores').innerHTML='<div style="color:var(--muted);font-family:var(--font-mono);font-size:12px;grid-column:1/-1">Connect to Google Sheets first — go to Settings.</div>';
      return;
    }
    loadInsightProfile();
    const bench=getBenchmark();
    const spent=catSpending();
    const myAvg=getMyAvgPerCat();
    const allEntries=[...S.cc,...S.dd];

    // Score cards
    const totalSpent=Object.values(spent).reduce((s,v)=>s+Math.max(0,v),0);
    const totalBench=Object.values(bench).reduce((s,v)=>s+v,0);
    const savingsRate=S.budget>0?((S.budget-totalSpent)/S.budget*100):0;
    const nP=_monthlyData.length;
    const avgTotal=nP>1?_monthlyData.reduce((s,r)=>s+(parseFloat(r.total)||0),0)/nP:0;
    const vsAvgPct=nP>1&&avgTotal>0?((totalSpent/avgTotal)-1)*100:0;

    const scoreStatus=(val,b)=>{ const p=b>0?val/b:1; return p<0.8?'under':p<1.2?'normal':'over'; };
    const overallStatus=scoreStatus(totalSpent,totalBench);
    const scores=[
      {label:'vs Swiss Benchmark',val:(totalBench>0?(totalSpent/totalBench*100).toFixed(0):0)+'%',sub:'CHF '+totalSpent.toFixed(0)+' / benchmark CHF '+totalBench,status:overallStatus},
      {label:'Savings Rate',val:savingsRate.toFixed(1)+'%',sub:'CHF '+Math.max(0,S.budget-totalSpent).toFixed(0)+' saved this period',status:savingsRate>=20?'under':savingsRate>=5?'normal':'over'},
      {label:'vs Your Average',val:(nP>1?(vsAvgPct>0?'+':'')+vsAvgPct.toFixed(1)+'%':'Not enough data'),sub:nP>1?(nP+' periods recorded'):'Need 2+ periods',status:nP>1?(Math.abs(vsAvgPct)<15?'normal':vsAvgPct>0?'over':'under'):'normal'},
    ];
    document.getElementById('ins-scores').innerHTML=scores.map(s=>'<div class="ins-score '+s.status+'"><div class="ins-score-label">'+s.label+'</div><div class="ins-score-val">'+s.val+'</div><div class="ins-score-sub">'+s.sub+'</div></div>').join('');

    // Heatmap
    const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const catIds=CATS.filter(c=>c.id!=='refund').map(c=>c.id);
    const matrix={};
    days.forEach(function(_,di){ matrix[di]={}; catIds.forEach(function(id){ matrix[di][id]=0; }); });
    allEntries.filter(function(e){ return parseFloat(e.amount)>0; }).forEach(function(e){
      if(!e.date) return;
      const d=new Date(e.date);
      const di=(d.getDay()+6)%7;
      const cat=e.cat||'extras';
      if(matrix[di]&&matrix[di][cat]!==undefined) matrix[di][cat]+=parseFloat(e.amount)||0;
    });
    let maxVal=0;
    days.forEach(function(_,di){ catIds.forEach(function(id){ if(matrix[di][id]>maxVal) maxVal=matrix[di][id]; }); });
    function heatColor(v){ if(!maxVal||!v) return 'var(--b2)'; const p=v/maxVal; if(p<0.25) return 'rgba(96,165,250,.25)'; if(p<0.5) return 'rgba(251,191,36,.4)'; if(p<0.75) return 'rgba(248,113,113,.5)'; return 'rgba(248,113,113,.85)'; }
    const heatCats=CATS.filter(function(c){ return c.id!=='refund'&&catIds.includes(c.id); });
    let hh='<table class="heat-table"><thead><tr><th></th>'+days.map(function(d){ return '<th>'+d+'</th>'; }).join('')+'</tr></thead><tbody>';
    heatCats.forEach(function(c){
      hh+='<tr><td style="color:'+c.color+';white-space:nowrap;padding:5px 8px">'+c.icon+' '+c.name+'</td>';
      days.forEach(function(_,di){ const v=matrix[di][c.id]||0; hh+='<td style="background:'+heatColor(v)+';color:var(--text)">'+(v>0?v.toFixed(0):'')+'</td>'; });
      hh+='</tr>';
    });
    hh+='</tbody></table>';
    document.getElementById('ins-heatmap').innerHTML=hh;

    // Trends
    const trendsEl=document.getElementById('ins-trends');
    if(nP<2){
      trendsEl.innerHTML='<div style="color:var(--muted);font-family:var(--font-mono);font-size:12px;grid-column:1/-1">Need 2+ periods of data for trend analysis.</div>';
    } else {
      const sortedP=[..._monthlyData].sort(function(a,b){ return String(a.period).localeCompare(String(b.period)); });
      const last=sortedP[sortedP.length-1];
      const prev=sortedP[sortedP.length-2];
      trendsEl.innerHTML=CATS.filter(function(c){ return c.id!=='refund'; }).map(function(c){
        const lastVal=last.period===S.sheet?(spent[c.id]||0):(parseFloat(last[c.id])||0);
        const prevVal=parseFloat(prev[c.id])||0;
        if(!lastVal&&!prevVal) return '';
        const delta=lastVal-prevVal;
        const dp=prevVal>0?(delta/prevVal*100):0;
        const arrow=Math.abs(dp)<5?'\u2192':delta>0?'\u2191':'\u2193';
        const ac=Math.abs(dp)<5?'var(--muted)':delta>0?'var(--red)':'var(--green)';
        return '<div class="trend-item"><div class="trend-arrow" style="color:'+ac+'">'+arrow+'</div><div><div class="trend-name">'+c.icon+' '+c.name+'</div><div class="trend-val">'+chf(lastVal)+' \xb7 '+(dp>0?'+':'')+dp.toFixed(0)+'% vs prev</div></div></div>';
      }).filter(Boolean).join('');
    }

    // Benchmark chart
    const bCtx=document.getElementById('ins-bench-chart');
    if(bCtx&&typeof Chart!=='undefined'){
      if(window._insBenchChart) window._insBenchChart.destroy();
      const bCats=CATS.filter(function(c){ return c.id!=='refund'&&((spent[c.id]||0)>0||(bench[c.id]||0)>0); });
      window._insBenchChart=new Chart(bCtx,{
        type:'bar',
        data:{
          labels:bCats.map(function(c){ return c.icon+' '+c.name; }),
          datasets:[
            {label:'You (this period)',data:bCats.map(function(c){ return Math.max(0,spent[c.id]||0); }),backgroundColor:bCats.map(function(c){ return c.color+'aa'; }),borderColor:bCats.map(function(c){ return c.color; }),borderWidth:1.5,borderRadius:4},
            {label:'Swiss Benchmark',data:bCats.map(function(c){ return bench[c.id]||0; }),backgroundColor:getComputedStyle(document.documentElement).getPropertyValue('--primary-bg').trim()||'rgba(45,212,191,.1)',borderColor:getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()||'#2dd4bf',borderWidth:1.5,borderRadius:4},
          ]
        },
        options:{
          responsive:true,
          plugins:{legend:{labels:{color:getComputedStyle(document.documentElement).getPropertyValue('--muted').trim()||'#64748b',font:{family:'JetBrains Mono',size:10},boxWidth:10,padding:10}},tooltip:{callbacks:{label:function(ctx){ return ctx.dataset.label+': '+chf(ctx.raw); }}}},
          scales:{x:{ticks:{color:getComputedStyle(document.documentElement).getPropertyValue('--muted').trim()||'#64748b',font:{family:'JetBrains Mono',size:10}},grid:{color:getComputedStyle(document.documentElement).getPropertyValue('--b1').trim()||'#1e3050'}},y:{ticks:{color:getComputedStyle(document.documentElement).getPropertyValue('--muted').trim()||'#64748b',font:{family:'JetBrains Mono',size:10},callback:function(v){ return 'CHF '+v; }},grid:{color:getComputedStyle(document.documentElement).getPropertyValue('--b1').trim()||'#1e3050'}}}
        }
      });
    }

  } catch(err){
    console.error('renderInsights error:', err);
    const el=document.getElementById('ins-scores');
    if(el) el.innerHTML='<div style="color:var(--red);font-family:var(--font-mono);font-size:11px;grid-column:1/-1;background:var(--red-bg);padding:12px;border-radius:6px;border:1px solid rgba(248,113,113,.3)">\u26a0 Insights error: '+err.message+'<br><br><span style="color:var(--muted)">Make sure data is synced (Dashboard \u2192 wait for Synced \u2713) then try again.</span></div>';
  }
}

async function runAIAnalysis(){
  const btn=document.getElementById('ai-btn');
  const out=document.getElementById('ai-output');
  if(!btn||!out) return;
  btn.disabled=true; btn.textContent='Analysing\u2026';
  out.innerHTML='<div style="display:flex;align-items:center;gap:10px;color:var(--muted)"><div class="spin"></div> Reading your spending patterns\u2026</div>';
  try{
    const p=getProfile();
    const bench=getBenchmark();
    const spent=catSpending();
    const myAvg=getMyAvgPerCat();
    const pd=periodBounds(S.sheet);
    const totalSpent=Object.values(spent).reduce(function(s,v){ return s+Math.max(0,v); },0);
    const totalBench=Object.values(bench).reduce(function(s,v){ return s+v; },0);
    const savings=S.budget-totalSpent;
    const savingsRate=S.budget>0?(savings/S.budget*100).toFixed(1):0;
    const catLines=CATS.filter(function(c){ return c.id!=='refund'; }).map(function(c){
      const s=Math.max(0,spent[c.id]||0);
      const b=bench[c.id]||0;
      const avg=myAvg[c.id]||0;
      const pct=b>0?((s/b-1)*100).toFixed(0):null;
      return '- '+c.name+': CHF '+s.toFixed(0)+' spent | benchmark CHF '+b+(pct!==null?' ('+(pct>0?'+':'')+pct+'%)':'')+' | your avg CHF '+avg.toFixed(0);
    }).join('\n');
    const prompt='You are a sharp, honest personal finance advisor. Analyse this spending and give actionable, specific insights. Be direct — no fluff, no generic advice.\n\nPROFILE:\n- Age: '+p.age+', household: '+p.hh+', income: CHF '+p.income+'/month\n- Budget: CHF '+S.budget+' | Period: '+pd.label+' ('+pd.passed+'/'+pd.total+' days)\n- Periods tracked: '+_monthlyData.length+'\n\nSPENDING vs BENCHMARK:\n'+catLines+'\n\nSUMMARY:\n- Total: CHF '+totalSpent.toFixed(0)+' vs budget CHF '+S.budget+' vs benchmark CHF '+totalBench+'\n- Saving: CHF '+savings.toFixed(0)+' ('+savingsRate+'%)\n\nWrite 4-5 short paragraphs: 1) overall health 2) 2-3 standout categories 3) behavioural pattern 4) one concrete action 5) one thing done well. Use specific numbers. No bullet points inside paragraphs.';
    const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:1000,messages:[{role:'user',content:prompt}]})});
    const data=await res.json();
    const text=(data.content&&data.content[0]&&data.content[0].text)||'No response.';
    out.innerHTML=text.split(/\n\n+/).filter(function(p){ return p.trim(); }).map(function(p){ return '<div class="ai-paragraph">'+p.trim()+'</div>'; }).join('');
  } catch(e){
    out.innerHTML='<div style="color:var(--red);font-family:var(--font-mono);font-size:12px">Analysis failed: '+e.message+'</div>';
  }
  btn.disabled=false; btn.textContent='Analyse my spending';
}


function buildCatSelects(){
  const opts='<option value="">— no category —</option>'+CATS.map(c=>`<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
  ['cc-cat','dd-cat'].forEach(id=>{ const el=document.getElementById(id); if(el) el.innerHTML=opts; });
}

// ═══════════════════════════════════════
//  MOBILE NAV
// ═══════════════════════════════════════
function mnavSet(btn){
  document.querySelectorAll('.mnav-btn').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
}

function fabTap(){
  // go to whichever add tab is most relevant
  const cur=document.querySelector('.view.on');
  if(cur&&cur.id==='v-debit') go('debit');
  else go('credit');
  // sync mobile nav
  const idx={'v-credit':1,'v-debit':2}[cur&&cur.id]||1;
  const btns=document.querySelectorAll('.mnav-btn');
  document.querySelectorAll('.mnav-btn').forEach(b=>b.classList.remove('on'));
  if(btns[idx]) btns[idx].classList.add('on');
  // scroll add form into view
  setTimeout(()=>{
    const form=document.querySelector('.view.on .add-form');
    if(form) form.scrollIntoView({behavior:'smooth',block:'start'});
    const firstInput=form&&form.querySelector('input[type="text"]');
    if(firstInput) firstInput.focus();
  },100);
}

async function init(){
  await DriveConfig.load();
  restore();
  buildCatSelects();
  document.getElementById('about-startday').textContent=S.startDay+'th';
  if(!S.url){ go('setup'); return; }
  document.getElementById('cfg-url').value=S.url;
  document.getElementById('cfg-budget').value=S.budget;
  document.getElementById('cfg-startday').value=S.startDay;
  renderRecurringTemplates();
  const today=new Date().toISOString().slice(0,10);
  document.getElementById('cc-date').value=today;
  document.getElementById('dd-date').value=today;
  S.sheet=currentSheet();
  go('dashboard');
  syncAll();
}

init();

// ─── Theme recolor hook ──────────────────────────────────────────
window._chartsNeedRecolor = function() {
  // Rebuild charts with updated CSS var colors
  if (typeof renderMonthly === 'function') { try { renderMonthly(DriveConfig.ls.getJ('bt-monthly',{data:[]})); } catch(e){} }
  if (typeof renderLineChart === 'function') { try { renderLineChart(); } catch(e){} }
};

