const fs=require('fs'), {JSDOM}=require('jsdom');
const html=fs.readFileSync('./index.html','utf8');
let pass=0, fail=0;
const ok=(c,m)=>{ if(c){pass++} else {fail++; console.log('   ✗ '+m)} };
const wait=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
const dom=new JSDOM(html,{runScripts:'dangerously',url:'http://localhost/',pretendToBeVisual:true});
const w=dom.window, doc=w.document;
await wait(300);
const A=w.A, S=()=>w.A.state;
const q=s=>doc.querySelector(s), qa=s=>[...doc.querySelectorAll(s)];
const click=s=>{const e=q(s); if(!e) throw new Error('missing '+s); e.click()};
const T=()=>new Date().toISOString().slice(0,10);
const plus=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)};
const fire=(el,t)=>el.dispatchEvent(new w.Event(t,{bubbles:true}));
const select=async id=>{ // make sure this card is the open one
  if(!q('.task.sel [data-action="sel"][data-id="'+id+'"]')){
    if(q('.task.sel')) { w.A.state && (0); }
    const e=q('[data-action="sel"][data-id="'+id+'"]'); e.click(); await wait(25);
    if(!q('.task.sel [data-action="sel"][data-id="'+id+'"]')){ q('[data-action="sel"][data-id="'+id+'"]').click(); await wait(25) }
  }
};

console.log('— boot —');
ok(!!A,'app object exposed');
ok(!!q('#rail'),'left rail renders');
ok(qa('#rail .navbtn').length===3,'three nav buttons');
ok(qa('header').length===0,'no top header bar');
ok(S().floats.length===2,'two seed float tabs');
ok(qa('#metrics .kard').length===4,'four metric cards');
ok(qa('.ring .rp').length===1,'progress ring drawn');
ok(qa('.mtabs button').length===3,'Day / Week / Month tabs');
ok(/Month goal/.test(q('#metrics').textContent),'month goal bar present');
ok(!!q('#fpanel'),'focus panel lives in the rail');

console.log('— quick add + multi-line paste —');
q('#qd').value='day:'+T()+':must';
q('#qi').value='first must';
click('#qb'); await wait(30);
ok(S().days[T()].must.length===1,'single task added to Today Must');
q('#qd').value='day:'+T()+':must';
q('#qi').value='alpha\nbeta\ngamma';
click('#qb'); await wait(30);
ok(S().days[T()].must.length===4,'pasted list became three separate tasks');
ok(q('#qi').value==='','input cleared after add');

console.log('— zones: Extra locks until Musts are done —');
let col=q('.col[data-day="'+T()+'"]');
ok(!!col,'today column renders');
ok(col.classList.contains('today'),'today column is marked');
ok(qa('.col[data-day="'+T()+'"] .zone').length===3,'three zones on a day');
let extra=q('.zone[data-day="'+T()+'"][data-zone="extra"]');
ok(extra.classList.contains('locked'),'Extra starts locked');
ok(/Opens when every Prio 0 is ticked/.test(extra.textContent),'lock message explains why');
S().days[T()].must.forEach(t=>t.done=true); A.render(); await wait(20);
extra=q('.zone[data-day="'+T()+'"][data-zone="extra"]');
ok(!extra.classList.contains('locked'),'Extra unlocks when all Musts are ticked');
ok(/free time/.test(extra.textContent),'free-time flag shows');
S().days[T()].must[0].done=false; A.render(); await wait(20);
ok(q('.zone[data-day="'+T()+'"][data-zone="extra"]').classList.contains('locked'),'and re-locks on untick');

console.log('— capacity warning —');
S().days[T()].must=[];
for(let i=0;i<6;i++) S().days[T()].must.push({id:'x'+i,title:'m'+i,done:false,subtasks:[]});
A.render(); await wait(20);
ok(/Heavier than a day can hold/.test(q('.col[data-day="'+T()+'"]').textContent),'over 5 Musts triggers the warning');
S().days[T()].must=S().days[T()].must.slice(0,3); A.render(); await wait(20);
ok(!/Heavier than a day/.test(q('.col[data-day="'+T()+'"]').textContent),'warning clears under the limit');

console.log('— tick / select / action bar —');
const tid=S().days[T()].must[0].id;
click('[data-action="tick"][data-id="'+tid+'"]'); await wait(20);
ok(A.findTask(tid).task.done===true,'task ticks');
click('[data-action="tick"][data-id="'+tid+'"]'); await wait(20);
ok(A.findTask(tid).task.done===false,'and unticks');
await select(tid);
ok(!!q('.task.sel'),'selecting opens the action bar');
ok(qa('.task.sel .acts .abtn').length>=6,'action bar has its controls');

console.log('— reprioritise, bump, reorder —');
click('[data-action="zone"][data-id="'+tid+'"][data-zone="should"]'); await wait(25);
ok(S().days[T()].should.some(t=>t.id===tid),'S moves it to Should');
ok(!S().days[T()].must.some(t=>t.id===tid),'and out of Must');
await select(tid);
click('[data-action="bump"][data-id="'+tid+'"][data-d="1"]'); await wait(25);
ok(S().days[plus(1)].should.some(t=>t.id===tid),'→ Tmrw bumps a day forward');
await select(tid);
click('[data-action="bump"][data-id="'+tid+'"][data-d="-1"]'); await wait(25);
ok(S().days[T()].should.some(t=>t.id===tid),'← Ystdy moves it back a day');
ok(!S().days[plus(1)].should.some(t=>t.id===tid),'and off the day it came from');
{
  await select(tid);
  const pair=qa('.task.sel .acts [data-action="bump"]');
  ok(pair.length===2,'a day card offers both directions');
  ok(pair.map(b=>b.textContent.trim()).join()==='← Ystdy,→ Tmrw',
    'back sits before forward, so the pair reads naturally');
  ok(pair.every(b=>b.className==='abtn'),'both use the same action button styling');
  /* one more step back reaches yesterday, which sits outside the board window */
  click('[data-action="bump"][data-id="'+tid+'"][data-d="-1"]'); await wait(25);
  ok(S().days[plus(-1)].should.some(t=>t.id===tid),'stepping back again reaches yesterday');
  ok(!S().days[plus(-1)].must.some(t=>t.id===tid),'and it stays in the zone it was in');
  A.move(tid,{kind:'day',date:T(),zone:'should'}); A.save(); A.render(); await wait(25);
}
const mustIds=S().days[T()].must.map(t=>t.id);
await select(mustIds[1]);
click('[data-action="reorder"][data-id="'+mustIds[1]+'"][data-d="-1"]'); await wait(20);
ok(S().days[T()].must[0].id===mustIds[1],'↑ reorders within a zone');

console.log('— subtasks —');
const st=S().days[T()].must[0].id;
await select(st);
const si=q('#sadd-'+st); si.value='step one'; click('[data-action="sadd"][data-id="'+st+'"]'); await wait(20);
ok(A.findTask(st).task.subtasks.length===1,'subtask added');
const sid=A.findTask(st).task.subtasks[0].id;
click('[data-action="stick"][data-id="'+st+'"][data-sid="'+sid+'"]'); await wait(20);
ok(A.findTask(st).task.subtasks[0].done===true,'subtask ticks');
ok(/1\/1/.test(q('.task.sel').textContent),'card shows the subtask count');
click('[data-action="spop"][data-id="'+st+'"][data-sid="'+sid+'"]'); await wait(20);
ok(A.findTask(st).task.subtasks.length===0,'⤴ removes it from the parent');
ok(S().days[T()].must.some(t=>t.title==='step one'),'and it becomes its own task');

console.log('— Free Floating tabs —');
click('[data-action="floattoggle"]'); await wait(30);
ok(S().settings.floatMode===true,'float mode on');
ok(qa('.col.backlog').length===2,'each tab is its own column');
ok(/Back to dates/.test(q('#boardnav').textContent),'the way out is labelled');
click('[data-action="float-new"]'); await wait(40);
ok(S().floats.length===3,'+ Tab adds a tab');
const fid=S().floats[2].id;
S().floats[2].tasks.push({id:'ft1',title:'floaty',done:false,subtasks:[]});
A.render(); await wait(20);
click('[data-action="float-del"][data-fid="'+fid+'"]'); await wait(30);
ok(!!q('.mback'),'deleting a non-empty tab asks first');
click('[data-action="float-del-move"][data-fid="'+fid+'"]'); await wait(30);
ok(S().floats.length===2,'tab deleted');
ok(S().floats.some(f=>f.tasks.some(t=>t.id==='ft1')),'its tasks were moved, not lost');
click('[data-action="undo"]'); await wait(30);
ok(S().floats.length===3,'undo restores the tab');
ok(S().floats.some(f=>f.id===fid&&f.tasks.some(t=>t.id==='ft1')),'with its tasks back inside it');
ok(S().floats.filter(f=>f.tasks.some(t=>t.id==='ft1')).length===1,'and not left duplicated in the other tab');
S().floats.pop(); A.render(); await wait(20);
ok(qa('.col.backlog [data-action="float-del"]').length===2,'last-tab guard: delete only when more than one');

/* the delete control has to be on screen, not merely present in the markup */
{
  const heads=qa('.col.backlog .colhead .d1');
  ok(heads.length===2,'both tabs render a header');
  const dels=heads.map(h=>h.querySelector('[data-action="float-del"]'));
  ok(dels.every(Boolean),'every tab header carries a delete control');
  ok(dels.every(b=>b.textContent.trim().length>0),'and each one has a visible label, not an empty button');
  const ren=heads[0].querySelector('[data-action="float-rename"]');
  ok(ren.className===dels[0].className,'delete is styled to match the rename beside it');
  ok(!!dels[0].title&&!!dels[0].getAttribute('aria-label'),'and it says what it does');
}

