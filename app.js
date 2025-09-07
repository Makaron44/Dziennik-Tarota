// Dziennik Tarota — V3.2
// hamburger + motyw + dodawanie/edycja kart (z kompresją obrazów) + dziennik + nastroje + podsumowanie + eksport/import

(function(){
  // ====== STORAGE / UTIL ======
  const LS = { cards:'TAROT_CARDS_V33', entries:'TAROT_ENTRIES_V33', settings:'TAROT_SETTINGS_V33' };
  const $  = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const Jget = (k,f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } };
  const Jset = (k,v) => localStorage.setItem(k, JSON.stringify(v));
  function JsetSafe(key, value){
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (err) {
      console.error(err);
      alert('Nie udało się zapisać danych. Obraz może być zbyt duży.\nSpróbuj mniejszego pliku lub podaj adres URL.');
      return false;
    }
  }
  const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
  const imgSrc = c => c?.imgDataUrl || c?.imgUrl || '';
  const todayISO = (d=new Date()) => { const o=d.getTimezoneOffset(); const l=new Date(d.getTime()-o*60000); return l.toISOString().slice(0,10); };
  const startOfWeek = d => { const x=new Date(d); const w=(x.getDay()+6)%7; x.setDate(x.getDate()-w); x.setHours(0,0,0,0); return x; };
  const endOfWeek   = d => { const s=startOfWeek(d); const e=new Date(s); e.setDate(s.getDate()+7); return e; };
  const esc = s => 
(s||'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
function moodIcon(text){
  const t = (text||'').toLowerCase().trim();
  const map = {
    'spokojny':'🌊',
    'wdzięczny':'🙏',
    'zainspirowany':'✨',
    'zmęczony':'😴',
    'radość':'😊',
    'smutek':'😔',
    'złość':'🔥',
    'miłość':'❤️',
    'nadzieja':'🕊️',
    'zaniepokojony':'😟',
    'pewny siebie':'🦁'
  };
  // emoji albo inicjał
  return map[t] || (text ? text.charAt(0).toUpperCase() : '🔮');
}
  // Zmniejsz + kompresuj obraz zanim trafi do LS (iOS-friendly)
  async function downscaleToDataUrl(file, maxW=800, maxH=1300, quality=0.82){
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          const scale = Math.min(maxW/width, maxH/height, 1);
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(width*scale);
          canvas.height = Math.round(height*scale);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = fr.result;
      };
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  const S = {
    get cards(){ return Jget(LS.cards, []); },
    set cards(v){ Jset(LS.cards, v); },
    get entries(){ return Jget(LS.entries, []); },
    set entries(v){ Jset(LS.entries, v); },
    get settings(){ return Jget(LS.settings, { theme:'dark' }); },
    set settings(v){ Jset(LS.settings, v); }
  };

  // ====== THEME ======
  function applyTheme(){ document.documentElement.setAttribute('data-theme', S.settings.theme==='light'?'light':'dark'); }
  $('#toggleTheme')?.addEventListener('click', ()=>{ const s=S.settings; s.theme=s.theme==='light'?'dark':'light'; S.settings=s; applyTheme(); });

  // ====== TABS / NAV ======
  function forceReflow(el){ if(!el) return; void el.offsetWidth; }
  function switchTab(name){
    $$('.tabs button').forEach(b=>{const a=b.dataset.tab===name; b.classList.toggle('active', a); b.setAttribute('aria-selected', a);});
    $$('main > section').forEach(s=>s.hidden=true);
    const shown=$('#tab-'+name); if(shown){ shown.hidden=false; forceReflow(shown); }
  }
  $$('.tabs button').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));

  const navDialog = $('#navDialog');
  $('#openMenu')?.addEventListener('click', ()=>navDialog?.showModal());
  $('#closeNavDialog')?.addEventListener('click', ()=>navDialog?.close());
  navDialog?.addEventListener('click', e=>{ if(e.target===navDialog) navDialog.close(); });
  navDialog?.querySelectorAll('[data-goto]')?.forEach(btn=>btn.addEventListener('click',()=>{ switchTab(btn.dataset.goto); navDialog.close(); }));

  // ====== CARDS ======
  function renderCardsGrid(filter=''){
    const grid = $('#cardsGrid'); const q=filter.trim().toLowerCase();
    const list = q? S.cards.filter(c=> (c.name+' '+(c.desc||'')).toLowerCase().includes(q)) : S.cards;
    grid.innerHTML='';
    if(!list.length){ grid.innerHTML='<div class="muted">Brak kart. Dodaj pierwszą po lewej 👈</div>'; return; }
    for(const c of list){
      const el=document.createElement('div'); el.className='card';
      el.innerHTML=`<img alt="${esc(c.name)}" src="${imgSrc(c)}" onerror="this.style.opacity=0.25;" />
        <div class="meta">
          <h4>${esc(c.name)}</h4>
          <div class="muted" style="font-size:13px;max-height:3.6em;overflow:hidden;line-height:1.4;">${esc(c.desc)}</div>
          <div class="row">
            <button class="btn small" data-edit="${c.id}">Edytuj</button>
            <button class="btn small" data-use="${c.id}">Użyj w dzienniku</button>
          </div>
        </div>`;
      grid.appendChild(el);
    }
    grid.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>loadCardIntoForm(b.dataset.edit)));
    grid.querySelectorAll('[data-use]').forEach(b=>b.addEventListener('click',()=>{ switchTab('daily'); $('#dailyCard').value=b.dataset.use; updateDailyPreview(); }));
  }

  function resetCardForm(){
    $('#cardId').value=''; $('#cardName').value=''; $('#cardDesc').value='';
    $('#cardImgUrl').value=''; $('#deleteCardBtn').style.display='none';
    $('#cardImgFile').value=''; $('#dropzone').textContent='Upuść obrazek tutaj lub kliknij, aby wybrać plik';
  }
  function loadCardIntoForm(id){
    const c=S.cards.find(x=>x.id===id); if(!c) return;
    switchTab('cards');
    $('#cardId').value=c.id; $('#cardName').value=c.name; $('#cardDesc').value=c.desc||'';
    $('#cardImgUrl').value=c.imgUrl||''; $('#deleteCardBtn').style.display='';
    $('#cardName').focus();
  }

  $('#cardForm')?.addEventListener('submit', async e=>{
    e.preventDefault();
    const id = $('#cardId').value || uid();
    const name = ($('#cardName').value||'').trim(); if(!name) return alert('Podaj nazwę karty');
    const desc = ($('#cardDesc').value||'').trim();
    const url  = ($('#cardImgUrl').value||'').trim();

    let imgDataUrl; const file=$('#cardImgFile').files[0];
    if(file) imgDataUrl = await downscaleToDataUrl(file); // kompresja przed LS

    const cards = S.cards.slice();
    const i = cards.findIndex(c=>c.id===id);
    const payload = { id, name, desc };
    if(imgDataUrl){ payload.imgDataUrl=imgDataUrl; payload.imgUrl=''; }
    else if(url){   payload.imgUrl=url; payload.imgDataUrl=''; }

    if(i>=0) cards[i] = { ...cards[i], ...payload }; else cards.push({ id, ...payload });

    const ok = JsetSafe(LS.cards, cards);
    if(!ok) return; // komunikat już pokazany
    resetCardForm(); renderCardsGrid($('#cardSearch').value); populateCardSelect();
    alert('Zapisano kartę ✨');
  });

  $('#deleteCardBtn')?.addEventListener('click',()=>{
    const id=$('#cardId').value; if(!id) return;
    if(!confirm('Usunąć tę kartę?')) return;
    const cards = S.cards.filter(c=>c.id!==id);
    if(!JsetSafe(LS.cards, cards)) return;
    resetCardForm(); renderCardsGrid($('#cardSearch').value); populateCardSelect();
  });
  $('#resetCardForm')?.addEventListener('click', resetCardForm);
  $('#newCardBtn')?.addEventListener('click', resetCardForm);
  $('#cardSearch')?.addEventListener('input', e=>renderCardsGrid(e.target.value));

  // Dropzone (na iOS DnD nie działa — kliknij)
  const dz = $('#dropzone');
  dz?.addEventListener('click', ()=>$('#cardImgFile').click());
  dz?.addEventListener('dragover', e=>{ e.preventDefault(); dz.classList.add('dragover'); });
  dz?.addEventListener('dragleave', ()=>dz.classList.remove('dragover'));
  dz?.addEventListener('drop', e=>{
    e.preventDefault(); dz.classList.remove('dragover');
    const f=e.dataTransfer?.files?.[0]; if(!f) return;
    $('#cardImgFile').files=e.dataTransfer.files;
    dz.textContent=`Wybrano plik: ${f.name}`;
  });
  $('#cardImgFile')?.addEventListener('change', e=>{
    const f=e.target.files?.[0];
    dz.textContent = f?`Wybrano plik: ${f.name}`:'Upuść obrazek tutaj lub kliknij, aby wybrać plik';
  });

  // ====== DAILY ======
  function populateCardSelect(){
    const sel=$('#dailyCard'); const prev=sel.value;
    sel.innerHTML='<option value="" disabled selected>— wybierz kartę —</option>'+
      S.cards.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
    if(prev && S.cards.find(c=>c.id===prev)) sel.value=prev;
    updateDailyPreview();
  }
  function updateDailyPreview(){
    const id=$('#dailyCard').value; const c=S.cards.find(x=>x.id===id)||{};
    $('#dailyPreviewImg').src=imgSrc(c)||''; $('#dailyPreviewTitle').textContent=c.name||'';
    $('#dailyPreviewDesc').textContent=c.desc||'';
    const wrap=$('#dailyPreviewMoods'); wrap.innerHTML='';
    getMoodState().forEach(m=>wrap.appendChild(makeChip(m)));
  }
  $('#dailyCard')?.addEventListener('change', updateDailyPreview);

  const moodSugs = ['spokojny','wdzięczny','zainspirowany','zmęczony','radość','smutek','złość','miłość','nadzieja','zaniepokojony','pewny siebie'];
  let moods = [];
  const getMoodState = () => moods.slice();
  const renderMoods = () => {
    const box=$('#moodChips'); box.innerHTML='';
    moods.forEach(m=>box.appendChild(makeChip(m, removeMood)));
    const sug=$('#moodSuggestions');
    if(!sug.dataset.ready){ sug.innerHTML='';
      moodSugs.forEach(m=>{ const s=document.createElement('span'); s.className='suggest'; s.textContent=m; s.addEventListener('click',()=>addMood(m)); sug.appendChild(s); });
      sug.dataset.ready='1';
    }
  };
  function makeChip(t, onRemove){
    const span=document.createElement('span'); span.className='chip';
    span.innerHTML=`${esc(t)}${onRemove?` <button aria-label="Usuń ${esc(t)}">×</button>`:''}`;
    if(onRemove) span.querySelector('button').addEventListener('click',()=>onRemove(t));
    return span;
  }
  function addMood(t){ t=(t||'').trim(); if(!t) return; if(!moods.includes(t)) moods.push(t); renderMoods(); updateDailyPreview(); }
  function removeMood(t){ moods = moods.filter(x=>x!==t); renderMoods(); updateDailyPreview(); }
  $('#moodInput')?.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===','){ e.preventDefault(); addMood(e.currentTarget.value); e.currentTarget.value=''; }});
  $('#moodInput')?.addEventListener('blur', e=>{ const v=e.currentTarget.value.trim(); if(v){ addMood(v); e.currentTarget.value=''; }});

  function loadEntry(dateStr){ return S.entries.find(e=>e.date===dateStr); }
  function setDailyFormDate(dateStr){
    $('#dailyDate').value=dateStr; const e=loadEntry(dateStr); moods=[];
    if(e){ $('#dailyCard').value=e.cardId||''; $('#dailyNote').value=e.note||''; $('#feelingsText').value=e.feelings||''; $('#eventsText').value=e.events||''; (e.moods||[]).forEach(addMood); }
    else { $('#dailyNote').value=''; $('#feelingsText').value=''; $('#eventsText').value=''; }
    renderMoods(); updateDailyPreview();
  }

  $('#dailyForm')?.addEventListener('submit', e=>{
    e.preventDefault();
    const date=$('#dailyDate').value||todayISO();
    const cardId=$('#dailyCard').value; if(!cardId) return alert('Wybierz kartę.');
    const note=$('#dailyNote').value.trim();
    const feelings=$('#feelingsText').value.trim();
    const events=$('#eventsText').value.trim();

    const entries=S.entries.slice();
    const idx=entries.findIndex(x=>x.date===date);
    const payload={ date, cardId, note, feelings, events, moods:getMoodState(), ts:Date.now() };
    if(idx>=0) entries[idx]=payload; else entries.push(payload);
    S.entries=entries;

    renderEntriesList(); renderSummary();
    alert('Zapisano wpis ✅');
  });
  $('#clearDaily')?.addEventListener('click', ()=> setDailyFormDate($('#dailyDate').value||todayISO()));
  $('#dailyDate')?.addEventListener('change', ()=> setDailyFormDate($('#dailyDate').value));

  // Losowanie karty
  $('#drawRandomBtn')?.addEventListener('click', ()=>{
    const list=S.cards; if(!list.length) return alert('Najpierw dodaj karty.');
    const rnd = list[Math.floor(Math.random()*list.length)];
    $('#dailyCard').value=rnd.id; updateDailyPreview();
  });

  // Pick from gallery
  const pickDialog = $('#pickDialog');
  $('#pickFromGalleryBtn')?.addEventListener('click', ()=>{ $('#pickSearch').value=''; renderPickGrid(); pickDialog.showModal(); });
  $('#closePickDialog')?.addEventListener('click', ()=>pickDialog.close());
  $('#pickSearch')?.addEventListener('input', renderPickGrid);
  function renderPickGrid(){
    const q=($('#pickSearch').value||'').toLowerCase(); const grid=$('#pickGrid'); grid.innerHTML='';
    const list=S.cards.filter(c=>(c.name+' '+(c.desc||'')).toLowerCase().includes(q));
    if(!list.length){ grid.innerHTML='<div class="muted">Brak wyników.</div>'; return; }
    list.forEach(c=>{
      const el=document.createElement('div'); el.className='card';
      el.innerHTML=`<img alt="${esc(c.name)}" src="${imgSrc(c)}" /><div class="meta"><h4>${esc(c.name)}</h4><button class="btn small" data-pick="${c.id}">Wybierz</button></div>`;
      grid.appendChild(el);
    });
    grid.querySelectorAll('[data-pick]').forEach(b=>b.addEventListener('click',()=>{ $('#dailyCard').value=b.dataset.pick; updateDailyPreview(); pickDialog.close(); }));
  }

  // ====== ENTRIES LIST ======
  function humanDate(d){ return new Date(d).toLocaleDateString(undefined,{weekday:'long', year:'numeric', month:'long', day:'numeric'}); }
  function renderEntriesList(){
    const list=$('#entriesList');
    const q=($('#entrySearch').value||'').toLowerCase();
    const from=$('#filterFrom').value? new Date($('#filterFrom').value):null;
    const to  =$('#filterTo').value  ? new Date($('#filterTo').value)  :null;
    const items=S.entries.slice().sort((a,b)=>b.ts-a.ts).filter(e=>{
      const card=S.cards.find(c=>c.id===e.cardId)||{name:'(usunięta karta)'};
      const txt=[card.name,e.note||'',e.feelings||'',e.events||'',(e.moods||[]).join(' ')].join(' ').toLowerCase();
      const okQ=q? txt.includes(q):true;
      const dd=new Date(e.date);
      const okF= from? dd>=from:true;
      const okT= to  ? dd<=to  :true;
      return okQ && okF && okT;
    });
    list.innerHTML='';
    if(!items.length){ list.innerHTML='<div class="muted">Brak wpisów w filtrze.</div>'; return; }
    items.forEach(e=>{
      const card=S.cards.find(c=>c.id===e.cardId)||{};
      const el=document.createElement('div'); el.className='entry';
      const moodsHtml=(e.moods||[]).map(m=>`<span class="chip">${esc(m)}</span>`).join(' ');
      el.innerHTML=`<img alt="${esc(card.name||'')}" src="${imgSrc(card)}" onerror="this.style.opacity=0.25;" />
        <div>
          <div class="row" style="justify-content:space-between;">
            <div>
              <div class="title">${esc(card.name||'(brak karty)')}</div>
              <div class="date">${humanDate(e.date)}</div>
            </div>
            <div class="row">
              <button class="btn small" data-edit="${e.date}">Edytuj</button>
              <button class="btn small danger" data-del="${e.date}">Usuń</button>
            </div>
          </div>
          ${moodsHtml?`<div class="chips" style="margin-top:6px">${moodsHtml}</div>`:''}
          ${e.feelings?`<div class="muted" style="margin-top:6px"><b>Uczucia:</b> ${esc(e.feelings)}</div>`:''}
          ${e.events?`<div class="muted" style="margin-top:4px"><b>Zdarzenia:</b> ${esc(e.events)}</div>`:''}
          ${e.note?`<p style="margin:8px 0 0; white-space:pre-wrap;">${esc(e.note)}</p>`:''}
        </div>`;
      list.appendChild(el);
    });
    list.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>{ const d=b.dataset.edit; const e=S.entries.find(x=>x.date===d); if(!e) return; switchTab('daily'); setDailyFormDate(d); $('#dailyNote').focus(); }));
    list.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click',()=>{ const d=b.dataset.del; if(!confirm('Usunąć wpis z dnia '+humanDate(d)+'?')) return; S.entries=S.entries.filter(x=>x.date!==d); renderEntriesList(); renderSummary(); }));
  }
  $('#entrySearch')?.addEventListener('input', renderEntriesList);
  $('#filterFrom')?.addEventListener('change', renderEntriesList);
  $('#filterTo')?.addEventListener('change', renderEntriesList);

  // ====== SUMMARY ======
  function entriesInRange(mode){
    const es=S.entries;
    if(mode==='last7'){
      const end=new Date(); end.setHours(23,59,59,999);
      const start=new Date(); start.setDate(end.getDate()-6); start.setHours(0,0,0,0);
      return es.filter(e=>{ const d=new Date(e.date); return d>=start&&d<=end; });
    } else {
      const cur=$('#weekStart').value?new Date($('#weekStart').value):new Date();
      const s=startOfWeek(cur), e=endOfWeek(cur);
      return es.filter(x=>{ const d=new Date(x.date); return d>=s&&d<e; });
    }
  }
  function renderSummary(){
    const mode=document.querySelector('input[name="range"]:checked').value;
    const sub=entriesInRange(mode);
    const kpi=$('#kpi'); const days=new Set(sub.map(e=>e.date)).size; const total=sub.length; const uniq=new Set(sub.map(e=>e.cardId)).size;
    kpi.innerHTML=
      `<div class="box"><div class="muted">Liczba wpisów</div><div style="font-size:24px;font-weight:800;">${total}</div></div>
       <div class="box"><div class="muted">Dni z wpisem</div><div style="font-size:24px;font-weight:800;">${days}</div></div>
       <div class="box"><div class="muted">Unikalne karty</div><div style="font-size:24px;font-weight:800;">${uniq}</div></div>`;

    const counts=new Map(); sub.forEach(e=>counts.set(e.cardId,(counts.get(e.cardId)||0)+1));
    const sorted=[...counts.entries()].sort((a,b)=>b[1]-a[1]);
    const top=$('#summaryTop'); top.innerHTML= sorted.length? '':''; if(!sorted.length) top.innerHTML='<div class="muted">Brak danych w tym okresie.</div>';
    const max=Math.max(1,...counts.values(),1);
    sorted.forEach(([id,cnt])=>{
      const c=S.cards.find(x=>x.id===id)||{name:'(brak karty)'};
      const row=document.createElement('div'); row.className='entry';
      row.innerHTML=`<img alt="${esc(c.name)}" src="${imgSrc(c)}" />
        <div>
          <div class="row" style="justify-content:space-between;"><div class="title">${esc(c.name)}</div><div class="muted">${cnt}×</div></div>
          <div class="bar" style="margin-top:8px"><div style="width:${Math.round(cnt/max*100)}%"></div></div>
        </div>`;
      top.appendChild(row);
    });

    const mcounts=new Map(); sub.forEach(e=>(e.moods||[]).forEach(m=>mcounts.set(m,(mcounts.get(m)||0)+1)));
    const msorted=[...mcounts.entries()].sort((a,b)=>b[1]-a[1]);
    const moodTop=$('#moodTop'); moodTop.innerHTML=msorted.length?'':'<div class="muted">Brak nastrojów w tym okresie.</div>';
    const mmax=Math.max(1,...mcounts.values(),1);
    msorted.forEach(([m,cnt])=>{
  const row = document.createElement('div');
  row.className = 'entry';
  row.innerHTML = `
    <div class="mood-icon">${esc(moodIcon(m))}</div>
    <div>
      <div class="row" style="justify-content:space-between;">
        <div class="title">${esc(m)}</div>
        <div class="muted">${cnt}×</div>
      </div>
      <div class="bar" style="margin-top:8px">
        <div style="width:${Math.round(cnt/mmax*100)}%"></div>
      </div>
    </div>`;
  moodTop.appendChild(row);
});

    const list=$('#summaryEntries'); list.innerHTML='';
    sub.slice().sort((a,b)=>new Date(a.date)-new Date(b.date)).forEach(e=>{
      const c=S.cards.find(x=>x.id===e.cardId)||{};
      const moodsHtml=(e.moods||[]).map(m=>`<span class="chip">${esc(m)}</span>`).join(' ');
      const div=document.createElement('div'); div.className='entry';
      div.innerHTML=`<img alt="${esc(c.name||'')}" src="${imgSrc(c)}" />
        <div>
          <div class="title">${humanDate(e.date)} — ${esc(c.name||'(brak karty)')}</div>
          ${moodsHtml?`<div class="chips" style="margin-top:6px">${moodsHtml}</div>`:''}
          ${e.feelings?`<div class="muted" style="margin-top:6px"><b>Uczucia:</b> ${esc(e.feelings)}</div>`:''}
          ${e.events?`<div class="muted" style="margin-top:4px"><b>Zdarzenia:</b> ${esc(e.events)}</div>`:''}
          ${e.note?`<div class="muted" style="margin-top:4px;white-space:pre-wrap;">${esc(e.note)}</div>`:''}
        </div>`;
      list.appendChild(div);
    });
  }
  $$('input[name="range"]').forEach(r=>r.addEventListener('change', renderSummary));
  $('#weekStart')?.addEventListener('change', renderSummary);

  // ====== EXPORT / IMPORT ======
  $('#exportBtn')?.addEventListener('click', ()=>{
    const data={cards:S.cards, entries:S.entries, version:32};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a');
    a.href=url; a.download=`tarot_journal_${todayISO().replace(/-/g,'')}.json`;
    document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); },0);
  });

  $('#importFile')?.addEventListener('change', e=>{
    const f=e.target.files?.[0]; if(!f) return;
    const r=new FileReader();
    r.onload=()=>{
      try{
        const obj=JSON.parse(r.result);
        if(!obj||!Array.isArray(obj.cards)||!Array.isArray(obj.entries)) throw new Error('Zły format');
        if(!confirm('Zaimportować dane i NADPISAĆ obecne?')) return;
        if(!JsetSafe(LS.cards, obj.cards)) return;
        if(!JsetSafe(LS.entries, obj.entries.map(x=>({ moods:[], feelings:'', events:'', ...x })))) return;
        populateCardSelect(); renderCardsGrid($('#cardSearch').value); renderEntriesList(); renderSummary();
        alert('Zaimportowano dane ✅');
      } catch(err){ alert('Nie udało się wczytać: '+err.message); }
    };
    r.readAsText(f); e.target.value='';
  });

  // ====== INIT ======
  function init(){
    applyTheme();
    renderCardsGrid(); populateCardSelect();

    const t=todayISO();
    $('#dailyDate').value=t; setDailyFormDate(t);
    $('#filterFrom').value=todayISO(new Date(Date.now()-6*86400000));
    $('#filterTo').value=t;
    $('#weekStart').value=todayISO(startOfWeek(new Date()));

    renderEntriesList(); renderSummary();
    switchTab('cards');
  }
// Rejestracja Service Workera (PWA)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      // delikatne info przy aktualizacji SW
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            // pokazujemy propozycję odświeżenia (bez przymusu)
            if (confirm('Dziennik Tarota został zaktualizowany. Odświeżyć teraz?')) {
              window.location.reload();
            }
          }
        });
      });
    }).catch(console.error);
  });
}
  document.readyState!=='loading' ? init() : document.addEventListener('DOMContentLoaded', init);
})();
