export const STORAGE_KEY = 'number-base-trainer-v1';
export const REQUIRED_STREAK = 2;
const HEX = '0123456789ABCDEF';
export const PAIRS = [8, 16].flatMap(base => Array.from({length: base}, (_, n) => ({
  id: `${base}-${n}`, base, value: HEX[n], binary: n.toString(2).padStart(base === 8 ? 3 : 4, '0'), n
})));
export const SKILLS = PAIRS.flatMap(p => ['forward', 'reverse'].map(direction => ({
  id: `${p.id}-${direction}`, pairId: p.id, base: p.base, direction,
  source: direction === 'forward' ? p.binary : p.value,
  sourceBase: direction === 'forward' ? 2 : p.base,
  answer: direction === 'forward' ? p.value : p.binary,
  targetBase: direction === 'forward' ? p.base : 2, n: p.n
})));
export const BY_ID = Object.fromEntries(SKILLS.map(s => [s.id, s]));
export const STAGES = [
  {id:'octal', title:'Двоичная и восьмеричная', short:'2 ↔ 8', filter:s => s.base === 8},
  {id:'hex-low', title:'Шестнадцатеричная от 0 до 7', short:'2 ↔ 16 · 0-7', filter:s => s.base === 16 && s.n < 8},
  {id:'hex-high', title:'Шестнадцатеричная от 8 до F', short:'2 ↔ 16 · 8-F', filter:s => s.base === 16 && s.n >= 8},
  {id:'mixed', title:'Смешанная тренировка', short:'Все комбинации', filter:() => true}
];
const blankSkill = () => ({introduced:false, attempts:0, correct:0, streak:0, mistakes:0, lastSeenAt:0, recall:0});
export function freshState() {
  return {version:1, skills:Object.fromEntries(SKILLS.map(s => [s.id, blankSkill()])), session:null, exam:null, result:null, deferred:[], lastQuestion:null};
}
export function hydrate(raw) {
  const state = freshState();
  if (!raw || raw.version !== 1) return state;
  state.deferred=Array.isArray(raw.deferred)?raw.deferred.filter(r=>BY_ID[r.id]&&Number.isFinite(r.remaining)&&r.remaining>=0):[];
  state.lastQuestion=BY_ID[raw.lastQuestion]?raw.lastQuestion:null;
  for (const s of SKILLS) {
    const saved = raw.skills?.[s.id];
    if (!saved) continue;
    for (const key of ['attempts','correct','streak','mistakes','lastSeenAt','recall'])
      state.skills[s.id][key] = Number.isFinite(saved[key]) ? Math.max(0, Math.min(saved[key], key === 'streak' ? 2 : Number.MAX_SAFE_INTEGER)) : 0;
    state.skills[s.id].introduced = saved.introduced === true;
  }
  if (raw.session && ['active','flash'].includes(raw.session.mode) && BY_ID[raw.session.current] && STAGES.some(s => s.id === raw.session.stage)) {
    const s = raw.session;
    if (Number.isInteger(s.step) && s.step >= 0 && s.step < 12 && Array.isArray(s.recent) && Array.isArray(s.retry)) {
      state.session = {mode:s.mode, stage:s.stage, step:s.step, limit:Math.min(12, Math.max(s.step+1, Number(s.limit)||12)),
        current:s.current, recent:s.recent.filter(id => BY_ID[id]).slice(-5),
        retry:s.retry.filter(r => BY_ID[r.id] && Number.isFinite(r.due)),
        preferred:(s.preferred||[]).filter(id => BY_ID[id]),
        flashPool:(s.flashPool||[]).filter(id => BY_ID[id]),
        feedback:s.feedback && typeof s.feedback.ok === 'boolean' ? s.feedback : null,
        right:Number(s.right)||0, wrong:Number(s.wrong)||0};
    }
  }
  if (raw.exam && Array.isArray(raw.exam.order) && raw.exam.order.length === 48 && new Set(raw.exam.order).size === 48 && raw.exam.order.every(id => BY_ID[id])) {
    state.exam = {order:raw.exam.order, answers:raw.exam.order.map((_,i) => String(raw.exam.answers?.[i]||'').slice(0,8)), index:Math.min(47,Math.max(0,Number(raw.exam.index)||0))};
  }
  if (raw.result && Array.isArray(raw.result.mistakes)) {
    state.result = {score:Math.min(48,Math.max(0,Number(raw.result.score)||0)), mistakes:raw.result.mistakes.filter(m => BY_ID[m.id]).map(m => ({id:m.id,answer:String(m.answer||'').slice(0,8)})), at:Number(raw.result.at)||0};
  }
  return state;
}
export function skillLevel(p) { return p.streak >= 2 ? 3 : p.streak === 1 ? 2 : p.introduced || p.attempts ? 1 : 0; }
export function pairMastered(state,pairId) { return ['forward','reverse'].every(d => state.skills[`${pairId}-${d}`].streak >= REQUIRED_STREAK); }
export function counts(state,base) {
  const pairs = PAIRS.filter(p => !base || p.base === base);
  return {total:pairs.length, mastered:pairs.filter(p => pairMastered(state,p.id)).length,
    directions:SKILLS.filter(s => (!base || s.base===base) && state.skills[s.id].streak>=2).length};
}
export function testReady(state) { return counts(state).mastered === 24; }
export function nextStage(state) { return STAGES.slice(0,3).find(st => SKILLS.filter(st.filter).some(s => state.skills[s.id].streak < 2)) || STAGES[3]; }
export function recordAnswer(state,id,ok,now=Date.now()) {
  const p = state.skills[id];
  p.introduced=true; p.attempts++; p.lastSeenAt=now;
  if (ok) { p.correct++; p.streak=Math.min(2,p.streak+1); }
  else { p.mistakes++; p.streak=0; }
}
export function recordRecall(state,id,rating,now=Date.now()) {
  const s = BY_ID[id];
  for (const d of ['forward','reverse']) state.skills[`${s.pairId}-${d}`].introduced=true;
  state.skills[id].recall=rating;
  state.skills[id].lastSeenAt=now;
}
export function validInput(skill,value) {
  const v = String(value).trim().toUpperCase();
  if (!v) return false;
  return skill.targetBase === 2 ? /^[01]{1,4}$/.test(v) : skill.targetBase === 8 ? /^[0-7]$/.test(v) : /^[0-9A-F]$/.test(v);
}
export function correctInput(skill,value) {
  return String(value).trim().toUpperCase() === skill.answer;
}
export function chooseQuestion(state,session,rng=Math.random) {
  const stage = STAGES.find(s => s.id === session.stage) || STAGES[3];
  let pool = SKILLS.filter(stage.filter);
  if (session.mode === 'flash' && session.flashPool?.length) pool = session.flashPool.map(id => BY_ID[id]);
  const last = session.recent.at(-1);
  const eligible = pool.filter(s => s.id !== last && !session.retry.some(r => r.id===s.id && r.due>session.step));
  const due = session.retry.filter(r => r.due<=session.step && r.id!==last).sort((a,b) => a.due-b.due)[0];
  if (due && session.mode === 'active') return due.id;
  const candidates = eligible.filter(s => !session.recent.slice(-3).includes(s.id));
  const choices = candidates.length ? candidates : eligible.length ? eligible : pool.filter(s => s.id!==last);
  if (!choices.length) return null;
  return choices.map(s => {
    const p=state.skills[s.id];
    const activePriority = (2-p.streak)*100 + Math.min(p.mistakes,5)*8;
    return {id:s.id, rank:(session.mode==='active' ? activePriority : !p.introduced ? 300 : 0)
      + (session.preferred?.includes(s.id) && p.streak<2 ? 350 : 0)
      + (last && BY_ID[last].direction!==s.direction ? 35 : 0)
      + (p.lastSeenAt ? Math.min((Date.now()-p.lastSeenAt)/3600000,20) : 25) + rng()*30};
  }).sort((a,b) => b.rank-a.rank)[0].id;
}
export function newSession(state,mode,stageId,preferred=[],rng=Math.random) {
  const stage=STAGES.find(s => s.id===stageId)||STAGES[3];
  const pending=SKILLS.filter(s => stage.filter(s) && s.direction==='forward' && !state.skills[s.id].introduced);
  const session={mode,stage:stage.id,step:0,limit:mode==='flash' && pending.length ? Math.min(12,pending.length) : 12,
    current:null,recent:state.lastQuestion?[state.lastQuestion]:[],retry:[],preferred,flashPool:mode==='flash' && pending.length ? pending.map(s=>s.id) : [],feedback:null,right:0,wrong:0};
  if(mode==='active'){
    session.retry=state.deferred.filter(r=>stage.filter(BY_ID[r.id])).map(r=>({id:r.id,due:r.remaining}));
    state.deferred=state.deferred.filter(r=>!stage.filter(BY_ID[r.id]));
  }
  session.current=chooseQuestion(state,session,rng);
  return session;
}
export function submitActive(state,session,input,rng=Math.random) {
  if (session.feedback || !validInput(BY_ID[session.current],input)) return false;
  const ok=correctInput(BY_ID[session.current],input);
  recordAnswer(state,session.current,ok);
  session[ok?'right':'wrong']++;
  session.retry=session.retry.filter(r=>r.id!==session.current);
  if (!ok) session.retry.push({id:session.current,due:session.step+4+Math.floor(rng()*3)});
  session.feedback={ok,input:String(input).trim().toUpperCase()};
  return true;
}
export function advanceSession(state,session,rng=Math.random) {
  state.lastQuestion=session.current;
  session.recent.push(session.current); session.recent=session.recent.slice(-5); session.step++; session.feedback=null;
  if (session.mode==='flash' && session.flashPool.length) session.flashPool=session.flashPool.filter(id=>id!==session.current);
  if (session.step>=session.limit) {
    state.deferred.push(...session.retry.map(r=>({id:r.id,remaining:Math.max(0,r.due-session.step)})));
    return false;
  }
  session.current=chooseQuestion(state,session,rng);
  return Boolean(session.current);
}
export function shuffled(items,rng=Math.random) {
  const a=[...items]; for(let i=a.length-1;i>0;i--) {const j=Math.floor(rng()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a;
}
export function finishExam(state) {
  const e=state.exam;
  const mistakes=[];
  e.order.forEach((id,i)=>{
    const ok=correctInput(BY_ID[id],e.answers[i]);
    if(!ok) {mistakes.push({id,answer:e.answers[i]}); recordAnswer(state,id,false);}
  });
  state.result={score:48-mistakes.length,mistakes,at:Date.now()}; state.exam=null;
  return state.result;
}