/* an empty tab goes straight away, with Undo */
{
  click('[data-action="float-new"]'); await wait(40);
  if(doc.activeElement&&doc.activeElement.blur) doc.activeElement.blur();
  await wait(30);
  const n=S().floats.length, empty=S().floats[n-1];
  ok(empty.tasks.length===0,'the new tab starts empty');
  click('[data-action="float-del"][data-fid="'+empty.id+'"]'); await wait(30);
  ok(!q('.mback'),'an empty tab is not worth a confirmation');
  ok(S().floats.length===n-1,'it goes immediately');
  ok(/Tab deleted/.test(q('#toast').textContent),'the toast says what happened');
  ok(!!q('[data-action="undo"]'),'and offers Undo');
  click('[data-action="undo"]'); await wait(30);
  ok(S().floats.length===n,'undo brings the tab back');
  ok(S().floats.some(f=>f.id===empty.id),'the same tab, not a fresh one');
  S().floats=S().floats.filter(f=>f.id!==empty.id);
  S().settings.activeFloat=S().floats[0].id; A.save(); A.render(); await wait(25);
}

/* the last tab can never be deleted, so there is always somewhere to put things */
{
  const keep=S().floats.slice();
  S().floats=[keep[0]]; S().settings.activeFloat=keep[0].id; A.render(); await wait(25);
  ok(qa('.col.backlog').length===1,'down to one tab');
  ok(qa('.col.backlog [data-action="float-del"]').length===0,'the last tab shows no delete control at all');
  ok(qa('.col.backlog [data-action="float-rename"]').length===1,'it can still be renamed');
  S().floats=keep; S().settings.activeFloat=keep[0].id; A.save(); A.render(); await wait(25);
  ok(qa('.col.backlog [data-action="float-del"]').length===2,'the control returns once a second tab exists');
}

/* a tab deleted here must not come back from a device that still holds it */
{
  click('[data-action="float-new"]'); await wait(40);
  if(doc.activeElement&&doc.activeElement.blur) doc.activeElement.blur();
  await wait(30);
  const gone=S().floats[S().floats.length-1];
  gone.tasks.push({id:'tabsync1',title:'inside the doomed tab',done:false,subtasks:[]});
  A.save(); await wait(30);
  const otherDevice=JSON.parse(JSON.stringify(w.A.state));   /* still has the tab and its task */
  click('[data-action="float-del"][data-fid="'+gone.id+'"]'); await wait(30);
  click('[data-action="float-del-move"][data-fid="'+gone.id+'"]'); await wait(30);
  A.save(); await wait(30);
  ok(!S().floats.some(f=>f.id===gone.id),'the tab is gone on this device');
  ok(!!S().tomb[gone.id],'the deletion is recorded so other devices learn of it');
  const merged=A.mergeStates(w.A.state,otherDevice);
  ok(!merged.floats.some(f=>f.id===gone.id),'and it does not reappear when the other device syncs');
  ok(merged.floats.length===S().floats.length,'no stray tab comes back from the merge');
  ok(A.stateSig(merged)===A.stateSig(A.mergeStates(otherDevice,w.A.state)),'both devices agree it is gone');
  ok(Object.keys(A.flatten(merged).task).some(id=>id==='tabsync1'),'the task it held is kept, not deleted with it');
  q('#toast').innerHTML='';
}

/* deleting a task inside a tab, the same way a day task is deleted */
{
  const tabId=S().floats[0].id;
  S().floats[0].tasks.push({id:'fdel1',title:'inbox task to remove',done:false,subtasks:[]},
                           {id:'fdel2',title:'inbox task that stays',done:false,subtasks:[]});
  A.render(); await wait(25);
  await select('fdel1');
  const bar=qa('.task.sel .acts [data-action]').map(n=>n.dataset.action);
  ok(bar.indexOf('del')>-1,'a card in a tab offers the same delete button a day card has');
  ok(!!q('.task.sel [data-action="del"]').title,'the delete button says what it does');
  ok(q('.task.sel [data-action="del"]').className==='abtn del','it carries the destructive styling');
  ok(!qa('.task.sel .acts [data-action="bump"]').length,'an undated card gets no day move buttons');

  click('[data-action="del"][data-id="fdel1"]'); await wait(30);
  ok(!S().floats[0].tasks.some(t=>t.id==='fdel1'),'the task is removed from the tab');
  ok(S().floats[0].tasks.some(t=>t.id==='fdel2'),'the other task in the tab is untouched');
  ok(!q('.mback'),'no confirmation modal, the same as deleting a day task');
  ok(/Deleted/.test(q('#toast').textContent),'the toast names what went');
  ok(!!q('[data-action="undo"]'),'and offers Undo');
  click('[data-action="undo"]'); await wait(30);
  ok(S().floats[0].tasks.some(t=>t.id==='fdel1'),'undo puts it back in the tab');
  ok(S().floats[0].id===tabId&&S().floats.length===2,'undoing a task delete leaves the tabs alone');
  ok(S().floats[0].tasks.map(t=>t.id).join().indexOf('fdel1')>-1,'and it is back among its neighbours');
  /* tidy up so later tests see the tab as they expect */
  S().floats[0].tasks=S().floats[0].tasks.filter(t=>t.id!=='fdel1'&&t.id!=='fdel2');
  A.save(); A.render(); await wait(20);
}
click('[data-action="floattoggle"]'); await wait(30);
ok(S().settings.floatMode===false,'float mode off');

console.log('— board navigation —');
ok(S().settings.boardOffset===0,'starts at today');
click('[data-action="nav"][data-d="7"]'); await wait(20);
ok(S().settings.boardOffset===7,'Next moves a week');
click('[data-action="nav"][data-d="-7"]'); click('[data-action="nav"][data-d="-7"]'); await wait(20);
ok(S().settings.boardOffset===-7,'Prev goes into the past');
click('[data-action="nav-today"]'); await wait(20);
ok(S().settings.boardOffset===0,'Today resets the window');
const jd=q('#jumpDate'); jd.value=plus(80); fire(jd,'change'); await wait(30);
ok(S().settings.boardOffset===80,'Jump to reaches a far date without scrolling');
click('[data-action="nav-today"]'); await wait(20);

console.log('— off-board column —');
const far=plus(80);
S().days[far]={must:[{id:'farA',title:'far task',done:false,subtasks:[]}],should:[],extra:[]};
A.render(); await wait(20);
ok(/Off-board/.test(q('#board').textContent),'Off-board column appears');
ok(/off-board/.test(q('#boardnav').textContent),'nav shows the off-board count');
click('[data-action="goto-day"][data-day="'+far+'"]'); await wait(30);
ok(S().settings.boardOffset===80,'"go →" jumps the board there');
click('[data-action="nav-today"]'); await wait(20);

console.log('— carry-over —');
const yd=plus(-1);
S().days[yd]={must:[{id:'oldx',title:'yesterday leftover',done:false,subtasks:[]},
                    {id:'oldy',title:'yesterday finished',done:true,subtasks:[]}],should:[],extra:[]};
S().settings.lastRoll=null;
A.rollover(); A.render(); await wait(30);
ok(S().carry.some(t=>t.id==='oldx'),'unfinished task rolled into the tray');
ok(!S().carry.some(t=>t.id==='oldy'),'finished task stayed on its day as history');
ok(S().days[yd].must.some(t=>t.id==='oldy'),'…and is still there');
ok(/Carry-over/.test(q('#tray').textContent),'carry tray renders');
click('[data-action="carry-all"][data-to="today"]'); await wait(30);
ok(S().carry.length===0,'All → Today empties the tray');
ok(S().days[T()].must.some(t=>t.id==='oldx'),'and they land on Today · Must');
click('[data-action="undo"]'); await wait(30);
ok(S().carry.length===1,'undo puts them back in the tray');
click('[data-action="carry-all"][data-to="float"]'); await wait(30);
ok(S().floats.some(f=>f.tasks.some(t=>t.id==='oldx')),'All → Free Floating works too');

console.log('— focus panel —');
q('#fi').value='ship the report without rushing';
click('[data-action="focus-add"]'); await wait(20);
ok(S().focus.length===1,'focus item added');
const foid=S().focus[0].id;
click('[data-action="focus-tick"][data-id="'+foid+'"]'); await wait(20);
ok(S().focus[0].done===true,'focus ticks');
ok(S().focus[0].doneAt===T(),'and records the date it landed');
ok(/Completed \(1\)/.test(q('#fpanel').textContent),'it drops into Completed');
click('[data-action="focus-toggle-done"]'); await wait(20);
ok(S().settings.showDone===true,'Completed expands');
click('[data-action="focus-del"][data-id="'+foid+'"]'); await wait(20);
ok(S().focus.length===0,'focus removed');
click('[data-action="undo"]'); await wait(30);
ok(S().focus.length===1,'undo restores it');

console.log('— calendar —');
click('[data-action="view"][data-v="calendar"]'); await wait(40);
ok(S().settings.view==='calendar','switched to calendar');
ok(!!q('.calgrid'),'month grid renders');
ok(qa('.caldow div').length===7,'weekday header row');
ok(qa('.cell:not(.blank)').length>=28,'a full month of cells');
ok(!!q('.cell.today'),'today is marked');
ok(!!q('.cell .dots'),'dots show on days that have open tasks');
click('[data-action="cal-day"][data-day="'+T()+'"]'); await wait(30);
ok(S().settings.calSel===T(),'day selected');
ok(!!q('.cell.sel'),'selected day is ringed');
ok(/Tasks on/.test(q('.dphead').textContent),'task panel for that day');
ok(/Showing/.test(q('.chip').textContent),'the showing chip appears');
const ca=q('#calAdd'); ca.value='added from the calendar';
q('#calZone').value='should';
click('[data-action="cal-add"][data-day="'+T()+'"]'); await wait(30);
ok(S().days[T()].should.some(t=>t.title==='added from the calendar'),'add-to-this-day with a zone picker works');
click('[data-action="cal-nav"][data-d="1"]'); await wait(20);
ok(S().settings.calOffset===1,'calendar navigates months');
click('[data-action="cal-nav"][data-d="0"]'); await wait(20);
ok(S().settings.calOffset===0,'"This month" resets it');
click('[data-action="cal-clear"]'); await wait(20);
ok(S().settings.calSel===null,'chip ✕ clears the selection');
click('[data-action="view"][data-v="board"]'); await wait(30);

