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
  ok(labels.join(',')==='Help,Sync,Export,Import','Help, Sync, Export and Import all live in the rail foot');
  ok(foot.parentElement.classList.contains('railhide'),'they sit inside the collapsible menu');
  const css=q('style').textContent;
  ok(/@media \(max-width:900px\)[\s\S]*#rail \.railfoot\{order:-1/.test(css),
    'phones lift the rail foot to the top of the opened menu');
  ok(!/#rail \.railfoot\{[^}]*order:-1[^}]*\}/.test(css.split('@media (max-width:900px)')[0]),
    'desktop keeps them at the foot');
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
}

console.log('\nRESULT: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
})().catch(e=>{console.error('CRASH',e);process.exit(1)});
