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
click('[data-action="bump"][data-id="'+tid+'"]'); await wait(25);
ok(S().days[plus(1)].should.some(t=>t.id===tid),'→ Tmrw bumps a day forward');
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
S().floats.pop(); A.render(); await wait(20);
ok(qa('.col.backlog [data-action="float-del"]').length===2,'last-tab guard: delete only when more than one');
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

console.log('\nRESULT: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
})().catch(e=>{console.error('CRASH',e);process.exit(1)});