console.log('— delete with undo, no modal —');
const dtid=S().days[T()].must[0].id, dTitle=S().days[T()].must[0].title;
await select(dtid);
click('[data-action="del"][data-id="'+dtid+'"]'); await wait(20);
ok(!A.findTask(dtid),'task deleted');
ok(!q('.mback'),'no confirm modal');
ok(/Undo/.test(q('#toast').textContent),'undo offered in the toast');
click('[data-action="undo"]'); await wait(30);
ok(!!A.findTask(dtid)&&A.findTask(dtid).task.title===dTitle,'undo restores it exactly');

console.log('— metrics maths on a seeded history —');
S().days={}; S().carry=[];
for(let i=0;i<20;i++){
  const d=plus(-i);
  S().days[d]={must:[{id:'a'+i,title:'a',done:true,subtasks:[]},
                     {id:'b'+i,title:'b',done:i%2===0,subtasks:[]}],should:[],extra:[]};
}
A.render(); await wait(30);
const dayT=A.tally([T()]);
ok(dayT.total===2&&dayT.done===2,'today counted correctly');
let wk=0; for(let i=0;i<7;i++) wk+=2;
ok(A.tally([0,1,2,3,4,5,6].map(i=>plus(-i))).total===wk,'week total matches an independent count');
const d1=A.tally([T()]), w1=A.tally([0,1,2,3,4,5,6].map(i=>plus(-i)));
const m1=A.tally(Array.from({length:30},(_,i)=>plus(-i)));
ok(d1.total<=w1.total&&w1.total<=m1.total,'ranges nest: day ⊆ week ⊆ month');
ok(A.streak()===1,'streak counts only fully-clean days');
click('[data-action="mrange"][data-r="week"]'); await wait(30);
ok(qa('.bars .bar').length===7,'week view shows seven daily bars');
ok(!!q('.bar.now'),'today is ringed in the week view');
click('[data-action="mrange"][data-r="month"]'); await wait(30);
ok(qa('.bars .bar').length===5,'month view shows five weekly bars');
click('[data-action="mrange"][data-r="day"]'); await wait(30);
ok(qa('.bars .bar').length===3,'day view shows three zone bars');
ok(/Month goal/.test(q('#metrics').textContent),'month goal bar visible in every range');

console.log('— empty history does not crash —');
S().days={}; S().carry=[]; S().focus=[]; A.render(); await wait(30);
ok(/0%/.test(q('.ring .rlab').textContent),'empty history yields 0%, not NaN');
ok(A.streak()===0,'streak is 0 on an empty history');

console.log('— saving —');
S().days[T()]={must:[{id:'persist',title:'survives reload',done:false,subtasks:[{id:'s1',title:'step',done:false}]}],should:[],extra:[]};
A.save(); await wait(60);
const raw=w.localStorage.getItem('agora_dayplanner_v1');
ok(!!raw,'state written to storage');
const parsed=JSON.parse(raw);
ok(parsed.days[T()].must[0].id==='persist','tasks persist');
ok(parsed.days[T()].must[0].subtasks.length===1,'subtasks persist');
ok(!!parsed.settings&&!!parsed.floats,'settings and float tabs persist');

console.log('— help modal —');
click('[data-action="help"]'); await wait(20);
ok(!!q('.mback'),'help opens');
ok(/Days, not hours/.test(q('.modal').textContent),'help explains the model');
click('[data-action="mclose"][data-close="1"]'); await wait(20);
ok(!q('.mback'),'help closes');

console.log('— inline add field, touch behaviour —');
S().settings.view='board'; S().settings.floatMode=false; S().days={}; A.render(); await wait(30);
const zk='day:'+T()+':must';
const type=(el,v)=>{el.value=v; el.dispatchEvent(new w.Event('input',{bubbles:true}))};
const kbd=()=>w.dispatchEvent(new w.Event('resize'));   // keyboard open/close: height only
const mustNow=()=>(S().days[T()]||{must:[]}).must.map(t=>t.title);
click('.zadd[data-k="'+zk+'"]'); await wait(30);
ok(!!q('.addin[data-k="'+zk+'"]'),'"+ add" opens an input');
ok(doc.activeElement===q('.addin[data-k="'+zk+'"]'),'the input takes focus');
ok(!!q('.zaddrow [data-action="add-cancel"]'),'the open row shows a cancel control');
{
  const before=q('.addin[data-k="'+zk+'"]');
  type(before,'buy milk'); kbd(); await wait(220);
  const after=q('.addin[data-k="'+zk+'"]');
  ok(before===after,'the on-screen keyboard resize does not tear out the input');
  ok(after&&after.value==='buy milk','half typed text survives a keyboard resize');
  after.blur(); kbd(); await wait(220);
  ok(doc.activeElement!==q('.addin[data-k="'+zk+'"]'),'focus is not stolen back after the keyboard is hidden');
}
q('#main').click(); await wait(40);
ok(!q('.addin'),'tapping outside closes the field');
ok(mustNow().join()==='buy milk','text typed before tapping outside is kept, not lost');

click('.zadd[data-k="'+zk+'"]'); await wait(30);
type(q('.addin'),'call the bank');
q('.addin').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true})); await wait(40);
ok(!q('.addin'),'Enter closes the field');
ok(mustNow().join()==='buy milk,call the bank','Enter commits the task');

click('.zadd[data-k="'+zk+'"]'); await wait(30);
type(q('.addin'),'scratch that');
click('[data-action="add-cancel"]'); await wait(40);
ok(!q('.addin'),'the cancel control closes the field');
ok(mustNow().length===2,'cancel discards without adding');

click('.zadd[data-k="'+zk+'"]'); await wait(30);
q('.addin').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true})); await wait(40);
ok(!q('.addin'),'Escape still closes the field');

console.log('— menu reach on phones —');
{
  const foot=q('.railfoot'), labels=[...foot.children].map(b=>b.textContent);
  ok(labels.map(t=>t.replace(/ · \d+$/,'')).join(',')==='Help,Sync,Export,Import,Bin',
    'Help, Sync, Export, Import and Bin all live in the rail foot');
  ok(foot.parentElement.classList.contains('railhide'),'they sit inside the collapsible menu');
  const css=q('style').textContent;
  ok(/@media \(max-width:900px\)[\s\S]*#rail \.railfoot\{order:-1/.test(css),
    'phones lift the rail foot to the top of the opened menu');
  ok(!/#rail \.railfoot\{[^}]*order:-1[^}]*\}/.test(css.split('@media (max-width:900px)')[0]),
    'desktop keeps them at the foot');
}

console.log('— board nav on a phone viewport —');
{
  /* a phone shows one day column driven by stripDay, so a control that moves only
     boardOffset changes nothing on screen. Prev and Next used to do exactly that. */
  const phone=new JSDOM(html,{runScripts:'dangerously',url:'http://localhost/',pretendToBeVisual:true,
    beforeParse(win){
      Object.defineProperty(win,'innerWidth',{value:390,writable:true,configurable:true});
      Object.defineProperty(win,'innerHeight',{value:844,writable:true,configurable:true});
    }});
  const pw=phone.window, pd=pw.document;
  await wait(300);
  const pq=s=>pd.querySelector(s);
  const col=()=>{ const c=pq('#board .col'); return c?c.dataset.day:null };
  const tap=s=>{ const e=pq(s); if(!e) throw new Error('missing '+s); e.click() };

  ok(pd.querySelectorAll('#board .col').length===1,'a phone shows a single day column');
  ok(!!pq('[data-action="nav"][data-d="7"]'),'Prev and Next are on screen at phone width');
  ok(col()===T(),'it starts on today');

  tap('[data-action="nav"][data-d="7"]'); await wait(40);
  ok(col()===plus(7),'Next moves the visible day a week on, not just the hidden offset');
  ok(pw.A.state.settings.boardOffset===7,'and the wide screen offset moves with it');
  ok(pw.A.state.settings.stripDay===plus(7),'the two halves of the board window stay in step');

  tap('[data-action="nav"][data-d="-7"]'); tap('[data-action="nav"][data-d="-7"]'); await wait(40);
  ok(col()===plus(-7),'Prev goes back through today into last week');
  ok(pw.A.state.settings.boardOffset===-7,'the offset tracks it backwards too');

  tap('[data-action="nav-today"]'); await wait(40);
  ok(col()===T()&&pw.A.state.settings.boardOffset===0,'Today still returns to today');
  tap('[data-action="strip"][data-day="'+plus(2)+'"]'); await wait(40);
  ok(col()===plus(2)&&pw.A.state.settings.boardOffset===2,'a strip day sets both halves as well');
  const j=pq('#jumpDate'); j.value=plus(30);
  j.dispatchEvent(new pw.Event('change',{bubbles:true})); await wait(40);
  ok(col()===plus(30),'Jump to reaches a far date on a phone');
  ok(pw.A.state.settings.boardOffset===30,'and leaves the wide screen offset pointing at the same day');

  /* the nav must survive the trip through Free Floating and the calendar */
  tap('[data-action="nav-today"]'); await wait(20);
  tap('[data-action="floattoggle"]'); await wait(20);
  tap('[data-action="floattoggle"]'); await wait(20);
  tap('[data-action="nav"][data-d="7"]'); await wait(40);
  ok(col()===plus(7),'Next still works after a detour through Free Floating');
  pw.close();
}

console.log('— export and import still round-trip —');
{
  S().days={}; S().carry=[]; S().focus=[];
  S().days[T()]={must:[{id:'ex1',title:'exported task',done:true,
    subtasks:[{id:'exs',title:'a step',done:false}]}],should:[],extra:[]};
  A.save(); await wait(30);
  const dump=JSON.stringify(w.A.state);        // what the Export button writes to the file
  ok(/exported task/.test(dump),'the export carries the tasks');
  ok(JSON.parse(dump).days[T()].must[0].done===true,'it carries their ticked state');

  S().days[T()].must[0].title='changed since the export';
  S().days[T()].must.push({id:'ex2',title:'added since the export',done:false,subtasks:[]});
  A.save(); await wait(30);

  const file=new w.File([dump],'headspace.json',{type:'application/json'});
  Object.defineProperty(q('#fileIn'),'files',{value:[file],configurable:true});
  fire(q('#fileIn'),'change'); await wait(160);
  const back=(w.A.state.days[T()]||{must:[]}).must;
  ok(back.length===1&&back[0].title==='exported task','importing puts the exported planner back');
  ok(back[0].done===true,'imported tasks keep their ticked state');
  ok(back[0].subtasks.length===1,'imported subtasks come back too');
  ok(!!w.A.state.tomb.ex2,'what the import dropped is recorded, so it does not return from another device');
}

