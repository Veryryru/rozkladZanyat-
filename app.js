
let currentGroup='18';
let currentDay=0;
let subs={};
let customSchedule={};
let homework={};
let subsHistory=[];
let holidays=[];
let settings={theme:'dark', fontScale:100, notifications:false, showParity:false};
let searchQuery='';
let editKey=null;
let editMode='week';
let weekDates=[];
let todayIdx=null;
let notifiedSet=new Set();

function toMin(t){const [h,m]=t.split(':').map(Number); return h*60+m;}
function pad(n){return n<10?'0'+n:''+n;}
function subKey(g,d,s){return g+'|'+d+'|'+s;}
function permKey(g,dayIdx,s){return g+'#'+dayIdx+'#'+s;}
function dateStr(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function dateKeyFor(dayIdx){return dateStr(weekDates[dayIdx]);}
function weekdayIndexFromDateStr(ds){
  const [y,m,d]=ds.split('-').map(Number);
  const dow=new Date(y,m-1,d).getDay();
  return dow===0 ? 6 : dow-1;
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function timeRefFor(kind){return kind==='lessons'?BELL_SCHEDULE:PAIR_TIMES;}
function baseLesson(gid,dayIdx,slot){
  const pk=permKey(gid,dayIdx,slot);
  if(Object.prototype.hasOwnProperty.call(customSchedule,pk)){
    const v=customSchedule[pk];
    return (v && v.subject) ? v : null;
  }
  const arr=GROUPS[gid].days[dayIdx];
  return (slot<arr.length) ? arr[slot] : null;
}
function effective(lesson,sub){
  if(!lesson && !sub) return null;
  if(sub) return {subject:sub.subject, teacher: sub.teacher||(lesson?lesson.teacher:''), room: sub.room||(lesson?lesson.room:''), type: lesson?lesson.type:''};
  return lesson;
}
function getSubjectTeacherRoom(gid, subject){
  const g=GROUPS[gid];
  for(let d=0; d<g.days.length; d++){
    for(let idx=0; idx<g.days[d].length; idx++){
      const l=baseLesson(gid,d,idx);
      if(l && l.subject===subject) return {teacher:l.teacher||'', room:l.room||''};
    }
  }
  return {teacher:'', room:''};
}
function isHoliday(dateKeyStr){ return holidays.indexOf(dateKeyStr)!==-1; }
function isDayFullyEmpty(gid, dayIdx){
  const g=GROUPS[gid];
  for(let i=0;i<g.days[dayIdx].length;i++){
    const lesson=baseLesson(gid,dayIdx,i);
    const sub=subs[subKey(gid,dateKeyFor(dayIdx),i)];
    if(lesson||sub) return false;
  }
  return true;
}
function weekParity(monday){
  const d=new Date(Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate()));
  const dayNum=d.getUTCDay()||7;
  d.setUTCDate(d.getUTCDate()+4-dayNum);
  const yearStart=new Date(Date.UTC(d.getUTCFullYear(),0,1));
  const weekNo=Math.ceil((((d-yearStart)/86400000)+1)/7);
  return weekNo%2;
}
function pruneExpiredSubs(){
  const now=new Date();
  const dow=now.getDay();
  const diffToMonday = dow===0 ? -6 : 1-dow;
  const monday=new Date(now); monday.setDate(now.getDate()+diffToMonday); monday.setHours(0,0,0,0);
  const thisMonday=dateStr(monday);
  if(!lastResetWeek){ lastResetWeek=thisMonday; return false; }
  if(lastResetWeek===thisMonday) return false;
  if(Object.keys(subs).length){
    subsHistory.unshift({week: lastResetWeek, subs: JSON.parse(JSON.stringify(subs))});
    if(subsHistory.length>12) subsHistory.length=12;
    saveHistory();
  }
  subs={};
  lastResetWeek=thisMonday;
  saveSubs();
  return true;
}

function computeWeekDates(){
  const now=new Date();
  const dow=now.getDay();
  todayIdx = dow===0 ? 6 : dow-1;
  const diffToMonday = dow===0 ? -6 : 1-dow;
  const monday=new Date(now); monday.setDate(now.getDate()+diffToMonday); monday.setHours(0,0,0,0);
  weekDates=[];
  for(let i=0;i<7;i++){const d=new Date(monday); d.setDate(monday.getDate()+i); weekDates.push(d);}
}

let lastResetWeek='';
function hasCloudStorage(){
  return typeof window.storage !== 'undefined' && window.storage && typeof window.storage.get === 'function';
}
async function loadKV(key, shared){
  if(hasCloudStorage()){
    try{ const r=await window.storage.get(key, shared); return (r && r.value) ? JSON.parse(r.value) : null; }
    catch(e){ return null; }
  }
  try{ const raw=localStorage.getItem('rozklad_'+key); return raw ? JSON.parse(raw) : null; }
  catch(e){ return null; }
}
async function saveKV(key, value, shared){
  const payload=JSON.stringify(value);
  if(hasCloudStorage()){
    try{ await window.storage.set(key, payload, shared); return; }
    catch(e){}
  }
  try{ localStorage.setItem('rozklad_'+key, payload); }
  catch(e){ console.error(e); }
}
function parseSubsPayload(raw){
  if(raw && typeof raw==='object' && !Array.isArray(raw) && 'subs' in raw){
    subs=raw.subs||{}; lastResetWeek=raw.lastResetWeek||'';
  } else {
    subs=raw||{}; lastResetWeek='';
  }
}
async function loadSubs(){
  const raw=await loadKV('substitutions', true);
  parseSubsPayload(raw||{});
}
async function saveSubs(){
  await saveKV('substitutions', {subs, lastResetWeek}, true);
}
async function loadLastGroup(){
  const v=await loadKV('lastGroup', false);
  if(v && GROUPS[v]) currentGroup=v;
}
async function saveLastGroup(){ await saveKV('lastGroup', currentGroup, false); }
async function saveCustomSchedule(){ await saveKV('customSchedule', customSchedule, true); }
async function saveHomework(){ await saveKV('homework', homework, true); }
async function saveHistory(){ await saveKV('subsHistory', subsHistory, true); }
async function saveHolidays(){ await saveKV('holidays', holidays, true); }
async function saveSettings(){ await saveKV('settings', settings, false); }
async function loadAllExtra(){
  customSchedule = (await loadKV('customSchedule', true)) || {};
  homework = (await loadKV('homework', true)) || {};
  subsHistory = (await loadKV('subsHistory', true)) || [];
  holidays = (await loadKV('holidays', true)) || [];
  const s = await loadKV('settings', false);
  settings = Object.assign({theme:'dark', fontScale:100, notifications:false, showParity:false}, s||{});
}

function applyTheme(){
  if(settings.theme==='light') document.body.setAttribute('data-theme','light');
  else document.body.removeAttribute('data-theme');
}
function applyFontScale(){
  document.documentElement.style.fontSize = (settings.fontScale||100)+'%';
}

function renderClock(){
  const now=new Date();
  document.getElementById('clock').textContent=pad(now.getHours())+':'+pad(now.getMinutes());
}
function renderHeroDate(){
  const d=weekDates[currentDay];
  const isToday = currentDay===todayIdx;
  document.getElementById('heroNum').textContent=d.getDate();
  document.getElementById('heroMonth').textContent=MONTHS[d.getMonth()];
  const wd=document.getElementById('heroWeekday');
  wd.textContent = DAYS[currentDay] + (isToday ? ' · сьогодні' : '');
  wd.classList.toggle('today', isToday);
  document.querySelector('.datecard').style.setProperty('--dc', DAY_COLORS[currentDay]);
  const pb=document.getElementById('parityBadge');
  if(settings.showParity){
    const p=weekParity(weekDates[0]);
    pb.textContent = p ? 'Непарний тиждень' : 'Парний тиждень';
    pb.style.display='block';
  } else {
    pb.style.display='none';
  }
}

function renderNowCard(){
  const el=document.getElementById('nowCard');
  const g=GROUPS[currentGroup];
  if(isHoliday(dateKeyFor(todayIdx))){
    el.className='nowcard';
    el.innerHTML='<div class="tag">сьогодні</div><div class="subj">Вихідний — канікули</div><div class="sub">Група '+escapeHtml(g.short)+'</div>';
    return;
  }
  if(isDayFullyEmpty(currentGroup, todayIdx)){
    el.className='nowcard';
    const isWeekend = todayIdx>=5;
    el.innerHTML='<div class="tag">сьогодні</div><div class="subj">Вихідний — занять немає</div><div class="sub">Група '+escapeHtml(g.short)+(isWeekend?' · відпочивайте':' · до понеділка')+'</div>';
    return;
  }
  const now=new Date();
  const nowMin=now.getHours()*60+now.getMinutes();
  const ref=timeRefFor(g.kind);

  let activeIdx=-1, nextIdx=-1;
  for(let i=0;i<ref.length;i++){
    const s=toMin(ref[i].start), e=toMin(ref[i].end);
    if(nowMin>=s && nowMin<e){activeIdx=i; break;}
  }
  if(activeIdx===-1){
    for(let i=0;i<ref.length;i++){ if(toMin(ref[i].start)>nowMin){nextIdx=i; break;} }
  }

  if(activeIdx!==-1){
    const lesson=baseLesson(currentGroup,todayIdx,activeIdx); const sub=subs[subKey(currentGroup,dateKeyFor(todayIdx),activeIdx)];
    const eff=effective(lesson,sub);
    const s=toMin(ref[activeIdx].start), e=toMin(ref[activeIdx].end);
    const pct=Math.max(0,Math.min(100, Math.round((nowMin-s)/(e-s)*100)));
    el.className='nowcard live';
    if(!eff){
      el.innerHTML='<div class="tag">зараз · '+ref[activeIdx].n+'</div><div class="subj">Вікно — пари немає</div>';
    } else {
      const teacherHtml = eff.teacher ? '<span class="teacherlink" data-teacher="'+escapeHtml(eff.teacher)+'">'+escapeHtml(eff.teacher)+'</span>' : '';
      el.innerHTML =
        '<div class="tag">зараз · '+ref[activeIdx].n+'</div>'+
        '<div class="subj">'+(sub?'<span style="color:var(--alert);font-weight:800;">'+escapeHtml(eff.subject)+'</span>':escapeHtml(eff.subject))+(eff.type?' <span style="color:var(--ink-faint);font-weight:600;font-size:.8rem;">· '+escapeHtml(eff.type)+'</span>':'')+(sub?'<span class="badge-now" style="color:#ff4040";"> (заміна)</span>':'')+'</div>'+
        (sub && lesson && sub.subject!==lesson.subject ? '<div class="sub" style="color:var(--ink-faint);">було: '+escapeHtml(lesson.subject)+'</div>' : '')+
        '<div class="sub">'+teacherHtml+(eff.room?' · каб. <span style="color:var(--room);font-weight:700;">'+escapeHtml(eff.room)+'</span>':'')+'</div>'+
        '<div class="progress"><i style="width:'+pct+'%"></i></div>'+
        '<div class="foot"><span>'+ref[activeIdx].start+'</span><span>до кінця '+(e-nowMin)+' хв</span><span>'+ref[activeIdx].end+'</span></div>';
    }
  } else if(nextIdx!==-1){
    const lesson=baseLesson(currentGroup,todayIdx,nextIdx); const sub=subs[subKey(currentGroup,dateKeyFor(todayIdx),nextIdx)];
    const eff=effective(lesson,sub);
    const s=toMin(ref[nextIdx].start);
    const mins=s-nowMin; const hh=Math.floor(mins/60), mm=mins%60;
    el.className='nowcard';
    if(!eff){
      el.innerHTML='<div class="tag">далі · '+ref[nextIdx].n+'</div><div class="subj">Вікно — пари немає</div>';
    } else {
      const teacherHtml = eff.teacher ? '<span class="teacherlink" data-teacher="'+escapeHtml(eff.teacher)+'">'+escapeHtml(eff.teacher)+'</span>' : '';
      el.innerHTML =
        '<div class="tag">далі за '+(hh>0?hh+'г ':'')+mm+'хв · '+ref[nextIdx].n+'</div>'+
        '<div class="subj">'+(sub?'<span style="color:var(--alert);font-weight:800;">'+escapeHtml(eff.subject)+'</span>':escapeHtml(eff.subject))+(eff.type?' <span style="color:var(--ink-faint);font-weight:600;font-size:.8rem;">· '+escapeHtml(eff.type)+'</span>':'')+(sub?'<span class="badge-now" style="color:#eeff95<div></div>;">  змінено</span>':'')+'</div>'+
        (sub && lesson && sub.subject!==lesson.subject ? '<div class="sub" style="color:var(--ink-faint);">було: '+escapeHtml(lesson.subject)+'</div>' : '')+
        '<div class="sub">'+teacherHtml+(eff.room?' · каб. <span style="color:var(--room);font-weight:700;">'+escapeHtml(eff.room)+'</span>':'')+' · о '+ref[nextIdx].start+'</div>';
    }
  } else {
    el.className='nowcard';
    el.innerHTML='<div class="tag">сьогодні</div><div class="subj">Пари закінчились</div><div class="sub">Група '+escapeHtml(g.short)+'</div>';
  }
}

function dayHasSub(dayIdx){
  const g=GROUPS[currentGroup];
  for(let i=0;i<g.days[dayIdx].length;i++){ if(subs[subKey(currentGroup,dateKeyFor(dayIdx),i)]) return true; }
  return false;
}
function renderDayStrip(){
  const el=document.getElementById('dayStrip'); el.innerHTML='';
  for(let i=0;i<7;i++){
    const chip=document.createElement('div');
    chip.className='daychip'+(i===todayIdx?' today':'')+(i===currentDay?' active':'');
    chip.style.setProperty('--dc', DAY_COLORS[i]);
    const holiday=isHoliday(dateKeyFor(i));
    const dot = holiday ? '<div class="dot holiday"></div>' : (dayHasSub(i)?'<div class="dot"></div>':'');
    chip.innerHTML='<div class="dn">'+DAYS_SHORT[i]+'</div><div class="dd">'+weekDates[i].getDate()+'</div>'+dot;
    chip.onclick=()=>{currentDay=i; searchQuery=''; document.getElementById('searchInput').value=''; render();};
    el.appendChild(chip);
  }
}

function renderTabBar(){
  const el=document.getElementById('tabBar'); el.innerHTML='';
  GROUP_IDS.forEach(gid=>{
    const b=document.createElement('div');
    b.className='tabbtn'+(gid===currentGroup?' active':'');
    b.innerHTML='<div class="lbl">'+escapeHtml(GROUPS[gid].short)+'</div><div class="sub">'+(GROUPS[gid].kind==='lessons'?'уроки':'пари')+'</div>';
    b.onclick=async ()=>{currentGroup=gid; currentDay = todayIdx!==null?todayIdx:0; searchQuery=''; document.getElementById('searchInput').value=''; await saveLastGroup(); render();};
    el.appendChild(b);
  });
}

function cardHtml(dayIdx, idx, lesson, ref, showDayLabel){
  const key=subKey(currentGroup,dateKeyFor(dayIdx),idx);
  const sub=subs[key];
  const isToday = dayIdx===todayIdx;
  let isNow=false;
  if(isToday){
    const now=new Date(); const nowMin=now.getHours()*60+now.getMinutes();
    isNow = nowMin>=toMin(ref.start) && nowMin<toMin(ref.end);
  }
  const cls='card'+(sub?' sub':'')+(isNow?' now':'')+(!lesson&&!sub?' empty':'');
  let subjHtml, metaHtml, roomHtml;
  if(!lesson && !sub){
    subjHtml='<span style="color:var(--ink-faint); font-style:italic;">— вільно —</span>';
    metaHtml=''; roomHtml='';
  } else if(sub){
    const origSubj = lesson ? lesson.subject : '';
    const subjDiffers = !lesson || sub.subject !== origSubj;
    if(subjDiffers){
      const origLabel = lesson? lesson.subject : '(вільний слот)';
      subjHtml='<span class="was">Було: '+escapeHtml(origLabel)+'</span><span class="became">Замінено на: '+escapeHtml(sub.subject)+'</span>'+(isNow?'<span class="badge-now">зараз</span>':'');
    } else {
      subjHtml=escapeHtml(sub.subject)+(isNow?'<span class="badge-now">зараз</span>':'');
    }
    const origT = lesson?lesson.teacher:'';
    const teacherName = sub.teacher||origT||'';
    metaHtml='<span'+(teacherName?' class="teacherlink" data-teacher="'+escapeHtml(teacherName)+'"':'')+'>'+escapeHtml(teacherName)+'</span>';
    const origR = lesson?lesson.room:'';
    roomHtml = escapeHtml(sub.room||origR||'');
  } else {
    subjHtml=escapeHtml(lesson.subject)+(lesson.type?' <span class="type">· '+escapeHtml(lesson.type)+'</span>':'')+(isNow?'<span class="badge-now">зараз</span>':'');
    const teacherName = lesson.teacher||'';
    metaHtml='<span'+(teacherName?' class="teacherlink" data-teacher="'+escapeHtml(teacherName)+'"':'')+'>'+escapeHtml(teacherName)+'</span>';
    roomHtml=escapeHtml(lesson.room||'');
  }
  if(homework[key]) subjHtml += ' <span class="hwdot" title="Є домашнє завдання">&#128221;</span>';
  return '<div class="card '+cls.replace('card','').trim()+'" data-key="'+key+'">'+
    '<div class="t"><span class="n">'+ref.n+'</span><br>'+ref.start+'<br>'+ref.end+'</div>'+
    '<div class="body">'+
      (showDayLabel?'<div class="daylabel" style="--dc:'+DAY_COLORS[dayIdx]+'">'+DAYS[dayIdx]+'</div>':'')+
      '<div class="subj">'+subjHtml+'</div>'+
      '<div class="meta">'+metaHtml+(roomHtml?'<span class="room">каб. '+roomHtml+'</span>':'')+'</div>'+
    '</div>'+
    '<div class="pencil">&#9998;</div>'+
  '</div>';
}

function renderList(){
  const box=document.getElementById('scheduleList');
  const label=document.getElementById('listLabel');
  const g=GROUPS[currentGroup];
  const ref=timeRefFor(g.kind);

  if(searchQuery.trim()){
    const q=searchQuery.trim().toLowerCase();
    let html=''; let found=0;
    for(let d=0; d<7; d++){
      g.days[d].forEach((_orig, idx)=>{
        const lesson=baseLesson(currentGroup,d,idx);
        const sub=subs[subKey(currentGroup,dateKeyFor(d),idx)];
        const eff=effective(lesson,sub);
        if(!eff) return;
        const hay=(eff.subject+' '+(eff.teacher||'')).toLowerCase();
        if(hay.includes(q)){ found++; html+=cardHtml(d, idx, lesson, ref[idx], true); }
      });
    }
    label.textContent='Пошук · '+found+' знайдено';
    box.innerHTML = found ? html : '<div class="empty-msg">Нічого не знайдено за «'+escapeHtml(searchQuery)+'»</div>';
  } else {
    label.textContent=DAYS[currentDay];
    const slots=g.days[currentDay];
    let html='';
    slots.forEach((_orig,idx)=>{ const lesson=baseLesson(currentGroup,currentDay,idx); html+=cardHtml(currentDay, idx, lesson, ref[idx], false); });
    box.innerHTML=html;
  }

  box.querySelectorAll('.card').forEach(c=>{
    c.onclick=(e)=>{
      if(e.target.closest('.teacherlink')) return;
      openEditor(c.getAttribute('data-key'));
    };
  });
  box.querySelectorAll('.teacherlink').forEach(t=>{
    t.onclick=(e)=>{ e.stopPropagation(); openTeacherSheet(t.getAttribute('data-teacher')); };
  });
}

function openEditor(key){
  editKey=key;
  editMode='week';
  document.querySelectorAll('#fModeRow .segbtn').forEach(b=>b.classList.toggle('active', b.getAttribute('data-mode')==='week'));

  const [gid,dateKeyStr,slotStr]=key.split('|');
  const dayIdx=weekdayIndexFromDateStr(dateKeyStr), slot=Number(slotStr);
  const lesson=baseLesson(gid,dayIdx,slot);
  const ref=timeRefFor(GROUPS[gid].kind)[slot];
  const sub=subs[key];

  const subjSet=new Set();
  for(let d=0; d<GROUPS[gid].days.length; d++){
    for(let idx=0; idx<GROUPS[gid].days[d].length; idx++){
      const l=baseLesson(gid,d,idx);
      if(l) subjSet.add(l.subject);
    }
  }
  const subjOptions=Array.from(subjSet).sort((a,b)=>a.localeCompare(b,'uk'));
  const currentSubj = sub ? sub.subject : (lesson?lesson.subject:'');
  if(currentSubj && !subjOptions.includes(currentSubj)) subjOptions.push(currentSubj);
  document.getElementById('fSubject').innerHTML = subjOptions.map(s=>'<option value="'+escapeHtml(s)+'">'+escapeHtml(s)+'</option>').join('');
  document.getElementById('fSubject').value = currentSubj;

  const [yy,mm,dd]=dateKeyStr.split('-');
  document.getElementById('editTitle').textContent=DAYS[dayIdx]+' '+dd+'.'+mm+' · '+ref.n+' · '+ref.start+'–'+ref.end;
  document.getElementById('editOrig').textContent = lesson ? ('Оригінал: '+lesson.subject+(lesson.teacher?' · '+lesson.teacher:'')+(lesson.room?' · каб. '+lesson.room:'')) : 'Оригінал: вільний слот';
  document.getElementById('fTeacher').value = sub && sub.teacher ? sub.teacher : (lesson?lesson.teacher:'');
  document.getElementById('fRoom').value = sub && sub.room ? sub.room : (lesson?lesson.room:'');
  document.getElementById('fHomework').value = homework[key] ? (typeof homework[key]==='string' ? homework[key] : homework[key].text) : '';
  const hasOverride = !!sub || Object.prototype.hasOwnProperty.call(customSchedule, permKey(gid,dayIdx,slot));
  document.getElementById('fReset').style.display = hasOverride ? 'inline-block' : 'none';
  document.getElementById('fShareRow').style.display = sub ? 'flex' : 'none';

  document.getElementById('editOverlay').classList.add('open');
}
function closeEditor(){ document.getElementById('editOverlay').classList.remove('open'); editKey=null; }

document.querySelectorAll('#fModeRow .segbtn').forEach(b=>{
  b.onclick=()=>{
    editMode=b.getAttribute('data-mode');
    document.querySelectorAll('#fModeRow .segbtn').forEach(x=>x.classList.toggle('active', x===b));
  };
});

document.getElementById('fSubject').onchange=function(){
  if(!editKey) return;
  const gid=editKey.split('|')[0];
  const d=getSubjectTeacherRoom(gid, this.value);
  document.getElementById('fTeacher').value=d.teacher;
  document.getElementById('fRoom').value=d.room;
};

document.getElementById('fCancel').onclick=closeEditor;
document.getElementById('editOverlay').onclick=(e)=>{ if(e.target.id==='editOverlay') closeEditor(); };
document.getElementById('fSave').onclick=async ()=>{
  if(!editKey) return;
  const [gid,dateKeyStr,slotStr]=editKey.split('|');
  const dayIdx=weekdayIndexFromDateStr(dateKeyStr), slot=Number(slotStr);
  const subject=document.getElementById('fSubject').value.trim();
  const teacher=document.getElementById('fTeacher').value.trim();
  const room=document.getElementById('fRoom').value.trim();
  const hwText=document.getElementById('fHomework').value.trim();
  if(hwText) homework[editKey]={subject: subject || '(без предмета)', text: hwText};
  else delete homework[editKey];
  await saveHomework();

  if(subject){
    if(editMode==='forever'){
      const origLesson = GROUPS[gid].days[dayIdx][slot] || null;
      const pk=permKey(gid,dayIdx,slot);
      const sameAsHardcoded = origLesson && subject===origLesson.subject
        && teacher===(origLesson.teacher||'') && room===(origLesson.room||'');
      if(sameAsHardcoded){ delete customSchedule[pk]; }
      else { customSchedule[pk]={subject,teacher,room}; }
      await saveCustomSchedule();
    } else {
      const lesson=baseLesson(gid,dayIdx,slot);
      const sameAsBase = lesson && subject===lesson.subject
        && teacher===(lesson.teacher||'') && room===(lesson.room||'');
      if(sameAsBase){ delete subs[editKey]; }
      else { subs[editKey]={subject,teacher,room}; }
      await saveSubs();
    }
  }
  closeEditor();
  render();
};
document.getElementById('fReset').onclick=async ()=>{
  if(!editKey) return;
  const [gid,dateKeyStr,slotStr]=editKey.split('|');
  const dayIdx=weekdayIndexFromDateStr(dateKeyStr), slot=Number(slotStr);
  if(subs[editKey]){ delete subs[editKey]; await saveSubs(); }
  else { delete customSchedule[permKey(gid,dayIdx,slot)]; await saveCustomSchedule(); }
  closeEditor();
  render();
};
document.getElementById('fShare').onclick=async ()=>{
  if(!editKey) return;
  const [gid,dateKeyStr,slotStr]=editKey.split('|');
  const dayIdx=weekdayIndexFromDateStr(dateKeyStr), slot=Number(slotStr);
  const lesson=baseLesson(gid,dayIdx,slot);
  const sub=subs[editKey];
  if(!sub) return;
  const ref=timeRefFor(GROUPS[gid].kind)[slot];
  const txt='Заміна ('+DAYS[dayIdx]+', '+ref.n+' · '+ref.start+'–'+ref.end+'): було «'+(lesson?lesson.subject:'вільно')+'», стало «'+sub.subject+'»'+(sub.teacher?' · '+sub.teacher:'')+(sub.room?' · каб. '+sub.room:'');
  if(navigator.share){
    try{ await navigator.share({text:txt}); } catch(e){}
  } else if(navigator.clipboard){
    try{ await navigator.clipboard.writeText(txt); alert('Скопійовано в буфер обміну'); }
    catch(e){ alert(txt); }
  } else {
    alert(txt);
  }
};

function openTeacherSheet(teacherName){
  if(!teacherName) return;
  const g=GROUPS[currentGroup];
  const ref=timeRefFor(g.kind);
  document.getElementById('teacherTitle').textContent=teacherName;
  let html='';
  let count=0;
  for(let d=0; d<7; d++){
    g.days[d].forEach((_orig, idx)=>{
      const lesson=baseLesson(currentGroup,d,idx);
      const sub=subs[subKey(currentGroup,dateKeyFor(d),idx)];
      const eff=effective(lesson,sub);
      if(eff && (eff.teacher||'')===teacherName){
        count++;
        html+='<div class="bellrow"><span class="p">'+DAYS_SHORT[d]+' · '+ref[idx].n+'</span><span>'+escapeHtml(eff.subject)+(eff.room?' · '+escapeHtml(eff.room):'')+'</span></div>';
      }
    });
  }
  document.getElementById('teacherBody').innerHTML = count ? html : '<div class="empty-msg">Пар не знайдено</div>';
  document.getElementById('teacherOverlay').classList.add('open');
}
document.getElementById('teacherClose').onclick=()=>document.getElementById('teacherOverlay').classList.remove('open');
document.getElementById('teacherOverlay').onclick=(e)=>{ if(e.target.id==='teacherOverlay') document.getElementById('teacherOverlay').classList.remove('open'); };

function formatDateKey(dateKeyStr){
  const [y,m,d]=dateKeyStr.split('-');
  return d+'.'+m+'.'+y;
}
function renderHomeworkPage(){
  const body=document.getElementById('homeworkBody');
  const groups={};
  Object.keys(homework).forEach(key=>{
    const entry=homework[key];
    if(!entry) return;
    const subject = typeof entry==='string' ? '(без предмета)' : (entry.subject||'(без предмета)');
    const text = typeof entry==='string' ? entry : (entry.text||'');
    if(!text) return;
    const dateKeyStr = key.split('|')[1] || '';
    if(!groups[subject]) groups[subject]=[];
    groups[subject].push({key, date:dateKeyStr, text});
  });
  const subjects=Object.keys(groups).sort((a,b)=>a.localeCompare(b,'uk'));
  if(!subjects.length){
    body.innerHTML='<div class="empty-msg">Домашніх завдань поки немає. Додайте його у вікні редагування пари.</div>';
    return;
  }
  let html='';
  subjects.forEach(subject=>{
    const items=groups[subject].sort((a,b)=> a.date<b.date ? 1 : -1);
    html+='<div class="hwgroup-title">'+escapeHtml(subject)+'</div>';
    items.forEach(it=>{
      html+='<div class="hwcard" data-key="'+it.key+'"><span class="hwdel" data-del="'+it.key+'">&#10005;</span>'+
            '<div class="hwdate">'+formatDateKey(it.date)+'</div>'+
            '<div class="hwtext">'+escapeHtml(it.text)+'</div></div>';
    });
  });
  body.innerHTML=html;

  body.querySelectorAll('.hwdel').forEach(d=>{
    d.onclick=async (e)=>{
      e.stopPropagation();
      const k=d.getAttribute('data-del');
      delete homework[k];
      await saveHomework();
      renderHomeworkPage();
      render();
    };
  });
  body.querySelectorAll('.hwcard').forEach(c=>{
    c.onclick=()=>{
      const key=c.getAttribute('data-key');
      document.getElementById('homeworkOverlay').classList.remove('open');
      const gid=key.split('|')[0];
      if(GROUPS[gid]) currentGroup=gid;
      render();
      openEditor(key);
    };
  });
}
document.getElementById('homeworkBtn').onclick=()=>{ renderHomeworkPage(); document.getElementById('homeworkOverlay').classList.add('open'); };
document.getElementById('homeworkClose').onclick=()=>document.getElementById('homeworkOverlay').classList.remove('open');
document.getElementById('homeworkOverlay').onclick=(e)=>{ if(e.target.id==='homeworkOverlay') document.getElementById('homeworkOverlay').classList.remove('open'); };

function renderBellSheet(){
  const g=GROUPS[currentGroup];
  const body=document.getElementById('bellBody');
  document.getElementById('bellTitle').textContent = g.kind==='lessons' ? 'Дзвінки · '+g.short : 'Час пар · '+g.short;
  let html='';
  const ref=timeRefFor(g.kind);
  ref.forEach(p=>{
    if(p.noteAfter) html+='<div class="bellnote">'+escapeHtml(p.noteAfter)+'</div>';
    html+='<div class="bellrow"><span class="p">'+p.n+'</span><span>'+p.start+' – '+p.end+'</span></div>';
  });
  body.innerHTML=html;
}
document.getElementById('bellChip').onclick=()=>{ renderBellSheet(); document.getElementById('bellOverlay').classList.add('open'); };
document.getElementById('bellClose').onclick=()=>document.getElementById('bellOverlay').classList.remove('open');
document.getElementById('bellOverlay').onclick=(e)=>{ if(e.target.id==='bellOverlay') document.getElementById('bellOverlay').classList.remove('open'); };

function renderSettingsUI(){
  document.querySelectorAll('[data-theme-btn]').forEach(b=>b.classList.toggle('active', b.getAttribute('data-theme-btn')===settings.theme));
  document.querySelectorAll('[data-font-btn]').forEach(b=>b.classList.toggle('active', Number(b.getAttribute('data-font-btn'))===settings.fontScale));
  document.getElementById('toggleNotif').classList.toggle('on', !!settings.notifications);
  document.getElementById('toggleParity').classList.toggle('on', !!settings.showParity);
  document.getElementById('fHolidays').value = holidays.join(', ');
}
document.getElementById('settingsBtn').onclick=()=>{ renderSettingsUI(); document.getElementById('settingsOverlay').classList.add('open'); };
document.getElementById('settingsClose').onclick=()=>document.getElementById('settingsOverlay').classList.remove('open');
document.getElementById('settingsOverlay').onclick=(e)=>{ if(e.target.id==='settingsOverlay') document.getElementById('settingsOverlay').classList.remove('open'); };

document.querySelectorAll('[data-theme-btn]').forEach(b=>{
  b.onclick=async ()=>{ settings.theme=b.getAttribute('data-theme-btn'); applyTheme(); renderSettingsUI(); await saveSettings(); };
});
document.querySelectorAll('[data-font-btn]').forEach(b=>{
  b.onclick=async ()=>{ settings.fontScale=Number(b.getAttribute('data-font-btn')); applyFontScale(); renderSettingsUI(); await saveSettings(); };
});
document.getElementById('toggleNotif').onclick=async ()=>{
  if(!settings.notifications){
    if('Notification' in window){
      try{
        const perm = await Notification.requestPermission();
        settings.notifications = perm==='granted';
      } catch(e){ settings.notifications=false; }
    } else {
      alert('Цей браузер не підтримує сповіщення.');
      settings.notifications=false;
    }
  } else {
    settings.notifications=false;
  }
  renderSettingsUI();
  await saveSettings();
};
document.getElementById('toggleParity').onclick=async ()=>{
  settings.showParity = !settings.showParity;
  renderSettingsUI();
  await saveSettings();
  renderHeroDate();
};
document.getElementById('saveHolidaysBtn').onclick=async ()=>{
  const raw=document.getElementById('fHolidays').value;
  holidays = raw.split(',').map(s=>s.trim()).filter(s=>/^\d{4}-\d{2}-\d{2}$/.test(s));
  await saveHolidays();
  render();
  alert('Збережено: '+holidays.length+' дат(и)');
};
document.getElementById('openHistoryBtn').onclick=()=>{ renderHistorySheet(); document.getElementById('settingsOverlay').classList.remove('open'); document.getElementById('historyOverlay').classList.add('open'); };

function renderHistorySheet(){
  const body=document.getElementById('historyBody');
  if(!subsHistory.length){ body.innerHTML='<div class="empty-msg">Історія порожня</div>'; return; }
  let html='';
  subsHistory.forEach(entry=>{
    html+='<div class="histweek"><div class="hw-title">Тиждень з '+escapeHtml(entry.week)+'</div>';
    const keys=Object.keys(entry.subs||{});
    if(!keys.length){ html+='<div class="hw-item">Без замін</div>'; }
    keys.forEach(k=>{
      const [gid,dateKeyStr,slotStr]=k.split('|');
      const slot=Number(slotStr);
      let dayIdx=0;
      try{ dayIdx=weekdayIndexFromDateStr(dateKeyStr); }catch(e){}
      const sub=entry.subs[k];
      const grp = GROUPS[gid] ? GROUPS[gid].short : gid;
      html+='<div class="hw-item">'+escapeHtml(grp)+' · '+DAYS_SHORT[dayIdx]+' · '+(slot+1)+': <b>'+escapeHtml(sub.subject)+'</b>'+(sub.teacher?' · '+escapeHtml(sub.teacher):'')+(sub.room?' · каб. '+escapeHtml(sub.room):'')+'</div>';
    });
    html+='</div>';
  });
  body.innerHTML=html;
}
document.getElementById('historyClose').onclick=()=>document.getElementById('historyOverlay').classList.remove('open');
document.getElementById('historyOverlay').onclick=(e)=>{ if(e.target.id==='historyOverlay') document.getElementById('historyOverlay').classList.remove('open'); };

function roundRectPath(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}
function exportImage(){
  const g=GROUPS[currentGroup];
  const ref=timeRefFor(g.kind);
  const dayIdx = searchQuery.trim() ? (todayIdx!==null?todayIdx:0) : currentDay;
  const items=[];
  g.days[dayIdx].forEach((_orig, idx)=>{
    const lesson=baseLesson(currentGroup,dayIdx,idx);
    const sub=subs[subKey(currentGroup,dateKeyFor(dayIdx),idx)];
    const eff=effective(lesson,sub);
    items.push({idx, ref:ref[idx], lesson, sub, eff});
  });
  const W=720, rowH=78, headH=118;
  const H=headH+items.length*rowH+30;
  const cv=document.createElement('canvas'); cv.width=W; cv.height=H;
  const ctx=cv.getContext('2d');
  ctx.fillStyle='#14171a'; ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#e7e5de'; ctx.font='bold 28px sans-serif';
  ctx.fillText('Розклад · Група '+g.short, 24, 46);
  ctx.fillStyle='#9a9d9a'; ctx.font='16px sans-serif';
  const d=weekDates[dayIdx];
  ctx.fillText(DAYS[dayIdx]+' · '+pad(d.getDate())+'.'+pad(d.getMonth()+1)+'.'+d.getFullYear(), 24, 76);
  let y=headH;
  items.forEach(it=>{
    ctx.fillStyle = it.sub ? '#241a18' : '#1c2023';
    roundRectPath(ctx, 20, y, W-40, rowH-12, 12); ctx.fill();
    ctx.fillStyle='#b3d17e'; ctx.font='bold 15px monospace';
    ctx.fillText(String(it.ref.n), 34, y+26);
    ctx.font='12px monospace';
    ctx.fillText(it.ref.start, 34, y+42);
    ctx.fillText(it.ref.end, 34, y+56);
    ctx.fillStyle = it.sub ? '#ff6a55' : '#e7e5de';
    ctx.font='bold 18px sans-serif';
    const subjTxt = it.eff ? it.eff.subject : '— вільно —';
    ctx.fillText(subjTxt, 90, y+28);
    ctx.fillStyle='#9a9d9a'; ctx.font='13px sans-serif';
    const metaTxt = it.eff ? (it.eff.teacher||'') : '';
    ctx.fillText(metaTxt, 90, y+50);
    if(it.eff && it.eff.room){
      const mw=ctx.measureText(metaTxt).width;
      ctx.fillStyle='#cf8a76'; ctx.font='12px monospace';
      ctx.fillText('каб. '+it.eff.room, 90+mw+(metaTxt?14:0), y+50);
    }
    y+=rowH;
  });
  cv.toBlob(function(blob){
    if(!blob){ alert('Не вдалося створити зображення'); return; }
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download='rozklad_'+g.short+'_'+DAYS_SHORT[dayIdx]+'.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 5000);
  });
}
document.getElementById('imgChip').onclick=exportImage;

document.getElementById('searchInput').oninput=(e)=>{ searchQuery=e.target.value; renderList(); };

(function(){
  const list=document.getElementById('scheduleList');
  let x0=null, y0=null, dragging=false;
  list.addEventListener('touchstart', e=>{
    if(searchQuery.trim()) return;
    x0=e.touches[0].clientX; y0=e.touches[0].clientY; dragging=true;
    list.style.transition='none';
  }, {passive:true});
  list.addEventListener('touchmove', e=>{
    if(!dragging || x0===null) return;
    const dx=e.touches[0].clientX-x0, dy=e.touches[0].clientY-y0;
    if(Math.abs(dx)>Math.abs(dy)) list.style.transform='translateX('+(dx*0.55)+'px)';
  }, {passive:true});
  list.addEventListener('touchend', e=>{
    dragging=false;
    list.style.transition='transform .2s ease';
    if(x0===null || searchQuery.trim()){ list.style.transform=''; x0=null; return; }
    const dx=e.changedTouches[0].clientX-x0, dy=e.changedTouches[0].clientY-y0;
    list.style.transform='';
    if(Math.abs(dx)>60 && Math.abs(dy)<50){
      if(dx<0 && currentDay<6){ currentDay++; render(); }
      else if(dx>0 && currentDay>0){ currentDay--; render(); }
    }
    x0=null;
  }, {passive:true});
})();

function fireNotify(title, body){
  try{
    if('Notification' in window && Notification.permission==='granted'){
      new Notification(title, {body:body, silent:false});
    }
  } catch(e){}
  if(navigator.vibrate){ try{ navigator.vibrate([160,60,160]); }catch(e){} }
}
function maybeNotify(){
  if(!settings.notifications) return;
  if(!('Notification' in window) || Notification.permission!=='granted') return;
  if(isHoliday(dateKeyFor(todayIdx))) return;
  const g=GROUPS[currentGroup];
  const ref=timeRefFor(g.kind);
  const now=new Date();
  const nowMin=now.getHours()*60+now.getMinutes();
  const dk=dateKeyFor(todayIdx);
  for(let i=0;i<ref.length;i++){
    const s=toMin(ref[i].start), e=toMin(ref[i].end);
    const lesson=baseLesson(currentGroup, todayIdx, i);
    const sub=subs[subKey(currentGroup,dk,i)];
    const eff=effective(lesson,sub);
    if(!eff) continue;
    const endKey='end|'+dk+'|'+i;
    if(nowMin>=e-5 && nowMin<e && !notifiedSet.has(endKey)){
      fireNotify('Скоро кінець пари', eff.subject+' закінчується о '+ref[i].end);
      notifiedSet.add(endKey);
    }
    const startKey='start|'+dk+'|'+i;
    if(nowMin===s && !notifiedSet.has(startKey)){
      fireNotify('Почалась пара', eff.subject+(eff.room?' · каб. '+eff.room:''));
      notifiedSet.add(startKey);
    }
  }
}

if('serviceWorker' in navigator && (location.protocol==='https:' || location.protocol==='http:')){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  });
}

function render(){
  renderHeroDate();
  renderNowCard();
  renderDayStrip();
  renderTabBar();
  renderList();
}

(async function init(){
  computeWeekDates();
  await loadLastGroup();
  await loadAllExtra();
  applyTheme();
  applyFontScale();
  currentDay = todayIdx!==null ? todayIdx : 0;
  document.getElementById('scheduleList').innerHTML='<div class="empty-msg">Завантаження…</div>';
  const hint=document.getElementById('storageHint');
  if(hint) hint.textContent = hasCloudStorage()
    ? 'Зміни бачить кожен, хто відкриє цю сторінку.'
    : 'Зміни зберігаються тільки в цьому браузері на цьому пристрої.';
  renderTabBar();
  await loadSubs();
  pruneExpiredSubs();
  render();
  renderClock();
  maybeNotify();
  setInterval(()=>{
    computeWeekDates();
    pruneExpiredSubs();
    renderClock();
    render();
    maybeNotify();
  }, 60000);
})();