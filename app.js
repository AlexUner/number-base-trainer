import {STORAGE_KEY, PAIRS, SKILLS, BY_ID, STAGES, freshState, hydrate, counts, testReady, nextStage,
  newSession, suspendSession, submitActive, advanceSession, recordRecall, validInput, shuffled, finishExam} from './engine.mjs';

const app=document.querySelector('#app');
let storageWarning=false, view='home', input='', revealed=false, validation='', summary=null;
let state;
try { state=hydrate(JSON.parse(localStorage.getItem(STORAGE_KEY))); } catch {state=freshState();storageWarning=true;}
function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{storageWarning=true;}}
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(value,base)=>`<span>${escape(value)}<sub>${base}</sub></span>`;
const equation=(s,answer=false)=>`<span>${num(s.source,s.sourceBase)}<span class="arrow">${answer?'=':'→'}</span>${num(answer?s.answer:'?',s.targetBase)}</span>`;
const button=(label,action,kind='',extra='')=>`<button type="button" class="button ${kind}" data-action="${action}" ${extra}>${label}</button>`;
const bar=(n,total)=>`<div class="bar" role="progressbar" aria-valuenow="${n}" aria-valuemin="0" aria-valuemax="${total}" aria-label="Прогресс"><span style="--fill:${n/total*100}%"></span></div>`;
function notice(){return storageWarning?'<p class="notice" role="status">Браузер не сохраняет прогресс. Разреши хранение данных сайта, чтобы продолжить позже.</p>':'';}
function focusScreen(){app.focus({preventScroll:true});window.scrollTo(0,0);}
function home(){
  const c=counts(state),o=counts(state,8),h=counts(state,16),stage=nextStage(state);
  return `${notice()}<header class="heading"><h1>Системы счисления</h1><p>Запомни двоичные комбинации для 8 и 16.</p></header>
    <section class="overview" aria-label="Освоение"><div class="progress-copy"><strong>Освоено ${c.mastered} из 24 пар</strong><span class="muted">${Math.round(c.mastered/24*100)}%</span></div>${bar(c.mastered,24)}<p class="directions">${c.directions} из 48 направлений закреплены</p>
    <div class="topic-rows"><div class="topic-row"><span class="topic-label mono">2 ↔ 8</span><span class="topic-count">${o.mastered} / 8 освоено</span></div><div class="topic-row"><span class="topic-label mono">2 ↔ 16</span><span class="topic-count">${h.mastered} / 16 освоено</span></div></div></section>
    <div class="actions">${button(state.session?'Продолжить сессию':'Продолжить тренировку','continue','primary')}${button('Таблицы','tables')}
    ${state.exam?button('Продолжить итоговый тест','exam'):button('Пройти итоговый тест','exam','',testReady(state)?'':'disabled')}</div>
    ${!testReady(state)&&!state.exam?'<p class="test-lock">Тест откроется, когда освоены все 24 пары.</p>':''}
    <p class="fine-print">${state.session?'Сессия сохранена.':`Следующий блок: ${stage.title}.`} Обычно 12 карточек, около 3-5 минут.</p>
    <details class="options"><summary>Выбрать тренировку</summary><div class="options-inner"><label for="stage">Блок</label><select id="stage">${STAGES.map(s=>`<option value="${s.id}" ${stage.id===s.id?'selected':''}>${s.title}</option>`).join('')}</select><div class="two-buttons">${button('Ввести ответы','active')}${button('Вспомнить и открыть','flash')}</div></div></details>
    ${state.result?`<p class="result-tag">Последний тест: ${state.result.score} / 48. <button class="link-button" data-action="results">Посмотреть результат</button></p>`:''}
    <details class="options"><summary>Как считается прогресс</summary><div class="rules"><p>Пара освоена после двух правильных ответов подряд в каждом направлении. Ошибка сбрасывает серию только в этом направлении.</p><p>Новая → Изучаю → Закрепляю → Освоена. Открытие ответа помогает знакомиться с таблицей, но не засчитывается как правильный ответ.</p><p>Двоичные ответы вводи полностью: три цифры для восьмеричной системы, четыре для шестнадцатеричной. Например, 5₈ = 101₂, а 5₁₆ = 0101₂.</p></div></details>
    <p class="fine-print">Прогресс сохраняется в этом браузере. На другом устройстве тренировка начнется заново.</p>`;
}
function keypad(s){
  const chars=s.targetBase===2?'01':s.targetBase===8?'01234567':'0123456789ABCDEF';
  return `<div class="keypad ${s.targetBase===2?'binary':''}" aria-label="Клавиатура ответа">${[...chars].map(c=>`<button type="button" class="key" data-key="${c}">${c}</button>`).join('')}<button type="button" class="key erase" data-action="erase">Стереть последнюю цифру</button></div>`;
}
function answerInput(s,value){return `<label class="input-label" for="answer">${s.targetBase===2?`Ответ из ${s.base===8?'трех':'четырех'} двоичных цифр`:`Одна ${s.targetBase===8?'восьмеричная':'шестнадцатеричная'} цифра`}</label><div class="input-wrap"><input id="answer" aria-describedby="validation" autocomplete="off" autocapitalize="characters" spellcheck="false" inputmode="none" maxlength="${s.targetBase===2?(s.base===8?3:4):1}" value="${escape(value)}"><sub>${s.targetBase}</sub></div><p class="validation" id="validation" role="status">${escape(validation)}</p>`;}
function training(){
  const ses=state.session,s=BY_ID[ses.current],stage=STAGES.find(st=>st.id===ses.stage);
  let content=`<div class="session-top"><button class="link-button" data-action="home">На главную</button><span>${ses.step+1} / ${ses.limit}</span></div>${bar(ses.step,ses.limit)}<h1 class="session-title">${stage.title}</h1><p class="session-help">${ses.mode==='flash'?'Вспомни ответ, затем проверь себя.':'Введи ответ самостоятельно.'}</p>`;
  if(ses.mode==='flash')return content+`<section class="card"><div class="equation">${equation(s)}</div>${revealed?`<div class="answer-reveal"><div class="equation">${equation(s,true)}</div><p class="small muted">Насколько уверенно ты вспомнила?</p></div><div class="ratings">${button('Не помнила','rate-0')}${button('Почти','rate-1')}${button('Знала','rate-2')}</div>`:`<div class="actions">${button('Показать ответ','reveal','primary')}</div>`}</section><p class="session-footer">Знакомство с таблицей не повышает освоение.</p>`;
  if(ses.feedback)return content+`<section class="card"><div class="equation">${equation(s)}</div><div class="feedback ${ses.feedback.ok?'':'wrong'}" role="status"><strong>${ses.feedback.ok?'Верно':'Пока неверно'}</strong><div class="equation">${equation(s,true)}</div>${!ses.feedback.ok?`<p class="small">Твой ответ: <span class="mono">${escape(ses.feedback.input)}</span>. Повторим через несколько карточек.</p>`:''}</div></section><div class="submit-zone">${button(ses.step+1===ses.limit?'Завершить сессию':'Следующая карточка','next','primary')}</div>`;
  return content+`<section class="card"><div class="equation">${equation(s)}</div>${answerInput(s,input)}${keypad(s)}</section><div class="submit-zone">${button('Ответить','submit','primary',input?'':'disabled')}</div><p class="session-footer">На компьютере: цифры и A-F для ввода, Enter для ответа.</p>`;
}
function tables(){return `<button class="link-button" data-action="home">На главную</button><header class="heading section-gap"><h1>Таблицы перевода</h1><p>Три двоичные цифры для 8, четыре для 16.</p></header>${[8,16].map(base=>`<section class="reference-section"><h2 class="mono">2 ↔ ${base}</h2><table class="reference-table"><thead><tr><th scope="col">Двоичная</th><th scope="col">${base===8?'Восьмеричная':'Шестнадцатеричная'}</th></tr></thead><tbody>${PAIRS.filter(p=>p.base===base).map(p=>`<tr><td>${p.binary}<sub>2</sub></td><td>${p.value}<sub>${base}</sub></td></tr>`).join('')}</tbody></table></section>`).join('')}<p class="fine-print">A = 10, B = 11, C = 12, D = 13, E = 14, F = 15.</p><div class="actions">${button('На главную','home')}</div>`;}
function sessionSummary(){return `<header class="heading"><h1>Сессия завершена</h1><p>${summary.mode==='flash'?`Познакомились с ${summary.step} комбинациями.`:`Правильных ответов ${summary.right} из ${summary.step}.`}</p></header><div class="big-result">${counts(state).mastered} <span class="muted">/ 24</span></div><p>пар освоено</p><p class="summary-text">${summary.mode==='flash'?'Теперь попробуй вспомнить ответы без подсказки.':summary.wrong?'Ошибки сохранены. Они получат приоритет в следующей тренировке.':'Продолжай, чтобы закрепить обе стороны каждой пары.'}</p><div class="actions">${button(summary.mode==='flash'?'Попробовать ввод ответа':'Продолжить тренировку','summary-continue','primary')}${button('На главную','home')}</div>`;}
function examView(){
  const e=state.exam,s=BY_ID[e.order[e.index]];
  return `<div class="session-top"><button class="link-button" data-action="home">Сохранить и выйти</button><span>${e.index+1} / 48</span></div>${bar(e.index+1,48)}<h1 class="session-title">Итоговый тест</h1><p class="session-help">Ответы можно менять. Проверка после завершения.</p><section class="card"><div class="equation">${equation(s)}</div>${answerInput(s,input)}${keypad(s)}</section><div class="exam-nav">${button('Назад','exam-back','',e.index===0?'disabled':'')}${button(e.index===47?'Проверить тест':'Дальше',e.index===47?'finish-exam':'exam-next','primary',input?'':'disabled')}</div><p class="session-footer">48 вопросов охватывают всю таблицу в обоих направлениях.</p>`;
}
function results(){const r=state.result;return `<header class="heading"><h1>Результат теста</h1><p>${r.score===48?'Все направления проверены.':'Разберем комбинации, которые пока путаются.'}</p></header><div class="big-result">${r.score} <span class="muted">/ 48</span></div><p>${Math.round(r.score/48*100)}% правильных ответов</p>${r.mistakes.length?`<section class="errors"><h2>Что повторить</h2>${r.mistakes.map(m=>`<div class="error-row"><div class="mono">${equation(BY_ID[m.id],true)}</div><p>Твой ответ: <span class="mono">${escape(m.answer||'нет ответа')}</span></p></div>`).join('')}</section><div class="actions">${button(`Потренировать ошибки · ${r.mistakes.length}`,'practice-errors','primary')}${button('На главную','home')}</div>`:`<div class="actions">${button('Смешанная тренировка','mixed','primary')}${button('На главную','home')}</div>`}`;}
function render(){app.innerHTML=noticeIfTraining()+({home,training,tables,summary:sessionSummary,exam:examView,results}[view])();}
function noticeIfTraining(){return view==='home'?'':notice();}
function start(mode,stage,preferred=[]){suspendSession(state);state.session=newSession(state,mode,stage,preferred);input='';validation='';revealed=false;view='training';save();render();focusScreen();}
function setInput(value){
  const s=view==='exam'?BY_ID[state.exam.order[state.exam.index]]:BY_ID[state.session.current];
  const pattern=s.targetBase===2?/[^01]/g:s.targetBase===8?/[^0-7]/g:/[^0-9A-F]/g;
  input=String(value).toUpperCase().replace(pattern,'').slice(0,s.targetBase===2?(s.base===8?3:4):1);
  if(view==='exam'){state.exam.answers[state.exam.index]=input;save();}
  validation='';const field=document.querySelector('#answer');if(field)field.value=input;
  document.querySelector('#validation').textContent='';
  for(const b of document.querySelectorAll('[data-action="submit"],[data-action="exam-next"],[data-action="finish-exam"]'))b.disabled=!input;
}
function inputCheck(s){
  if(!validInput(s,input)){validation='Введи ответ допустимыми цифрами.';render();return false;}
  return true;
}
function changeExam(delta){const e=state.exam,s=BY_ID[e.order[e.index]];if(delta>0&&!inputCheck(s))return;e.answers[e.index]=input;e.index+=delta;input=e.answers[e.index];validation='';save();render();focusScreen();}
function action(name){
  if(name==='home'){view='home';validation='';save();render();focusScreen();}
  else if(name==='tables'){view='tables';render();focusScreen();}
  else if(name==='continue'){
    if(state.session){view='training';input='';revealed=false;validation='';render();focusScreen();}
    else {const stage=nextStage(state);const newPairs=PAIRS.filter(p=>stage.filter(BY_ID[`${p.id}-forward`])&&!state.skills[`${p.id}-forward`].introduced);start(newPairs.length?'flash':'active',stage.id);}
  }
  else if(name==='active'||name==='flash')start(name,document.querySelector('#stage').value);
  else if(name==='mixed')start('active','mixed');
  else if(name==='reveal'){revealed=true;render();}
  else if(name.startsWith('rate-')&&view==='training'&&revealed){recordRecall(state,state.session.current,Number(name.at(-1)));advance();}
  else if(name==='erase'&&(view==='exam'||view==='training'))setInput(input.slice(0,-1));
  else if(name==='submit'&&view==='training'){
    if(!inputCheck(BY_ID[state.session.current]))return;
    if(submitActive(state,state.session,input)){save();render();document.querySelector('[data-action="next"]')?.focus();}
  }
  else if(name==='next'&&view==='training'&&state.session.feedback)advance();
  else if(name==='summary-continue'){
    const stage=summary.stage,mode=summary.mode;
    if(mode==='flash')start('active',stage);else action('continue');
  }
  else if(name==='exam'){
    if(!state.exam&&!testReady(state))return;
    suspendSession(state);
    if(!state.exam)state.exam={order:shuffled(SKILLS.map(s=>s.id)),answers:Array(48).fill(''),index:0};
    view='exam';input=state.exam.answers[state.exam.index];validation='';save();render();focusScreen();
  }
  else if(name==='exam-back'&&view==='exam'&&state.exam.index>0)changeExam(-1);
  else if(name==='exam-next'&&view==='exam'&&state.exam.index<47)changeExam(1);
  else if(name==='finish-exam'&&view==='exam'){
    if(!inputCheck(BY_ID[state.exam.order[state.exam.index]]))return;
    state.exam.answers[state.exam.index]=input;
    const firstEmpty=state.exam.answers.findIndex(a=>!a);
    if(firstEmpty>=0){state.exam.index=firstEmpty;input='';validation='Здесь пока нет ответа.';save();render();return;}
    finishExam(state);view='results';save();render();focusScreen();
  }
  else if(name==='results'&&state.result){view='results';render();focusScreen();}
  else if(name==='practice-errors'&&state.result)start('active','mixed',state.result.mistakes.map(m=>m.id));
}
function advance(){const ses=state.session;revealed=false;validation='';input='';if(!advanceSession(state,ses)){summary={...ses};state.session=null;view='summary';}save();render();focusScreen();}
app.addEventListener('click',e=>{const key=e.target.closest('[data-key]');if(key){setInput(input+key.dataset.key);return;}const b=e.target.closest('[data-action]');if(b&&!b.disabled)action(b.dataset.action);});
app.addEventListener('input',e=>{if(e.target.id==='answer')setInput(e.target.value);});
document.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey||e.isComposing)return;
  if((e.key==='Enter'||e.code==='Space')&&e.target.closest('button'))return;
  if(view==='training'&&state.session.mode==='flash'){
    if(e.code==='Space'&&!revealed){e.preventDefault();action('reveal');}
    else if(revealed&&['1','2','3'].includes(e.key)){e.preventDefault();action(`rate-${Number(e.key)-1}`);}
  }else if(view==='training'&&state.session.feedback){if(e.key==='Enter'){e.preventDefault();action('next');}}
  else if(view==='training'||view==='exam'){
    if(e.target.id==='answer'){if(e.key==='Enter'){e.preventDefault();action(view==='exam'?(state.exam.index===47?'finish-exam':'exam-next'):'submit');}return;}
    if(/^[0-9a-f]$/i.test(e.key)){e.preventDefault();setInput(input+e.key);}
    else if(e.key==='Backspace'){e.preventDefault();setInput(input.slice(0,-1));}
    else if(e.key==='Enter'){e.preventDefault();action(view==='exam'?(state.exam.index===47?'finish-exam':'exam-next'):'submit');}
  }
});
render();
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