console.log('— sync merge: two devices, item by item —');
/* a bare planner as another device would hold it */
const dev=()=>({ver:2,days:{},carry:[],focus:[],tomb:{},
  floats:[{id:'f1',name:'Inbox',tasks:[],up:100}],
  settings:{view:'board',boardOffset:0,floatMode:false,activeFloat:'f1',calSel:null,
    calOffset:0,mRange:'day',stripDay:null,lastRoll:null,showDone:false}});
const D='2026-08-08';
const tk=(id,title,up,x)=>Object.assign({id,title,done:false,subtasks:[],up},x||{});
const put=(s,t,zone)=>{ const z=zone||'must';
  (s.days[D]=s.days[D]||{must:[],should:[],extra:[]})[z].push(t); return s };
const clone=s=>JSON.parse(JSON.stringify(s));
const names=s=>Object.keys(A.flatten(s).task).map(id=>A.flatten(s).task[id].title).sort();
const byId=(s,id)=>A.flatten(s).task[id];
const subNames=(s,pid)=>{ const g=A.flatten(s).sub;
  return Object.keys(g).filter(k=>g[k].pid===pid).map(k=>g[k].title).sort() };

{ /* 1. a task added on each side: both must survive, whichever way round they merge */
  const a=put(dev(),tk('t1','from the PC',200));
  const b=put(dev(),tk('t2','from the tablet',210));
  const ab=A.mergeStates(a,b), ba=A.mergeStates(b,a);
  ok(names(ab).join()==='from the PC,from the tablet','a task added on each device: both survive');
  ok(A.stateSig(ab)===A.stateSig(ba),'the merge lands on the same answer whichever device runs it');
  ok(Object.keys(A.flatten(ab).task).length===2,'no duplicates from a two sided add');
}
{ /* 2. the same task edited on both sides: later edit wins, and it wins consistently */
  const a=put(dev(),tk('t1','renamed on the PC',200));
  const b=put(dev(),tk('t1','renamed on the tablet',300));
  const m=A.mergeStates(a,b);
  ok(names(m).join()==='renamed on the tablet','same task edited twice: the later edit stays');
  ok(Object.keys(A.flatten(m).task).length===1,'the losing edit does not leave a second copy');
  ok(A.stateSig(m)===A.stateSig(A.mergeStates(b,a)),'both devices agree on which edit won');
}
{ /* 3. ticking is an edit like any other and must come through a merge */
  const a=put(dev(),tk('t1','walk the dog',300,{done:true}));
  const b=put(dev(),tk('t1','walk the dog',100));
  ok(byId(A.mergeStates(a,b),'t1').done===true,'a tick made on one device survives the merge');
  ok(byId(A.mergeStates(b,a),'t1').done===true,'and survives it from the other direction too');
  const c=put(dev(),tk('t1','walk the dog',400));      /* unticked later on the other device */
  ok(byId(A.mergeStates(a,c),'t1').done===false,'un-ticking later wins over an older tick');
}
{ /* 4. deleted on one side: it stays deleted, and takes nothing else with it */
  const a=dev(); a.tomb={t1:300};
  put(a,tk('t2','still here',250));
  const b=put(put(dev(),tk('t1','deleted on the PC',100)),tk('t3','added on the tablet',260));
  const m=A.mergeStates(a,b);
  ok(!byId(m,'t1'),'a task deleted on one device does not come back from the other');
  ok(names(m).join()==='added on the tablet,still here','the deletion leaves unrelated tasks alone');
  ok(m.tomb.t1===300,'the deletion is remembered so it can reach a third device');
}
{ /* an edit made after the delete is the one case where the task returns, by design */
  const a=dev(); a.tomb={t1:300};
  const b=put(dev(),tk('t1','edited after the delete',400));
  ok(byId(A.mergeStates(a,b),'t1'),'an edit later than the delete brings the task back');
  const c=put(dev(),tk('t1','edited before the delete',200));
  ok(!byId(A.mergeStates(a,c),'t1'),'an edit older than the delete stays deleted');
}
{ /* 5. a subtask deleted on one side, another added on the other */
  const a=put(dev(),tk('t1','shop',300,{subtasks:[{id:'s2',title:'bread',done:false,up:300}]}));
  a.tomb={s1:290};
  const b=put(dev(),tk('t1','shop',200,{subtasks:[
    {id:'s1',title:'milk',done:false,up:100},{id:'s3',title:'eggs',done:true,up:280}]}));
  const m=A.mergeStates(a,b);
  ok(subNames(m,'t1').join()==='bread,eggs','steps added on either side both survive');
  ok(subNames(m,'t1').indexOf('milk')===-1,'a step deleted on one device stays deleted');
  ok(A.flatten(m).sub.s3.done===true,'a ticked step keeps its tick through a merge');
}
{ /* 6. float tabs and focus items merge the same way */
  const a=dev(); a.floats=[{id:'f1',name:'Renamed on the PC',tasks:[],up:300}];
  a.focus=[{id:'x1',title:'ship it',done:true,doneAt:'2026-08-08',up:300}];
  const b=dev(); b.floats=[{id:'f1',name:'Inbox',tasks:[],up:100},{id:'f2',name:'Ideas',tasks:[],up:250}];
  b.focus=[{id:'x1',title:'ship it',done:false,doneAt:null,up:100},
           {id:'x2',title:'rest properly',done:false,doneAt:null,up:260}];
  const m=A.mergeStates(a,b);
  ok(m.floats.map(f=>f.name).sort().join()==='Ideas,Renamed on the PC','tab rename and a new tab both land');
  ok(m.focus.length===2,'focus items from both devices survive');
  ok(m.focus.filter(f=>f.id==='x1')[0].done===true,'a ticked focus item keeps its tick');
}
{ /* a tab deleted on one device must not take the other device's tasks with it */
  const a=dev(); a.tomb={f2:300}; a.floats=[{id:'f1',name:'Inbox',tasks:[],up:100}];
  const b=dev(); b.floats=[{id:'f1',name:'Inbox',tasks:[],up:100},
    {id:'f2',name:'Ideas',tasks:[tk('t9','idea worth keeping',280)],up:100}];
  const m=A.mergeStates(a,b);
  ok(m.floats.length===1,'the deleted tab stays deleted');
  ok(names(m).join()==='idea worth keeping','its tasks move to a surviving tab instead of vanishing');
}
{ /* 7. offline edits, then reconnect */
  const base=put(put(dev(),tk('t1','old one',100)),tk('t2','other old one',100));
  const offline=clone(base);                       /* tablet, no connection */
  offline.days[D].must[0].title='edited while offline'; offline.days[D].must[0].up=500;
  offline.days[D].must.splice(1,1); offline.tomb={t2:510};
  put(offline,tk('t3','added while offline',520));
  const online=clone(base);                        /* PC, kept syncing */
  put(online,tk('t4','added on the PC',400));
  const m=A.mergeStates(online,offline);
  ok(names(m).join()==='added on the PC,added while offline,edited while offline',
    'reconnecting after offline edits keeps every side of the work');
  ok(!byId(m,'t2'),'a delete made offline is honoured on reconnect');
}
{ /* 8. three way: both devices changed things since the last shared copy */
  const base=put(put(dev(),tk('t1','tick me',100)),tk('t2','rename me',100));
  const a=clone(base);
  a.days[D].must[0].done=true; a.days[D].must[0].up=300;   /* PC ticks t1 */
  put(a,tk('t3','PC extra',310));
  const b=clone(base);
  b.days[D].must[1].title='renamed on the tablet'; b.days[D].must[1].up=320;
  put(b,tk('t4','tablet extra',330));
  const m1=A.mergeStates(a,b), m2=A.mergeStates(b,a);
  ok(names(m1).join()==='PC extra,renamed on the tablet,tablet extra,tick me',
    'two devices that both moved on keep every change');
  ok(byId(m1,'t1').done===true,'the tick from one device survives the other device changes');
  ok(A.stateSig(m1)===A.stateSig(m2),'both devices settle on the same planner');
  /* and a second round changes nothing further */
  ok(A.stateSig(A.mergeStates(m1,m2))===A.stateSig(m1),'merging again is stable, so it converges');
  ok(A.stateSig(A.mergeStates(m1,m1))===A.stateSig(m1),'merging a planner with itself is a no-op');
}
{ /* 9. data saved before this format arrived must not be lost */
  const legacy={days:{},carry:[],focus:[],
    floats:[{id:'f1',name:'Inbox',tasks:[{id:'old1',title:'saved last year',done:true,subtasks:[]}]}],
    settings:{view:'board'}};
  const read=A.readCloud(clone(legacy));
  ok(!!read,'a planner saved in the old format still reads');
  ok(read.floats[0].tasks[0].up===1,'old items get the oldest stamp, so any real edit beats them');
  ok(read.floats[0].tasks[0].done===true,'their ticked state is untouched by the migration');
  const now=put(dev(),tk('t1','made today',600));
  const m=A.mergeStates(now,read);
  ok(names(m).join()==='made today,saved last year','old cloud data merges in without loss');
}

console.log('— a new top level state key survives a merge —');
{
  /* the shape is the contract: adding a key to fresh() must be a deliberate decision */
  const canon=Object.keys(A.fresh()).sort().join(),
        declared=A.MERGED_KEYS.slice().sort().join();
  ok(canon===declared,
    'MERGED_KEYS matches fresh(): a new key in the canonical shape forces a choice in rebuild');

  /* a key nobody taught the merge about must still come through, both directions */
  const a=put(dev(),tk('u1','mine',200)); a.futureThing={hello:'world',n:1};
  const b=put(dev(),tk('u2','theirs',210));
  const ab=A.mergeStates(a,b), ba=A.mergeStates(b,a);
  ok(!!ab.futureThing&&ab.futureThing.hello==='world','an unknown top level key survives the merge');
  ok(!!ba.futureThing&&ba.futureThing.hello==='world','and survives it from the other side too');
  ok(A.stateSig(ab)===A.stateSig(ba),'both devices agree on the merged planner');
  ok(names(ab).join()==='mine,theirs','the tasks merge as usual alongside it');

  /* both sides hold it and differ: still deterministic, still never dropped */
  const c=dev(); c.futureThing={v:1};
  const d=dev(); d.futureThing={v:2};
  const cd=A.mergeStates(c,d), dc=A.mergeStates(d,c);
  ok(!!cd.futureThing&&!!dc.futureThing,'a key present on both sides is never dropped');
  ok(JSON.stringify(cd.futureThing)===JSON.stringify(dc.futureThing),
    'and both devices resolve it the same way');

  /* the unknown key must reach stateSig, or a change to it would never be pushed */
  const e=dev(), f2=dev(); e.futureThing={v:9};
  ok(A.stateSig(e)!==A.stateSig(f2),'a change to an unknown key shows up in the sync signature');
}

console.log('— reorder and content edits stop competing —');
{
  const now=Date.now();
  const zone=(s,list)=>{ s.days[D]={must:list,should:[],extra:[]}; return s };
  const byTitle=(s,z)=>((s.days[D]||{})[z||'must']||[]).map(t=>t.title);
  const one=(s,id)=>A.flatten(s).task[id];

  { /* device A reorders the zone, device B renames a task in it.
       Positions are stamped explicitly on both sides, as stampChanges and the load time
       migration always do: a rename bumps `up` and leaves `pos` where it was. */
    const a=zone(dev(),[tk('r2','second',100),tk('r1','first',100)]);   /* A swapped them */
    a.days[D].must[0].pos=now; a.days[D].must[1].pos=now;
    const b=zone(dev(),[tk('r1','first renamed on B',now+1000),tk('r2','second',100)]);
    b.days[D].must[0].pos=100; b.days[D].must[1].pos=100;               /* B moved nothing */
    const m=A.mergeStates(a,b), m2=A.mergeStates(b,a);
    ok(one(m,'r1').title==='first renamed on B','a reorder no longer discards the rename made elsewhere');
    ok(byTitle(m).join()==='second,first renamed on B','and the reorder itself survives');
    ok(A.stateSig(m)===A.stateSig(m2),'both devices reach the same order and the same text');
  }
  { /* the mirror: B renames first, A reorders after */
    const b=zone(dev(),[tk('r1','renamed early',now),tk('r2','second',100)]);
    b.days[D].must[0].pos=100; b.days[D].must[1].pos=100;
    const a=zone(dev(),[tk('r2','second',100),tk('r1','first',100)]);
    a.days[D].must[0].pos=now+1000; a.days[D].must[1].pos=now+1000;
    const m=A.mergeStates(a,b);
    ok(one(m,'r1').title==='renamed early','a later reorder still does not undo an earlier rename');
    ok(byTitle(m).join()==='second,renamed early','while the later order is the one that holds');
  }
  { /* a tick is content too, so it survives a reorder made afterwards */
    const b=zone(dev(),[tk('r1','a task',now,{done:true}),tk('r2','second',100)]);
    b.days[D].must[0].pos=100; b.days[D].must[1].pos=100;
    const a=zone(dev(),[tk('r2','second',100),tk('r1','a task',100)]);
    a.days[D].must[0].pos=now+1000; a.days[D].must[1].pos=now+1000;
    const m=A.mergeStates(a,b);
    ok(one(m,'r1').done===true,'a tick is not undone by someone else reordering the zone');
    ok(byTitle(m).join()==='second,a task','and the reorder still holds');
  }
  { /* a move between zones concurrent with an edit to the same task: both must land */
    const a=dev();
    a.days[D]={must:[],should:[tk('r1','a task',100)],extra:[]};
    a.days[D].should[0].pos=now+1000;                      /* A moved it to Prio 1 */
    const b=zone(dev(),[tk('r1','edited while it moved',now)]);   /* B renamed it in place */
    b.days[D].must[0].pos=100;
    const m=A.mergeStates(a,b), m2=A.mergeStates(b,a);
    ok(byTitle(m,'should').join()==='edited while it moved',
      'a move and a content edit both survive: the task is in the new zone with the new text');
    ok(!byTitle(m,'must').length,'and it is not left behind in the old zone');
    ok(A.stateSig(m)===A.stateSig(m2),'both devices agree');
  }
  { /* a rename on one device, a tick on the other, same task: both must survive */
    const a=zone(dev(),[tk('r1','renamed on A',now+2000)]);      /* A retitled it */
    a.days[D].must[0].dn=100; a.days[D].must[0].pos=100;
    const b=zone(dev(),[tk('r1','original',100,{done:true})]);    /* B ticked it */
    b.days[D].must[0].dn=now+1000; b.days[D].must[0].pos=100;
    const m=A.mergeStates(a,b), m2=A.mergeStates(b,a);
    ok(one(m,'r1').title==='renamed on A','the rename survives a tick made elsewhere');
    ok(one(m,'r1').done===true,'and the tick survives the rename');
    ok(A.stateSig(m)===A.stateSig(m2),'both devices land on the same task');
  }
  { /* the mirror: the tick is older than the rename, both still survive */
    const a=zone(dev(),[tk('r1','renamed later on A',now+5000)]);
    a.days[D].must[0].dn=100; a.days[D].must[0].pos=100;
    const b=zone(dev(),[tk('r1','original',100,{done:true})]);
    b.days[D].must[0].dn=now; b.days[D].must[0].pos=100;
    const m=A.mergeStates(a,b);
    ok(one(m,'r1').title==='renamed later on A'&&one(m,'r1').done===true,
      'order of the two does not matter, neither discards the other');
  }
  { /* un-ticking is on the same axis, so the later of two tick changes wins */
    const a=zone(dev(),[tk('r1','a task',100,{done:true})]); a.days[D].must[0].dn=now;
    const b=zone(dev(),[tk('r1','a task',100)]);             b.days[D].must[0].dn=now+1000;
    ok(one(A.mergeStates(a,b),'r1').done===false,'un-ticking later beats an earlier tick');
    ok(one(A.mergeStates(b,a),'r1').done===false,'from either direction');
  }
  { /* a tick, a rename and a move, three devices' worth of change on one task */
    const a=zone(dev(),[tk('r1','renamed',now+3000)]);
    a.days[D].must[0].dn=100; a.days[D].must[0].pos=100;
    const b=dev();
    b.days[D]={must:[],should:[tk('r1','original',100,{done:true})],extra:[]};
    b.days[D].should[0].dn=now+2000; b.days[D].should[0].pos=now+1000;
    const m=A.mergeStates(a,b), m2=A.mergeStates(b,a);
    const w=one(m,'r1');
    ok(w.title==='renamed','the newest title wins');
    ok(w.done===true,'the tick is kept');
    ok(w.loc.zone==='should','and the task sits where it was last moved to');
    ok(A.stateSig(m)===A.stateSig(m2),'three axes, still the same answer on both devices');
  }
  { /* a tick still counts as asserting the task exists, so it revives a deletion */
    const a=dev(); a.tomb={r1:now};
    const b=zone(dev(),[tk('r1','ticked after the delete',100,{done:true})]);
    b.days[D].must[0].dn=now+1000; b.days[D].must[0].pos=100;
    ok(one(A.mergeStates(a,b),'r1'),'ticking a task after it was deleted brings it back');
  }
  { /* a focus item: its doneAt travels with the tick, not with the title */
    const a=dev(); a.focus=[{id:'x1',title:'renamed focus',done:false,doneAt:null,
      up:now+2000,dn:100,pos:100}];
    const b=dev(); b.focus=[{id:'x1',title:'old title',done:true,doneAt:'2026-08-10',
      up:100,dn:now+1000,pos:100}];
    const m=A.mergeStates(a,b);
    ok(m.focus[0].title==='renamed focus','a focus rename survives a tick elsewhere');
    ok(m.focus[0].done===true&&m.focus[0].doneAt==='2026-08-10',
      'and the tick keeps the date it was completed on');
  }
  { /* adding a step no longer restamps the parent, so it cannot outrank a rename */
    const a=zone(dev(),[tk('r1','parent',100,{subtasks:[{id:'s9',title:'new step',done:false,up:now+2000}]})]);
    const b=zone(dev(),[tk('r1','parent renamed',now)]);
    const m=A.mergeStates(a,b);
    ok(one(m,'r1').title==='parent renamed','adding a step does not outrank a rename elsewhere');
    ok(A.flatten(m).sub.s9,'and the step still arrives');
  }
  { /* a reorder must not resurrect something deleted elsewhere */
    const a=dev(); a.tomb={r1:now};
    const b=zone(dev(),[tk('r1','moved after it was deleted',100)]);
    b.days[D].must[0].pos=now+5000;                        /* only its position changed */
    ok(!one(A.mergeStates(a,b),'r1'),'reordering a task somebody deleted does not bring it back');
  }
  { /* carry-over Exception A: rolled here, renamed on the other device after midnight */
    const midnight=new Date(T()+'T00:00:00').getTime();
    const rolled=dev();
    rolled.carry=[tk('r1','a task',midnight,{from:'Prio 0 · Sun'})];
    rolled.carry[0].pos=midnight;
    const other=dev();
    other.days[plus(-1)]={must:[tk('r1','renamed after midnight',midnight+36e5)],should:[],extra:[]};
    other.days[plus(-1)].must[0].pos=1000;
    const m=A.mergeStates(rolled,other), m2=A.mergeStates(other,rolled);
    ok(m.carry.length===1,'a task in the tray stays in the tray when the other device renames it');
    ok(m.carry[0].title==='renamed after midnight','and picks up that rename');
    ok(m.carry[0].from==='Prio 0 · Sun','keeping the label saying where it came from');
    ok(!((m.days[plus(-1)]||{}).must||[]).length,'it is not dragged back onto its old day');
    ok(A.stateSig(m)===A.stateSig(m2),'both devices agree it belongs in the tray');
  }
}

console.log('— carry-over across a new day and a sync —');
{
  const carry=(s,t)=>{ s.carry.push(t); return s };
  const inCarry=s=>Object.keys(A.flatten(s).task)
    .filter(id=>A.flatten(s).task[id].loc.kind==='carry').map(id=>A.flatten(s).task[id].title).sort();
  const onDay=s=>Object.keys(A.flatten(s).task)
    .filter(id=>A.flatten(s).task[id].loc.kind==='day').map(id=>A.flatten(s).task[id].title).sort();
  const midnight=new Date(T()+'T00:00:00').getTime();

  { /* a carried task reaches a device that has never seen it, exactly once */
    const rolled=carry(dev(),tk('c1','left over from yesterday',midnight,{from:'Prio 0 · Fri'}));
    const other=dev();
    const m=A.mergeStates(other,rolled);
    ok(inCarry(m).join()==='left over from yesterday','a carried task survives the merge');
    ok(Object.keys(A.flatten(m).task).length===1,'and arrives exactly once');
    ok(A.flatten(m).task.c1.from==='Prio 0 · Fri','it keeps the label saying where it came from');
  }
  { /* both devices rolled the same task over: still one task, still in the tray */
    const a=carry(dev(),tk('c1','left over',midnight,{from:'Prio 0 · Fri'}));
    const b=carry(dev(),tk('c1','left over',midnight,{from:'Prio 0 · Fri'}));
    const m=A.mergeStates(a,b);
    ok(Object.keys(A.flatten(m).task).length===1,'two devices rolling the same task make one, not two');
    ok(inCarry(m).length===1,'and it is in the tray once');
    ok(A.stateSig(m)===A.stateSig(A.mergeStates(b,a)),'both devices agree on the rolled result');
  }
  { /* the important one: a device opening late must not undo a triage */
    const triaged=put(dev(),tk('c1','left over',midnight+7200000));   /* moved to Today at 02:00 */
    const stale=carry(dev(),tk('c1','left over',midnight,{from:'Prio 0 · Fri'}));
    const m=A.mergeStates(triaged,stale);
    ok(inCarry(m).length===0,'a task already triaged does not reappear in the tray');
    ok(onDay(m).join()==='left over','it stays where it was triaged to');
    ok(A.stateSig(m)===A.stateSig(A.mergeStates(stale,triaged)),'both devices reach that same answer');
  }
  { /* dropped from the tray stays dropped */
    const dropped=dev(); dropped.tomb={c1:midnight+3600000};
    const stale=carry(dev(),tk('c1','left over',midnight));
    ok(Object.keys(A.flatten(A.mergeStates(dropped,stale)).task).length===0,
      'a carried task dropped on one device does not return from another');
  }
  { /* lastRoll belongs to the device, not the cloud */
    const mine=dev(); mine.settings.lastRoll=plus(-1);
    const theirs=dev(); theirs.settings.lastRoll=T();
    ok(A.mergeStates(mine,theirs).settings.lastRoll===plus(-1),
      'a merge does not tell this device it has already carried its days over');
  }
}

console.log('— the day turning while the app stays open —');
{
  /* A phone keeps this app running for days. Simulate the clock crossing midnight
     under a live window: yesterday's unfinished task, and a stale lastRoll. */
  const live=new JSDOM(html,{runScripts:'dangerously',url:'http://localhost/',pretendToBeVisual:true});
  const lw=live.window, ld=live.document||live.window.document;
  await wait(300);
  const LS=()=>lw.A.state;
  const items=()=>ld.querySelectorAll('.trayitem').length;
  LS().days={}; LS().carry=[]; LS().settings.lastRoll=T();
  lw.A.render(); await wait(20);
  ok(items()===0,'nothing in the tray while the day has not turned');

  LS().days[plus(-1)]={must:[{id:'nite1',title:'unfinished when the day turned',done:false,subtasks:[],up:1000},
    {id:'nite2',title:'finished before midnight',done:true,subtasks:[],up:1000}],should:[],extra:[]};
  lw.A.save(); await wait(30);              /* saved before midnight, as it would have been */
  LS().settings.lastRoll=plus(-1);          /* now the clock crosses midnight */
  lw.A.render(); await wait(20);
  ok(items()===0,'a plain re-render does not carry anything over on its own');

  ld.dispatchEvent(new lw.Event('visibilitychange')); await wait(120);
  ok(items()===1,'coming back to the app after midnight fills the tray without a reload');
  ok(LS().carry.length===1&&LS().carry[0].id==='nite1','the unfinished task is the one carried');
  ok(LS().settings.lastRoll===T(),'the day is marked as carried over');
  ok((LS().days[plus(-1)].must||[]).some(t=>t.id==='nite2'),'the finished one stays on its day as history');
  ok(/Carry-over/.test(ld.querySelector('#tray').textContent),'the tray panel is on screen');

  ok(LS().carry[0].pos===new Date(T()+'T00:00:00').getTime(),
    'the move is dated midnight, so a device opening later cannot out-stamp a triage');
  ok(LS().carry[0].up===1000,
    'and it is stamped as a move only, leaving the content stamp where it was');

  ld.dispatchEvent(new lw.Event('visibilitychange')); await wait(120);
  ok(LS().carry.length===1,'checking again the same day does not carry it a second time');

  /* every triage control is present and labelled */
  /* The gate: rollover runs once a day. Anything landing on a past day after it has run
     waits until tomorrow. Driven through rollIfNewDay, not rollover, so the gate itself
     is what is under test and cannot be changed silently. */
  LS().days[plus(-2)]={must:[{id:'late1',title:'back-dated after the sweep',done:false,subtasks:[],up:1000}],
    should:[],extra:[]};
  lw.A.save(); await wait(30);
  ok(LS().settings.lastRoll===T(),'today has already been carried over');
  ok(lw.A.rollIfNewDay()===0,'rollIfNewDay is a no-op once the day is marked');
  ok(LS().carry.length===1,'so a task back-dated afterwards does not reach the tray');
  ok((LS().days[plus(-2)].must||[]).some(t=>t.id==='late1'),'it stays on the day it was given');
  ld.dispatchEvent(new lw.Event('visibilitychange')); await wait(120);
  ok(LS().carry.length===1,'returning to the app does not sweep it up either');

  /* but the board nav says so, and offers to bring them in */
  lw.A.render(); await wait(25);
  ok(lw.A.pastOpenCount()===1,'the app knows one task is waiting on a past day');
  const pull=ld.querySelector('[data-action="roll-now"]');
  ok(!!pull,'the board nav shows an affordance rather than staying silent');
  ok(/1 waiting on past days/.test(pull.textContent),'naming how many are waiting');
  ok(pull.className==='nbtn','styled as a board nav button like Prev and Next');
  pull.click(); await wait(40);
  ok(LS().carry.length===2,'pressing it brings them into the tray on demand');
  ok(LS().carry.some(t=>t.id==='late1'),'including the back-dated one');
  ok(!ld.querySelector('[data-action="roll-now"]'),'and the affordance goes once nothing is waiting');
  ok(lw.A.pastOpenCount()===0,'nothing left on past days');
  /* put the tray back to one item for the checks that follow */
  const late=LS().carry.findIndex(t=>t.id==='late1');
  LS().carry.splice(late,1); delete LS().days[plus(-2)];
  lw.A.save(); lw.A.render(); await wait(25);

  const labels=[...ld.querySelectorAll('.trayitem .tbtn')].map(b=>b.textContent.trim());
  ok(labels.length===3,'each carried task offers three triage buttons');
  ok(labels.every(Boolean),'none of the triage buttons is blank');
  ok(labels[0]==='Today'&&labels[1]==='Free Floating','they name where the task would go');
  const bulk=[...ld.querySelectorAll('[data-action="carry-all"]')].map(b=>b.textContent.trim());
  ok(bulk.join()==='All → Today,All → Free Floating','both bulk actions are offered');
  lw.close();
}

console.log('— recycle bin —');
{
  /* clean slate: the wipe itself floods the bin (which proves the central hook),
     then the records are cleared so the section starts empty */
  S().days={}; S().carry=[]; S().focus=[];
  S().floats=[{id:'bf1',name:'Inbox',tasks:[]},{id:'bf2',name:'Errands',tasks:[]}];
  S().settings.activeFloat='bf1'; S().settings.floatMode=false; S().settings.view='board';
  A.save();
  S().tomb={}; S().bin={}; A.save(); A.render(); await wait(30);
  const bin=()=>w.A.state.bin;
  const rows=()=>A.binList();

  ok(!!q('#binBtn'),'the Bin entry point sits in the rail foot');
  ok(q('#binBtn').textContent==='Bin','an empty bin shows no count');

  /* a day task, with a step riding inside it */
  S().days[T()]={must:[{id:'bt1',title:'day task to bin',done:true,
    subtasks:[{id:'bs0',title:'inner step',done:true}]}],should:[],extra:[]};
  A.save(); A.render(); await wait(25);
  await select('bt1');
  click('[data-action="del"][data-id="bt1"]'); await wait(25); A.save();
  ok(!S().days[T()].must.length,'the task left the board');
  ok(!/day task to bin/.test(q('#board').textContent),'and the board shows no trace of it');
  ok(!!bin().bt1&&bin().bt1.k==='task','it landed in the bin as a task');
  ok(bin().bt1.loc.kind==='day'&&bin().bt1.loc.zone==='must','remembering its day and its tier');
  ok(bin().bt1.body.done===true,'with its ticked state');
  ok(bin().bt1.body.subtasks.length===1,'and its step riding inside it');
  ok(!bin().bs0,'the step gets no separate bin row of its own');
  ok(q('#binBtn').textContent==='Bin · 1','the button counts what waits');

  /* the 5 second Undo still comes first, and takes the entry back out */
  ok(!!q('[data-action="undo"]'),'the delete toast still offers Undo');
  click('[data-action="undo"]'); await wait(25); A.save();
  ok(S().days[T()].must.length===1,'undo puts the task straight back');
  ok(!bin().bt1,'and empties its bin entry');
  ok(S().tomb.bt1==null,'and clears the deletion record');

  /* delete again, let the toast lapse, restore from the panel */
  await select('bt1');
  click('[data-action="del"][data-id="bt1"]'); await wait(25); A.save();
  q('#toast').innerHTML='';
  click('[data-action="bin"]'); await wait(25);
  ok(!!q('#binModal'),'the Bin opens as a panel');
  ok(/day task to bin/.test(q('#binModal').textContent),'listing the deleted task');
  ok(/Prio 0 on/.test(q('#binModal').textContent),'saying where it came from');
  ok(/30d left/.test(q('#binModal').textContent),'and how long it has left');
  q('#toast').innerHTML='';
  click('[data-action="bin-restore"][data-id="bt1"]'); await wait(25); A.save();
  ok(S().days[T()].must.some(t=>t.id==='bt1'),'Restore puts it back on the same day and tier');
  ok(S().days[T()].must[0].done===true,'still ticked');
  ok(S().days[T()].must[0].subtasks.length===1,'still holding its step');
  ok(!bin().bt1&&S().tomb.bt1==null,'and the bin and the deletion record let go of it');
  ok(/Restored to Prio 0/.test(q('#toast').textContent),'the toast names where it went');
  click('[data-action="mclose"][data-close="1"]'); await wait(20);

  /* a task in a Free Floating tab, restored after its tab is gone */
  S().floats[1].tasks.push({id:'bt2',title:'errand to bin',done:false,subtasks:[]});
  A.save(); A.render(); await wait(25);
  click('[data-action="floattoggle"]'); await wait(25);
  await select('bt2');
  click('[data-action="del"][data-id="bt2"]'); await wait(25); A.save();
  ok(bin().bt2.loc.kind==='float'&&bin().bt2.loc.fid==='bf2','a float task remembers its tab');
  click('[data-action="float-del"][data-fid="bf2"]'); await wait(25); A.save();
  ok(!!bin().bf2&&bin().bf2.k==='float','the emptied tab lands in the bin too');
  q('#toast').innerHTML='';
  A.restoreBin('bt2'); await wait(25); A.save();
  ok(S().floats[0].tasks.some(t=>t.id==='bt2'),'restoring lands in the first tab when its own is gone');
  ok(/Inbox/.test(q('#toast').textContent),'the toast says where it went');
  ok(/old tab is gone/.test(q('#toast').textContent),'and why');
  A.restoreBin('bf2'); await wait(25); A.save();
  ok(S().floats.some(f=>f.id==='bf2'),'the tab itself restores');
  click('[data-action="floattoggle"]'); await wait(25);

  /* a subtask, back under its task, then as its own task once the task is gone */
  S().days[T()].must[0].subtasks.push({id:'bs1',title:'binnable step',done:true});
  A.save(); A.render(); await wait(25);
  await select('bt1');
  click('[data-action="sdel"][data-id="bt1"][data-sid="bs1"]'); await wait(25); A.save();
  ok(!!bin().bs1&&bin().bs1.k==='sub','a deleted step lands in the bin');
  ok(bin().bs1.pid==='bt1','knowing which task it belonged to');
  A.restoreBin('bs1'); await wait(25); A.save();
  ok(S().days[T()].must[0].subtasks.some(s=>s.id==='bs1'&&s.done===true),
    'it returns under its task, still ticked');
  await select('bt1');
  click('[data-action="sdel"][data-id="bt1"][data-sid="bs1"]'); await wait(25); A.save();
  click('[data-action="del"][data-id="bt1"]'); await wait(25); A.save();
  A.restoreBin('bs1'); await wait(25); A.save();
  ok(S().floats.some(f=>f.tasks.some(t=>t.id==='bs1'&&t.title==='binnable step')),
    'restoring a step whose task is gone makes it a task in the first tab');

  /* a popped-out step is a conversion, not a delete */
  S().days[T()].should=[{id:'bpop',title:'has a step',done:false,
    subtasks:[{id:'bps',title:'goes solo',done:false}]}];
  A.save(); A.render(); await wait(25);
  await select('bpop');
  click('[data-action="spop"][data-id="bpop"][data-sid="bps"]'); await wait(25); A.save();
  ok(!bin().bps,'popping a step out to a task does not bin the step');
  ok(!!S().tomb.bps,'though the old step id is still recorded as gone');

  /* focus item */
  S().focus.push({id:'bfoc',title:'stay patient',done:false,doneAt:null});
  A.save(); A.render(); await wait(25);
  click('[data-action="focus-del"][data-id="bfoc"]'); await wait(25); A.save();
  ok(!!bin().bfoc&&bin().bfoc.k==='focus','a focus item lands in the bin');
  A.restoreBin('bfoc'); await wait(25); A.save();
  ok(S().focus.some(f=>f.id==='bfoc'),'and restores to Focus');

  /* dismissed from the carry-over tray */
  S().carry.push({id:'bcar',title:'dropped from the tray',done:false,subtasks:[],from:'Prio 0 · Fri'});
  A.save(); A.render(); await wait(25);
  click('[data-action="carry-drop"][data-id="bcar"]'); await wait(25); A.save();
  ok(!!bin().bcar,'a task dropped from the carry tray lands in the bin');
  ok(bin().bcar.loc.kind==='carry','marked as coming from the tray');
  A.restoreBin('bcar'); await wait(25); A.save();
  ok(S().carry.some(t=>t.id==='bcar'&&t.from==='Prio 0 · Fri'),
    'and returns to the tray with its origin label');

  /* a tab deleted while holding tasks: restore gathers its tasks back */
  S().floats.push({id:'bf3',name:'Project',tasks:[{id:'bt3',title:'kept work',done:false,subtasks:[]}]});
  A.save(); A.render(); await wait(25);
  click('[data-action="floattoggle"]'); await wait(25);
  click('[data-action="float-del"][data-fid="bf3"]'); await wait(25);
  ok(!!q('.mback .modal'),'a tab holding tasks still asks first');
  click('[data-action="float-del-move"][data-fid="bf3"]'); await wait(25); A.save();
  ok(!S().floats.some(f=>f.id==='bf3'),'the tab went');
  ok(S().floats.some(f=>f.tasks.some(t=>t.id==='bt3')),'its task was moved out, not deleted');
  ok(!!bin().bf3&&(bin().bf3.moved||[]).indexOf('bt3')>-1,
    'the binned tab remembers which tasks it held');
  q('#toast').innerHTML='';
  A.restoreBin('bf3'); await wait(25); A.save();
  ok(S().floats.some(f=>f.id==='bf3'),'restoring brings the tab back');
  ok(S().floats.find(f=>f.id==='bf3').tasks.some(t=>t.id==='bt3'),
    'with the task it held gathered back in');
  ok(S().floats.filter(f=>f.tasks.some(t=>t.id==='bt3')).length===1,'and no copy left behind');
  ok(/moved back into it/.test(q('#toast').textContent),'the toast says the tasks came home');

  /* but a task scheduled onto a day since then stays where the user put it */
  click('[data-action="float-del"][data-fid="bf3"]'); await wait(25);
  click('[data-action="float-del-move"][data-fid="bf3"]'); await wait(25); A.save();
  A.move('bt3',{kind:'day',date:T(),zone:'should'}); A.save();
  A.restoreBin('bf3'); await wait(25); A.save();
  ok(S().days[T()].should.some(t=>t.id==='bt3'),'a task scheduled since stays on its day');
  ok(!S().floats.find(f=>f.id==='bf3').tasks.length,'rather than being yanked back off it');
  click('[data-action="floattoggle"]'); await wait(25);

  /* permanent delete: the entry goes, the deletion record stays */
  S().days[T()].must.push({id:'bperm',title:'never coming back',done:false,subtasks:[]});
  A.save(); A.render(); await wait(25);
  await select('bperm');
  click('[data-action="del"][data-id="bperm"]'); await wait(25); A.save();
  click('[data-action="bin"]'); await wait(25);
  click('[data-action="bin-purge"][data-id="bperm"]'); await wait(25); A.save();
  ok(!!bin().bperm&&!!bin().bperm.purged,'a purged item keeps only a marker');
  ok(!bin().bperm.body,'its content is gone');
  ok(rows().every(x=>x.id!=='bperm'),'and it no longer lists');
  ok(!!S().tomb.bperm,'while the deletion record stays, so no device revives it');
  click('[data-action="mclose"][data-close="1"]'); await wait(20);

  /* empty bin asks first, since that one is final */
  S().tomb={}; S().bin={}; A.save();     /* start this part from a clean bin */
  S().days[T()].must.push({id:'be1',title:'one of two',done:false,subtasks:[]},
                          {id:'be2',title:'two of two',done:false,subtasks:[]});
  A.save(); A.render(); await wait(25);
  await select('be1'); click('[data-action="del"][data-id="be1"]'); await wait(25);
  await select('be2'); click('[data-action="del"][data-id="be2"]'); await wait(25); A.save();
  ok(rows().length===2,'two things wait in the bin');
  click('[data-action="bin"]'); await wait(25);
  click('[data-action="bin-empty"]'); await wait(25);
  ok(/cannot be undone/.test(q('#binModal').textContent),'emptying asks first and says it is final');
  click('[data-action="bin-back"]'); await wait(25);
  ok(rows().length===2,'backing out keeps everything');
  click('[data-action="bin-empty"]'); await wait(25);
  click('[data-action="bin-empty-yes"]'); await wait(25); A.save();
  ok(rows().length===0,'emptying clears the list');
  ok(/Nothing in the bin/.test(q('#binModal').textContent),'and says so');
  ok(q('#binBtn').textContent==='Bin','and the count goes quiet');
  click('[data-action="mclose"][data-close="1"]'); await wait(20);

  /* 30 day expiry, and the central hook catching a codepath with no button at all */
  S().days[T()].must.push({id:'bold',title:'ageing away',done:false,subtasks:[]});
  A.save();
  S().days[T()].must=S().days[T()].must.filter(t=>t.id!=='bold');
  A.save();
  ok(!!bin().bold,'even a task removed by plain code lands in the bin, no path missed');
  bin().bold.at=Date.now()-31*864e5;
  S().tomb.bold=Date.now()-31*864e5;
  A.save();
  ok(!bin().bold,'after 30 days an entry expires on its own');
  ok(!!S().tomb.bold,'though the deletion record lives on a while longer');
}

console.log('— recycle bin across devices —');
{
  const now=Date.now();
  const mk=()=>({ver:2,days:{},carry:[],focus:[],tomb:{},bin:{},
    floats:[{id:'f1',name:'Inbox',tasks:[],up:100}],
    settings:{view:'board',boardOffset:0,floatMode:false,activeFloat:'f1',calSel:null,
      calOffset:0,mRange:'day',stripDay:null,lastRoll:null,showDone:false}});
  const D2='2026-08-05';
  const body={id:'mx',title:'shared task',done:false,subtasks:[],up:now-6e5};
  const cp=o=>JSON.parse(JSON.stringify(o));

  { /* deleted on A while B still holds it: the delete and the bin entry both travel */
    const a=mk(); a.tomb={mx:now-3e5};
    a.bin={mx:{k:'task',at:now-3e5,body:cp(body),loc:{kind:'day',date:D2,zone:'should'}}};
    const b=mk(); b.days[D2]={must:[],should:[cp(body)],extra:[]};
    const m=A.mergeStates(a,b), m2=A.mergeStates(b,a);
    ok(!Object.keys(A.flatten(m).task).length,'the delete crosses to the device still holding the task');
    ok(!!m.bin.mx&&!m.bin.mx.purged,'and the bin entry travels with it');
    ok(A.stateSig(m)===A.stateSig(m2),'whichever side merges, same answer');
  }
  { /* A deleted, B restored later: the restore wins and the entry clears everywhere */
    const a=mk(); a.tomb={mx:now-3e5};
    a.bin={mx:{k:'task',at:now-3e5,body:cp(body),loc:{kind:'day',date:D2,zone:'should'}}};
    const b=mk(); const revived=cp(body); revived.up=now-1e5;
    b.days[D2]={must:[],should:[revived],extra:[]};
    const r1=A.mergeStates(a,b), r2=A.mergeStates(b,a);
    ok(Object.keys(A.flatten(r1).task).length===1,'a restore made on one device survives the merge');
    ok(!r1.bin.mx,'and clears the bin entry everywhere');
    ok(A.stateSig(r1)===A.stateSig(r2),'from either direction');
  }
  { /* a permanent delete beats a copy still waiting on the other device */
    const a=mk(); a.tomb={mx:now-3e5}; a.bin={mx:{at:now-3e5,purged:now-1e5}};
    const b=mk(); b.tomb={mx:now-3e5};
    b.bin={mx:{k:'task',at:now-3e5,body:cp(body),loc:{kind:'day',date:D2,zone:'should'}}};
    const p1=A.mergeStates(a,b);
    ok(!!p1.bin.mx.purged,'a purge is final across devices');
    ok(!p1.bin.mx.body,'and strips the body on the other device too');
    ok(A.stateSig(p1)===A.stateSig(A.mergeStates(b,a)),'agreed from either direction');
  }
}

console.log('— sync merge: end to end across two windows —');
{
  const cloud={row:null};
  const fetchFor=net=>async(url,opts)=>{
    if(net&&net.down) throw new TypeError('Failed to fetch');
    opts=opts||{};
    if((opts.method||'GET').toUpperCase()==='GET')
      return {ok:true,status:200,text:async()=>'',
        json:async()=>cloud.row?[{data:cloud.row.data,updated_at:cloud.row.updated_at}]:[]};
    const b=JSON.parse(opts.body)[0];
    cloud.row={data:JSON.parse(JSON.stringify(b.data)),updated_at:b.updated_at};
    return {ok:true,status:200,text:async()=>'',json:async()=>[]};
  };
  const disk=w=>{const o={};for(let i=0;i<w.localStorage.length;i++){const k=w.localStorage.key(i);o[k]=w.localStorage.getItem(k)}return o};
  const boot=async(seed,net)=>{
    const d=new JSDOM(html,{runScripts:'dangerously',url:'http://localhost/',pretendToBeVisual:true,
      beforeParse(w){ w.fetch=fetchFor(net);
        Object.keys(seed||{}).forEach(k=>w.localStorage.setItem(k,seed[k])) }});
    await wait(260); return d.window;
  };
  const shown=w=>{ const x=w.A.state.days[T()]||{must:[],should:[],extra:[]};
    return [...x.must,...x.should,...x.extra].map(t=>t.title).sort() };
  const addOn=async(w,title)=>{
    w.document.querySelector('#qi').value=title;
    w.document.querySelector('#qd').value='day:'+T()+':must';
    w.document.querySelector('#qb').click();
    await wait(40); w.A.save(); await w.A.syncCycle({}); await wait(40);
  };
  const seed={agora_dayplanner_synckey:'hs-suite-key'};
  const pcNet={down:false}, tabNet={down:false};
  const pc=await boot(seed,pcNet); await wait(200);
  const tab=await boot(disk(pc),tabNet); await wait(200);
  ok(pc.A.sync.key==='hs-suite-key'&&tab.A.sync.key==='hs-suite-key','both windows share one sync key');

  await addOn(pc,'from the PC');          /* neither device hears the other until it syncs */
  await addOn(tab,'from the tablet');
  await pc.A.syncCycle({}); await wait(60);
  ok(shown(pc).join()==='from the PC,from the tablet','the PC picks up the tablet task');
  ok(shown(tab).join()==='from the PC,from the tablet','the tablet kept its own and gained the PC task');

  /* tick on one device, see it on the other */
  const t=pc.A.state.days[T()].must.filter(x=>x.title==='from the tablet')[0];
  t.done=true; pc.A.save(); await pc.A.syncCycle({}); await wait(40);
  await tab.A.syncCycle({}); await wait(40);
  ok(tab.A.state.days[T()].must.filter(x=>x.title==='from the tablet')[0].done===true,
    'a tick crosses to the other device on its own');

  /* delete on one device, and it does not come back */
  const pcState=pc.A.state.days[T()].must;
  const gone=pcState.filter(x=>x.title==='from the PC')[0];
  pcState.splice(pcState.indexOf(gone),1);
  pc.A.save(); await pc.A.syncCycle({}); await wait(40);
  await tab.A.syncCycle({}); await wait(40);
  ok(shown(tab).join()==='from the tablet','a delete crosses over instead of being undone by the other copy');
  await pc.A.syncCycle({}); await wait(40);
  ok(shown(pc).join()==='from the tablet','and the deleted task does not reappear on the next sync');

  /* the tablet loses its connection, both devices carry on, then it comes back */
  tabNet.down=true;
  await addOn(tab,'written on a train');
  ok(shown(tab).indexOf('written on a train')>-1,'an edit with no connection still lands on the device');
  ok(tab.A.sync.state==='offline','the status says offline rather than error');
  ok(tab.A.sync.pending===true,'the change is held as pending, not dropped');
  await addOn(pc,'written at the desk');
  tabNet.down=false;
  await tab.A.syncCycle({}); await wait(60);
  ok(shown(tab).join()==='from the tablet,written at the desk,written on a train',
    'reconnecting merges the offline work with what the other device did meanwhile');
  await pc.A.syncCycle({}); await wait(60);
  ok(shown(pc).join()==='from the tablet,written at the desk,written on a train',
    'and the other device receives the work done offline');

  /* coming back to the app pulls on its own, with no button pressed */
  await addOn(tab,'added while the PC was away');
  pc.A.sync.checked=0;                       /* as if the PC had been left alone a while */
  pc.document.dispatchEvent(new pc.Event('visibilitychange'));
  await wait(220);
  ok(shown(pc).indexOf('added while the PC was away')>-1,
    'returning to the app pulls the other device changes without pressing anything');

  /* and an edit goes up on its own, without pressing Push */
  pc.document.querySelector('#qi').value='typed and left alone';
  pc.document.querySelector('#qd').value='day:'+T()+':must';
  pc.document.querySelector('#qb').click();
  await wait(2300);                          /* the push is debounced, not immediate */
  ok(/typed and left alone/.test(JSON.stringify(cloud.row.data)),
    'an edit reaches the cloud on its own a moment later');

  /* a reload of either device shows the same planner */
  await pc.A.syncCycle({}); await wait(60);
  const settled=shown(pc);
  ok(settled.length===5,'both devices hold the same five tasks after all of that');
  const pc2=await boot(disk(pc),pcNet); await wait(300);
  ok(shown(pc2).join()===settled.join(),'a reload agrees with what is in the cloud');
  ok(pc2.A.state.tomb&&Object.keys(pc2.A.state.tomb).length>0,'deletions are carried in the saved planner');

  /* the bin rides the same sync: the delete made earlier is waiting on every device */
  const binned=Object.keys(pc2.A.state.bin).filter(id=>!pc2.A.state.bin[id].purged);
  ok(binned.length===1,'the binned deletion is in the cloud copy too');
  ok(!!tab.A.state.bin[binned[0]],'and the other device holds it as well');
  pc2.A.restoreBin(binned[0]); pc2.A.save(); await pc2.A.syncCycle({}); await wait(60);
  await tab.A.syncCycle({}); await wait(60);
  ok(shown(tab).indexOf('from the PC')>-1,'a restore made on one device reaches the other');
  ok(!tab.A.state.bin[binned[0]],'and clears the bin entry there too');
}

console.log('— the docs match reality —');
{
  /* The expected count in CLAUDE.md has drifted twice. Rather than a generator nobody
     remembers to run, the suite checks itself: add a test, this fails, and the message
     tells you the number to write down. Counts this assertion, so it is stable. */
  const md=fs.readFileSync('./CLAUDE.md','utf8');
  const m=md.match(/RESULT:\s*(\d+)\s+passed/);
  const total=pass+fail+1;
  ok(m&&+m[1]===total,
    'CLAUDE.md says '+(m?m[1]:'nothing')+' assertions, the suite has '+total+
    '. Update the expect line in CLAUDE.md.');
}

console.log('\nRESULT: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
})().catch(e=>{console.error('CRASH',e);process.exit(1)});
