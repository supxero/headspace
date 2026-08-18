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
/* These two must agree with the app's `iso` (index.html), which pins a date to LOCAL
   noon before slicing the ISO string. A bare toISOString() is UTC, so east of Greenwich
   these named YESTERDAY for the whole early-morning window (at UTC+8, local 00:00 to
   08:00) while the app was already on today. That did not read as a failed assertion,
   it crashed: #qd only carries options for the app's today and tomorrow, so a select
   set to a date it does not offer keeps '', addFromText splits '' into a dest with an
   undefined zone, and place() splices undefined. The rest of the file already
   normalises to noon; these two were the ones left on UTC. */
const T=()=>{const d=new Date();d.setHours(12,0,0,0);return d.toISOString().slice(0,10)};
const plus=n=>{const d=new Date();d.setDate(d.getDate()+n);d.setHours(12,0,0,0);return d.toISOString().slice(0,10)};
const fire=(el,t)=>el.dispatchEvent(new w.Event(t,{bubbles:true}));
const select=async id=>{ // make sure this card is the open one
  if(!q('.task.sel [data-action="sel"][data-id="'+id+'"]')){
    if(q('.task.sel')) { w.A.state && (0); }
    const e=q('[data-action="sel"][data-id="'+id+'"]'); e.click(); await wait(25);
    if(!q('.task.sel [data-action="sel"][data-id="'+id+'"]')){ q('[data-action="sel"][data-id="'+id+'"]').click(); await wait(25) }
  }
};

/* THE STANDING INVARIANT, asserted on every merge this file runs.
   A task in the carry tray is never done. rollover() leaves a ticked task on its day
   and the tray draws no tick control, so no single device can reach the state; it was
   manufactured by the merge itself, which resolves `done` on the dn axis and `loc` on
   pos and married a tick made here to a roll made there (REVIEW Section 21). What let
   it ship was that nothing anywhere asserted it: there were merge fixtures for ticks
   and merge fixtures for rolls, and none of them looked at the combination.
   Wrapping the entry point rather than adding one dedicated test means every fixture
   in this file, present and future, carries the check for free and in its own shape. */
const rawMerge=A.mergeStates;
A.mergeStates=(x,y)=>{
  const m=rawMerge(x,y);
  const bad=(m.carry||[]).filter(t=>t&&t.done).map(t=>t.title||t.id);
  ok(bad.length===0,'invariant: nothing done is ever left in the carry tray ('+bad.join(', ')+')');
  return m;
};

console.log('— boot —');
ok(!!A,'app object exposed');
ok(!!q('#rail'),'left rail renders');
ok(qa('#rail .navbtn').length===4,'four nav buttons: Board, Calendar, Free Floating, Notes');
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
ok(!!extra.querySelector('.zh .lk'),'and the lock glyph on the zone header says so');
ok(!/Opens when every Prio 0 is ticked/.test(extra.textContent),'no lock sentence is drawn');
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
console.log('— Free Floating tabs: drag to reorder —');
{
  /* jsdom fires no native drags, so the handlers are driven with synthetic events
     carrying a stub dataTransfer: the same wiring, minus the browser's drag loop */
  S().floats.push({id:'dragT',name:'Errands',tasks:[]});
  A.save(); A.render(); await wait(25);
  const order=()=>S().floats.map(f=>f.id).join();
  const [fa,fb,fc]=S().floats.map(f=>f.id);
  const dt={setData(){},effectAllowed:'',dropEffect:''};
  const dnd=(el,type,extra)=>{const ev=new w.Event(type,{bubbles:true,cancelable:true});
    ev.dataTransfer=dt; Object.assign(ev,extra||{}); el.dispatchEvent(ev)};
  const head=fid=>q('.col.backlog[data-fid="'+fid+'"] .colhead');

  ok(!!head(fa)&&head(fa).getAttribute('draggable')==='true','a tab header is a drag handle');
  ok(!!head(fa).title,'and says so');
  dnd(head(fc),'dragstart');
  ok(A.ui.drag&&A.ui.drag.type==='tab'&&A.ui.drag.fid===fc,
    'a drag starting on the header is a tab drag');
  const target=q('.col.backlog[data-fid="'+fa+'"]');
  dnd(target,'dragover');
  ok(target.classList.contains('drop'),'the column under it shows the cue');
  dnd(target,'drop',{clientX:0,clientY:0}); await wait(30);
  ok(order()===[fc,fa,fb].join(),'dropping the third tab on the first moves it in front');
  ok(!A.ui.drag,'and the drag is let go');
  A.save(); await wait(10);
  ok(JSON.parse(w.localStorage.getItem('agora_dayplanner_v1')).floats.map(f=>f.id).join()===order(),
    'the new order is what is saved');
  ok([...qa('.col.backlog')].map(c=>c.dataset.fid).join()===order(),'and what is drawn');

  /* an abandoned drag changes nothing and clears its cues */
  dnd(head(fb),'dragstart');
  dnd(q('.col.backlog[data-fid="'+fa+'"]'),'dragover');
  dnd(doc.body,'dragend'); await wait(10);
  ok(!A.ui.drag&&!q('.col.drop')&&!q('.col.dragging'),'an abandoned tab drag cleans up');
  ok(order()===[fc,fa,fb].join(),'without moving anything');

  /* while a tab rename is open its header must not start a drag */
  click('[data-action="float-rename"][data-fid="'+fa+'"]'); await wait(20);
  dnd(head(fa),'dragstart');
  ok(!A.ui.drag,'a header with a rename open does not start a tab drag');
  const ed9=q('.colhead [data-kind]');
  /* jsdom's blur() is a no-op, so fire the blur the way the other rename tests do */
  if(ed9){ ed9.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    fire(ed9,'blur'); await wait(25) }

  /* the insertion cue names the landing side, follows the midpoint, and repeats
     of an unchanged dragover cost nothing: no class writes, no document queries */
  {
    dnd(head(fb),'dragstart');
    const tgt=q('.col.backlog[data-fid="'+fa+'"]');
    dnd(tgt,'dragover',{clientX:0,clientY:0});
    ok(tgt.classList.contains('drop')&&tgt.classList.contains('drop-before')
      &&!tgt.classList.contains('drop-after'),
      'the near half shows the land-in-front bar beside the drop cue');
    dnd(tgt,'dragover',{clientX:40,clientY:0});
    ok(tgt.classList.contains('drop-after')&&!tgt.classList.contains('drop-before'),
      'crossing the midpoint swaps it to land-behind');
    const tl=w.DOMTokenList.prototype, oadd=tl.add, orem=tl.remove;
    const dp=w.Document.prototype, oqsa=dp.querySelectorAll;
    let writes=0, queries=0;
    tl.add=function(...a){writes++;return oadd.apply(this,a)};
    tl.remove=function(...a){writes++;return orem.apply(this,a)};
    dp.querySelectorAll=function(...a){queries++;return oqsa.apply(this,a)};
    for(let i=0;i<40;i++) dnd(tgt,'dragover',{clientX:40,clientY:0});
    tl.add=oadd; tl.remove=orem; dp.querySelectorAll=oqsa;
    ok(writes===0,'forty repeats of the same dragover write no classes');
    ok(queries===0,'and run no document-wide queries');
    dnd(q('.col.backlog[data-fid="'+fb+'"]'),'dragover',{clientX:0,clientY:0});
    ok(!tgt.classList.contains('drop')&&!tgt.classList.contains('drop-after'),
      'wandering off every target lets the cue go instead of letting it linger');
    dnd(doc.body,'dragend'); await wait(10);
    ok(!q('.drop-before')&&!q('.drop-after')&&!q('.col.drop'),'dragend leaves no side cue behind');
    ok(order()===[fc,fa,fb].join(),'and the cue work moved nothing');
  }

  /* the swap animates by FLIP: transform-only keyframes ending where layout put
     the column, in the app's short range, and skipped whole under reduced motion.
     jsdom has no rects and no element.animate, so both are stubbed: rects come
     from DOM order, which is exactly what a FLIP measures before and after. */
  {
    const calls=[];
    const oAnim=w.Element.prototype.animate;
    w.Element.prototype.animate=function(kf,opts){calls.push({kf,opts});return {}};
    const oRect=w.Element.prototype.getBoundingClientRect;
    w.Element.prototype.getBoundingClientRect=function(){
      if(this.classList&&this.classList.contains('backlog')&&this.parentNode){
        const i=[...this.parentNode.children].indexOf(this);
        return {left:i*280,top:0,right:i*280+268,bottom:400,width:268,height:400};
      }
      return oRect.call(this);
    };
    dnd(head(fb),'dragstart');
    const tgt=q('.col.backlog[data-fid="'+fc+'"]');
    dnd(tgt,'dragover',{clientX:0,clientY:0});
    dnd(tgt,'drop',{clientX:0,clientY:0}); await wait(30);
    ok(order()===[fb,fc,fa].join(),'the animated drop still lands in front of the target');
    ok(calls.length===3,'every column that moved animates');
    ok(calls.every(x=>Object.keys(x.kf[0]).join()==='transform'&&x.kf[1].transform==='none'),
      'by transform alone, ending where layout put it');
    ok(calls.every(x=>x.opts.duration===200&&/\.2,\.7,\.3,1/.test(x.opts.easing)),
      'in the 200ms the rest of the app uses, on the house easing');
    dnd(doc.body,'dragend'); await wait(10);

    /* reduced motion: the reorder happens, the animation does not */
    calls.length=0;
    const oMM=w.matchMedia;
    w.matchMedia=mq=>({matches:/reduced-motion/.test(mq),media:mq,
      addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
    dnd(head(fa),'dragstart');
    const tgt2=q('.col.backlog[data-fid="'+fb+'"]');
    dnd(tgt2,'dragover',{clientX:0,clientY:0});
    dnd(tgt2,'drop',{clientX:0,clientY:0}); await wait(30);
    ok(order()===[fa,fb,fc].join(),'reduced motion still reorders');
    ok(calls.length===0,'but skips the animation entirely');
    w.matchMedia=oMM;
    w.Element.prototype.animate=oAnim;
    w.Element.prototype.getBoundingClientRect=oRect;
    dnd(doc.body,'dragend'); await wait(10);
    /* leave the order the way the earlier drag tests left it */
    A.reorderTab(fc,fa,false); A.save(); A.render(); await wait(20);
  }

  /* the card paths are untouched: a drag starting on a card is a card drag, and a
     card dropped on another tab's zone moves the card, never the tab */
  S().floats.find(f=>f.id===fa).tasks.push({id:'dragC',title:'card in transit',done:false,subtasks:[]});
  A.save(); A.render(); await wait(25);
  dnd(q('.task[data-id="dragC"]'),'dragstart');
  ok(A.ui.drag&&A.ui.drag.type==='task','a drag starting on a card is still a card drag');
  const zone=q('.zone[data-drop="float"][data-fid="'+fb+'"]');
  dnd(zone,'dragover');
  ok(zone.classList.contains('drop'),'the zone cue still engages for a card');
  dnd(zone,'drop',{clientX:0,clientY:0}); await wait(30);
  ok(S().floats.find(f=>f.id===fb).tasks.some(t=>t.id==='dragC'),'the card lands in the other tab');
  ok(order()===[fc,fa,fb].join(),'and the tabs themselves did not move');
  S().floats.find(f=>f.id===fb).tasks=S().floats.find(f=>f.id===fb).tasks.filter(t=>t.id!=='dragC');
  A.save(); A.render(); await wait(20);
}
click('[data-action="floattoggle"]'); await wait(30);
ok(S().settings.floatMode===false,'float mode off');

console.log('— card drag onto a day column stays intact —');
{
  const dt2={setData(){},effectAllowed:'',dropEffect:''};
  const dnd2=(el,type,extra)=>{const ev=new w.Event(type,{bubbles:true,cancelable:true});
    ev.dataTransfer=dt2; Object.assign(ev,extra||{}); el.dispatchEvent(ev)};
  ok(!q('.col[data-day] .colhead[draggable="true"]'),'day column headers are not drag handles');
  S().days[T()]=S().days[T()]||{must:[],should:[],extra:[]};
  S().days[T()].must.push({id:'dayDrag',title:'drag me to tomorrow',done:false,subtasks:[]});
  A.save(); A.render(); await wait(25);
  dnd2(q('.task[data-id="dayDrag"]'),'dragstart');
  ok(A.ui.drag&&A.ui.drag.type==='task','a card drag on the day board is a card drag');
  const z=q('.zone[data-drop="day"][data-day="'+plus(1)+'"][data-zone="must"]');
  dnd2(z,'dragover'); dnd2(z,'drop',{clientX:0,clientY:0}); await wait(30);
  ok(S().days[plus(1)].must.some(t=>t.id==='dayDrag'),'dropping on a day zone schedules the card');
  S().days[plus(1)].must=S().days[plus(1)].must.filter(t=>t.id!=='dayDrag');
  A.save(); A.render(); await wait(20);
}

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
/* COLLAPSED ON ARRIVAL: the roll announces itself as a header bar, not the list */
ok(S().settings.trayOpen===false,'the roll lands the tray collapsed');
ok(!q('#tray .trayitem')&&!q('[data-action="carry-all"]'),
  'the bar draws no items and no bulk actions until it is opened');
ok(q('#tray .traycnt').textContent===S().carry.length+' waiting',
  'and counts what is waiting, like "0 open": '+q('#tray .traycnt').textContent);
ok(!!q('#tray .trayhead .chev'),'behind the shared chevron every collapsible header uses');
click('[data-action="tray-toggle"]'); await wait(30);
ok(S().settings.trayOpen===true&&!!q('#tray .trayitem'),'opening reveals the items');
click('[data-action="carry-all"][data-to="today"]'); await wait(30);
ok(S().carry.length===0,'All → Today empties the tray');
ok(S().days[T()].must.some(t=>t.id==='oldx'),'and they land on Today · Must');
click('[data-action="undo"]'); await wait(30);
ok(S().carry.length===1,'undo puts them back in the tray');
click('[data-action="carry-all"][data-to="float"]'); await wait(30);
ok(S().floats.some(f=>f.tasks.some(t=>t.id==='oldx')),'All → Free Floating works too');

console.log('— True north panel —');
/* the panel is empty here, so it sits as a header bar; open it through the header */
ok(!q('#fi'),'an empty True north panel hides its input behind the header');
ok(/True north/.test(q('#fpanel').textContent),'the header carries the new name');
ok(/not set/.test(q('#fpanel').textContent),'and reads not set, never a count of open items');
ok(!/open/.test(q('#fpanel').textContent),'nothing in it says open');
click('#fpanel .kh[data-action="panel-toggle"]'); await wait(20);
ok(q('#fi').placeholder==='A line to steer by…','the placeholder invites a statement, not a task');
q('#fi').value='ship the report without rushing';
click('[data-action="focus-add"]'); await wait(20);
ok(S().focus.length===1,'statement added');
const foid=S().focus[0].id;
ok(!q('#fpanel .box'),'no tick box anywhere in the panel');
ok(!q('#fpanel [data-action="focus-tick"]'),'and no tick action at all');
ok(!!q('#fpanel .frow .ftxt span[data-action="focus-rename"]'),'the statement is there to read and rename');

/* uncollapsible while it holds a statement: no toggle, no chevron, and no stale
   flag can hide it, since nothing about its collapse is persisted */
ok(!q('#fpanel .kh[data-action="panel-toggle"]'),'with content the header offers no toggle');
ok(!q('#fpanel .chev'),'and draws no chevron it could not honour');
ok(!/not set/.test(q('#fpanel').textContent),'the not set tag is gone while something is held');
{
  A.ui.peek.focus=true; A.render(); await wait(20);
  ok(!!q('#fi')&&!!q('#fpanel .frow'),'a stale peek flag cannot change a held panel');
  ok(A.ui.peek.focus===undefined,'and it is dropped on render');
  A.ui.peek.focus=false; A.render(); await wait(20);
  ok(!!q('#fpanel .frow'),'a false one cannot hide it either');
  delete A.ui.peek.focus;
}
{ /* the on-load story: collapse state is derived from content alone, so a saved
     planner with statements can never come back hidden */
  A.save(); const saved=JSON.parse(w.localStorage.getItem('agora_dayplanner_v1'));
  ok(saved.focus.length===1,'the statement is in the saved planner');
  ok(!('focusOpen' in saved.settings)&&!('peek' in saved.settings),
    'no collapse flag for it exists anywhere in settings to migrate or mis-load');
}

/* set aside replaces the tick: same fields, no chore framing */
click('[data-action="focus-aside"][data-id="'+foid+'"]'); await wait(20);
ok(S().focus[0].done===true,'set aside marks it with the same done field');
ok(S().focus[0].doneAt===T(),'and records the date it was held until');
ok(/Set aside \(1\)/.test(q('#fpanel').textContent),'the archive reads Set aside, not Completed');
ok(!/Completed/.test(q('#fpanel').textContent),'Completed is gone');
click('[data-action="focus-toggle-done"]'); await wait(20);
ok(S().settings.showDone===true,'the archive expands on the same internal flag');
ok(/held until/.test(q('#fpanel').textContent),'an archived statement shows the date it was held until');
ok(!!q('[data-action="focus-back"][data-id="'+foid+'"]'),'and offers a way back');

/* with its only statement set aside the panel is empty again: collapsible, not pinned */
ok(!!q('#fpanel .kh[data-action="panel-toggle"]')&&!!q('#fpanel .chev'),
  'an archived-only panel collapses like an empty one, the statement is no longer in view anyway');
click('[data-action="focus-back"][data-id="'+foid+'"]'); await wait(20);
ok(S().focus[0].done===false&&S().focus[0].doneAt===null,'bring back clears both fields');
ok(!q('#fpanel .chev'),'and the panel pins open again');

/* legacy migration: a planner ticked under the old name renders under Set aside,
   title and date intact, nothing lost and nothing resurfacing as current */
S().focus.push({id:'oldfoc',title:'breathe first','done':true,doneAt:'2026-08-03'});
A.save(); A.render(); await wait(20);
ok(/Set aside \(1\)/.test(q('#fpanel').textContent),'an old ticked item files under Set aside');
ok(/breathe first/.test(q('#fpanel').textContent)&&/held until 2026-08-03/.test(q('#fpanel').textContent),
  'with its words and its date intact');
ok(qa('#fpanel .frow:not(.done)').length===1,'and it does not resurface as the current statement');
S().focus=S().focus.filter(f=>f.id!=='oldfoc'); A.save(); A.render(); await wait(20);

click('[data-action="focus-del"][data-id="'+foid+'"]'); await wait(20);
ok(S().focus.length===0,'statement removed');
ok(/Statement removed/.test(q('#toast').textContent),'the toast speaks the new language');
click('[data-action="undo"]'); await wait(30);
ok(S().focus.length===1,'undo restores it');

/* the rename reached every user-facing string: the raw page source no longer
   says Focus this week anywhere, while the state key must stay focus */
ok(!html.includes('Focus this week'),'no string in the page still says Focus this week');
ok(html.includes('state.focus'),'while the internal state key stays focus, saved data intact');

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
{ /* A RENDER MUST NOT MUTATE WHAT IT IS DRAWING. The day panel read the day through
     day(), which CREATES it when it is missing, so every click on a bare square wrote a
     permanent empty {must,should,extra} into state.days and left it there: the planner
     grew by one dead day per click, and dead days merge, sync and count for every sweep
     that walks the keys. Read without creating; create where a task is actually added.
     (The board creates the days it DRAWS, through the same call in dayCol, which is why
     this starts by clearing the square it is about to click.) */
  const empty=d=>{ const x=S().days[d];
    return !x||['must','should','extra'].every(z=>!((x[z]||[]).length)) };
  const cells=qa('.cell[data-day]').map(c=>c.dataset.day).filter(d=>d!==T()&&empty(d));
  const bare=cells[cells.length-1];
  delete S().days[bare]; A.save(); A.render(); await wait(20);
  ok(!!bare&&!S().days[bare],'starting from a square the planner holds nothing for ('+bare+')');
  click('[data-action="cal-day"][data-day="'+bare+'"]'); await wait(30);
  ok(S().settings.calSel===bare&&/Tasks on/.test(q('.dphead').textContent),
    'its panel opens and offers the day');
  ok(/Nothing on this day yet/.test(q('.dplist').textContent),'saying plainly that it is empty');
  ok(!S().days[bare],'and drawing that panel does NOT create the day');
  A.render(); A.render(); await wait(20);
  ok(!S().days[bare],'nor does drawing it again, however many times the screen is redrawn');
  q('#calAdd').value='the first thing on that day';
  click('[data-action="cal-add"][data-day="'+bare+'"]'); await wait(30);
  ok(!!S().days[bare]&&S().days[bare].must.some(t=>t.title==='the first thing on that day'),
    'adding a task is what creates the day, which is the only thing that should');
  const tid=S().days[bare].must[0].id;
  S().days[bare].must=[]; delete S().days[bare]; A.save(); A.render(); await wait(20);
  ok(!S().days[bare]&&!A.findTask(tid),'cleaned up after itself, so the sections below start where they did');
}
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

console.log('— Enter chains the next task —');
/* Enter commits and leaves a fresh field open in the SAME zone, so a list is typed
   straight down. The only ways out are an empty Enter, Escape, or a tap outside. */
const enter=el=>el.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
click('.zadd[data-k="'+zk+'"]'); await wait(30);
type(q('.addin'),'call the bank');
enter(q('.addin')); await wait(40);
ok(!!q('.addin[data-k="'+zk+'"]'),'Enter leaves a field open, ready for the next one');
ok(q('.addin[data-k="'+zk+'"]').value==='','the reopened field is empty');
ok(doc.activeElement===q('.addin[data-k="'+zk+'"]'),'and the caret is already in it');
ok(mustNow().join()==='buy milk,call the bank','Enter commits the task');
{
  /* several in a row, never touching the mouse: the shape the change is for */
  ['post the form','water the plants','ring the vet'].forEach(t=>{
    type(q('.addin'),t); enter(q('.addin'));
  });
  await wait(40);
  ok(mustNow().join()==='buy milk,call the bank,post the form,water the plants,ring the vet',
    'four tasks typed one after another, each committed by Enter ('+mustNow().join()+')');
  ok(!!q('.addin[data-k="'+zk+'"]')&&q('.addin[data-k="'+zk+'"]').value==='',
    'the field is still open and empty after the run');
  ok(qa('.addin').length===1,'exactly one add field is open, never a second');
}
/* an empty Enter is the way out: it closes rather than opening another */
enter(q('.addin')); await wait(40);
ok(!q('.addin'),'Enter on an empty field closes it instead of opening another');
ok(mustNow().length===5,'and commits nothing');

/* the chain stays inside the zone it started in */
const zk2='day:'+T()+':should';
click('.zadd[data-k="'+zk2+'"]'); await wait(30);
type(q('.addin'),'draft the note'); enter(q('.addin')); await wait(40);
ok(!!q('.addin[data-k="'+zk2+'"]'),'the reopened field belongs to the same zone');
ok((S().days[T()]||{should:[]}).should.map(t=>t.title).join()==='draft the note',
  'and the task landed in that zone, not the one before it');
ok(mustNow().length===5,'Prio 0 is untouched by a Prio 1 chain');
q('#main').click(); await wait(40);

/* Free Floating: the same key, the same chaining, keyed on the tab */
{
  S().settings.floatMode=true; S().settings.view='board'; A.render(); await wait(30);
  const fid=S().floats[0].id, fk='float:'+fid, before=S().floats[0].tasks.length;
  click('.zadd[data-k="'+fk+'"]'); await wait(30);
  type(q('.addin'),'stamps'); enter(q('.addin')); await wait(40);
  ok(!!q('.addin[data-k="'+fk+'"]'),'Free Floating reopens the field on the same tab');
  type(q('.addin'),'envelopes'); enter(q('.addin')); await wait(40);
  ok(S().floats[0].tasks.length===before+2,'two tasks chained into the tab');
  ok(S().floats[0].tasks.slice(-2).map(t=>t.title).join()==='stamps,envelopes',
    'in the order they were typed');
  enter(q('.addin')); await wait(40);
  ok(!q('.addin'),'and an empty Enter closes it there too');
  S().settings.floatMode=false; A.render(); await wait(30);
}

/* the on-screen keyboard shape: a reopening field must not invite the old trap back.
   The chain never blurs (that is what drops the keyboard) and never re-renders on a
   height-only resize, so the field survives the keyboard opening and closing. */
{
  S().days={}; A.render(); await wait(30);
  click('.zadd[data-k="'+zk+'"]'); await wait(30);
  type(q('.addin'),'first'); enter(q('.addin')); await wait(40);
  const reopened=q('.addin[data-k="'+zk+'"]');
  ok(!!reopened&&doc.activeElement===reopened,'the chained field holds focus');
  type(reopened,'half typed'); kbd(); await wait(220);
  ok(q('.addin[data-k="'+zk+'"]')===reopened,'a keyboard resize does not tear out the chained field');
  ok(reopened.value==='half typed','and what was typed into it survives');
  enter(reopened); await wait(40);
  ok(mustNow().join()==='first,half typed','the second task committed from the chained field');
  q('#main').click(); await wait(40);
  ok(!q('.addin'),'tapping outside still closes the chain');
}

console.log('— inline add: cancel and Escape —');
S().days={}; A.render(); await wait(30);
click('.zadd[data-k="'+zk+'"]'); await wait(30);
type(q('.addin'),'scratch that');
click('[data-action="add-cancel"]'); await wait(40);
ok(!q('.addin'),'the cancel control closes the field');
ok(mustNow().length===0,'cancel discards without adding');

click('.zadd[data-k="'+zk+'"]'); await wait(30);
type(q('.addin'),'never mind');
q('.addin').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true})); await wait(40);
ok(!q('.addin'),'Escape still closes the field');
ok(mustNow().length===0,'and Escape still commits nothing');

/* the Add button is unchanged: a tap on it commits and closes, because the finger is
   already on the button and the next tap can reopen the row */
click('.zadd[data-k="'+zk+'"]'); await wait(30);
type(q('.addin'),'by button');
click('[data-action="add-commit"]'); await wait(40);
ok(!q('.addin'),'the Add button still commits and closes');
ok(mustNow().join()==='by button','and the task is added');

/* the quick-add box at the top was left alone: it never closes, so there is nothing
   to reopen. It empties in place and keeps focus, which already gives the same
   type-several-in-a-row run. */
{
  S().days={}; A.render(); await wait(30);
  const qi=q('#qi');
  q('#qd').value='day:'+T()+':must';
  qi.focus(); qi.value='one from the top';
  qi.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true})); await wait(40);
  ok(q('#qi')===qi,'quick add: the box is never torn out');
  ok(qi.value==='','quick add: Enter empties it in place');
  ok(doc.activeElement===qi,'quick add: and focus stays, so the next line can be typed straight away');
  qi.value='two from the top';
  qi.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true})); await wait(40);
  ok(mustNow().join()==='one from the top,two from the top',
    'quick add: two in a row without touching the mouse');
  q('#toast').innerHTML='';
}

console.log('— menu reach on phones —');
{
  const foot=q('.railfoot'), labels=[...foot.children].map(b=>b.textContent);
  ok(labels.map(t=>t.replace(/ · \d+$/,'')).join(',')==='Help,Sync,Export,Import,Bin,Theme',
    'Help, Sync, Export, Import, Bin and Theme all live in the rail foot');
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

console.log('— Today only: the board narrows to one column —');
{
  /* A MODE OF THE BOARD, not a place on it, and a per-device view preference: it must
     never sync, never enter stateSig, and never be a second mechanism for the single
     column a phone already has. It also sits on the two-field board position: turning
     it on goes through showDay so boardOffset and stripDay stay in step, exactly as
     Prev and Next had to be fixed to do. */
  const nav=()=>q('[data-action="todayonly"]');
  const cols=()=>qa('#board .col');
  const day1=()=>{ const c=q('#board .col'); return c?c.dataset.day:null };
  S().settings.todayOnly=false; A.save(); A.render(); await wait(30);
  click('[data-action="nav-today"]'); await wait(30);

  ok(!!nav(),'the switch is drawn in the board nav row at a wide width');
  ok(nav().className==='nbtn','styled as a board nav button like Prev, Today and Next');
  ok(nav().textContent.trim()==='Today only','it names the mode it offers');
  ok(nav().getAttribute('aria-pressed')==='false','and says it is not engaged');
  ok(!!nav().title,'a title says what a press would do');
  ok(cols().length===7,'the board starts as the seven day window');

  /* scrolled to another week, the mode must still land on TODAY */
  click('[data-action="nav"][data-d="7"]'); await wait(40);
  ok(day1()===plus(7),'scrolled a week on, the board is showing another date');
  const sigBefore=A.stateSig(S());
  nav().click(); await wait(50);

  ok(S().settings.todayOnly===true,'pressing it turns the mode on');
  ok(cols().length===1,'the board draws one column');
  ok(day1()===T(),'and it is TODAY, not the date that was on screen');
  ok(S().settings.boardOffset===0,'the seven column offset was moved back with it');
  ok(S().settings.stripDay===T(),'and so was the single column day, the two stay in step');
  ok(nav().getAttribute('aria-pressed')==='true','aria-pressed marks the mode as engaged');
  ok(nav().textContent.trim()==='Today only',
    'the label does not flip, so it can never contradict aria-pressed');
  ok(nav().classList.contains('solid'),'the engaged state also carries the filled treatment');
  ok(q('#board').classList.contains('oneday'),'the board carries the class that gives the column the width');
  ok(A.stateSig(S())===sigBefore,'the mode changes no signature, so sync has nothing to push');

  /* the decision on Prev/Next: they STEP ONE DAY and the mode stays on */
  ok(!!q('[data-action="nav"][data-d="1"]')&&!!q('[data-action="nav"][data-d="-1"]'),
    'Prev and Next step a single day while the mode is on');
  ok(!q('[data-action="nav"][data-d="7"]')&&!q('[data-action="nav"][data-d="-7"]'),
    'and no longer offer the week step');
  click('[data-action="nav"][data-d="1"]'); await wait(40);
  ok(day1()===plus(1),'Next moves the shown day on by one');
  ok(S().settings.boardOffset===1&&S().settings.stripDay===plus(1),
    'through shiftBoard, so both halves of the board position move together');
  ok(S().settings.todayOnly===true,'navigating never turns the mode off');
  click('[data-action="nav"][data-d="-1"]'); await wait(40);
  ok(day1()===T(),'Prev steps back a single day too');

  { /* the off-board summary is a second column, so it is not drawn either */
    S().days[plus(30)]={must:[{id:'far1',title:'far away',done:false,subtasks:[],up:1}],should:[],extra:[]};
    A.save(); A.render(); await wait(30);
    ok(cols().length===1,'a task dated outside the window does not add a second column');
    ok(!q('[data-action="goto-day"]'),'so the off-board go-to control is not built in this mode');
    ok(/off-board/.test(q('#boardnav').textContent),'the nav row still reports that something is out there');
    S().settings.todayOnly=false; A.save(); A.render(); await wait(30);
    ok(cols().length===8,'and the seven day window brings the off-board column back');
    ok(!!q('[data-action="goto-day"]'),'with its way to reach the date');
    delete S().days[plus(30)];
    nav().click(); await wait(50);
  }

  { /* per device, like the panel collapses: remembered here, pushed nowhere */
    A.save(); await wait(10);
    const saved=JSON.parse(w.localStorage.getItem('agora_dayplanner_v1'));
    ok(saved.settings.todayOnly===true,'the choice is written to this device');
    ok(/'weekOpen','todayOnly'/.test(html),
      'and it rides VIEWSET beside weekOpen, so a Pull never imports another screen mode');
  }
  { /* survives a reload */
    const seed=w.localStorage.getItem('agora_dayplanner_v1');
    const dom5=new JSDOM(html,{runScripts:'dangerously',url:'http://localhost/',pretendToBeVisual:true,
      beforeParse(win){ try{win.localStorage.setItem('agora_dayplanner_v1',seed)}catch(e){} }});
    await wait(300);
    const w5=dom5.window;
    ok(w5.A.state.settings.todayOnly===true,'a fresh boot remembers the mode');
    ok(w5.document.querySelectorAll('#board .col').length===1,'and comes back on one column');
    ok(w5.document.querySelector('[data-action="todayonly"]').getAttribute('aria-pressed')==='true',
      'with the switch showing it engaged');
    w5.close();

    /* the same stored planner on a narrow screen: the control is not drawn and the
       flag changes nothing, because the board there is a single day strip already */
    const dom6=new JSDOM(html,{runScripts:'dangerously',url:'http://localhost/',pretendToBeVisual:true,
      beforeParse(win){
        Object.defineProperty(win,'innerWidth',{value:390,writable:true,configurable:true});
        Object.defineProperty(win,'innerHeight',{value:844,writable:true,configurable:true});
        try{win.localStorage.setItem('agora_dayplanner_v1',seed)}catch(e){}
      }});
    await wait(300);
    const w6=dom6.window, d6=w6.document;
    ok(!d6.querySelector('[data-action="todayonly"]'),'at 390px the switch is not drawn at all');
    ok(d6.querySelectorAll('#board .col').length===1,'the narrow board is its own single day strip');
    ok(!d6.querySelector('#board').classList.contains('oneday'),
      'and it takes no class from the mode, so there is one mechanism, not two');
    ok(!!d6.querySelector('[data-action="nav"][data-d="7"]'),
      'Prev and Next keep the week step there, since the mode cannot be on');
    ok(d6.querySelectorAll('#strip button').length>0,'the day strip is still the way to move a day');
    w6.close();

    /* and at 820px, the other narrow profile */
    const dom7=new JSDOM(html,{runScripts:'dangerously',url:'http://localhost/',pretendToBeVisual:true,
      beforeParse(win){
        Object.defineProperty(win,'innerWidth',{value:820,writable:true,configurable:true});
        Object.defineProperty(win,'innerHeight',{value:1180,writable:true,configurable:true});
        try{win.localStorage.setItem('agora_dayplanner_v1',seed)}catch(e){}
      }});
    await wait(300);
    ok(!dom7.window.document.querySelector('[data-action="todayonly"]'),
      'nor at 820px, the other side of the same boundary');
    dom7.window.close();
  }

  /* flush first, so the far-dated task this block added and removed has finished
     stamping its tombstone and the comparison below is about the mode alone */
  A.save(); await wait(20);
  const sigOn=A.stateSig(S());
  nav().click(); await wait(50);
  ok(S().settings.todayOnly===false,'pressing it again turns the mode off');
  ok(cols().length===7,'the seven day window is back');
  ok(day1()===T(),'opening on the day that was being looked at');
  ok(!q('#board').classList.contains('oneday'),'and the board drops the one column class');
  ok(nav().getAttribute('aria-pressed')==='false','the switch says so too');
  ok(A.stateSig(S())===sigOn,'turning it off pushes nothing either');

  { /* THE DAY TURNING WITH THE MODE ON. The single column branch returns the absolute
       stripDay and nothing rewrote it when the date turned, so a window left open
       overnight went on drawing YESTERDAY: past treatment, no TODAY badge, and the
       mode's own name contradicted on screen. */
    const snapD=JSON.parse(JSON.stringify(S().days)), snapC=JSON.parse(JSON.stringify(S().carry));
    const snapW=JSON.parse(JSON.stringify(S().week)), lastWeekWas=S().settings.lastWeek;
    S().days={}; S().carry=[];
    S().settings.todayOnly=true; A.save(); A.render(); await wait(25);
    S().settings.stripDay=plus(-1); S().settings.boardOffset=-1; S().settings.lastRoll=plus(-1);
    A.render(); await wait(25);
    ok(day1()===plus(-1)&&q('#board .col').classList.contains('past'),
      'parked on yesterday at .past, which is exactly what the open window showed once the date turned');
    ok(!q('#board .badge'),'with no TODAY badge, so the mode was naming a day that is not today');
    A.rollIfNewDay({quiet:true}); await wait(40);
    ok(S().settings.stripDay===T()&&S().settings.boardOffset===0,
      'the turn re-centres the mode on the new today, both halves of the position together');
    ok(day1()===T()&&!!q('#board .badge'),'so the one column is today again, badge and all');
    ok(cols().length===1&&S().settings.todayOnly===true,'still one column, and still the mode');
    /* PARKED ON A STEPPED-TO DAY: the mode's name is the contract, so it snaps anyway */
    S().settings.stripDay=plus(2); S().settings.boardOffset=2; S().settings.lastRoll=plus(-1);
    A.render(); await wait(25);
    ok(day1()===plus(2),'stepped two days on inside the mode');
    A.rollIfNewDay({quiet:true}); await wait(40);
    ok(day1()===T()&&S().settings.boardOffset===0&&S().settings.stripDay===T(),
      'and the turn snaps that to today too: "Today only" showing Thursday is the same broken promise');
    S().days=snapD; S().carry=snapC; S().week=snapW;
    S().settings.lastWeek=lastWeekWas; S().settings.lastRoll=T();
    S().settings.todayOnly=false; A.save(); A.render(); await wait(25);
  }

  { /* LEAVING THE MODE LANDS A COHERENT WEEK. The measured desync: Prev and Next step
       a single day inside the mode, so one press of Next leaves boardOffset at 1, and
       the old exit snapped nothing at all, which meant the seven day window opened on
       TOMORROW with today off the left edge. The only week worth coming back to is the
       one holding today, with today visible: boardOffset 0, through showDay. */
    click('[data-action="nav-today"]'); await wait(30);
    nav().click(); await wait(40);
    ok(S().settings.todayOnly===true&&day1()===T(),'into the mode, on today');
    click('[data-action="nav"][data-d="1"]'); await wait(40);
    ok(day1()===plus(1)&&S().settings.boardOffset===1&&S().settings.stripDay===plus(1),
      'stepped one day on, the two halves still in step');
    nav().click(); await wait(40);
    ok(cols().length>=7,'leaving the mode brings the seven day window back');
    ok(day1()===T(),'opening on the week that HOLDS TODAY, not on tomorrow');
    ok(S().settings.boardOffset===0&&S().settings.stripDay===T(),
      'with boardOffset and stripDay in step, both naming today');
    ok(!!q('#board .col .badge'),'so today is on screen, which is what makes the week a coherent one');
    /* and the pair is in step at every step of the round trip */
    const dayDiffT=d=>Math.round((new Date(d+'T12:00:00')-new Date(T()+'T12:00:00'))/864e5);
    const step=()=>S().settings.boardOffset===dayDiffT(S().settings.stripDay);
    ok(step(),'enter, step, midnight and exit all leave the pair consistent');
  }

  { /* the shape of the code, not just its behaviour */
    const css=q('style').textContent;
    ok(/@media \(min-width:901px\)\{\s*#board\.oneday \.col\{[^}]*flex:1 1 auto/.test(css),
      'the full width rule is fenced into the wide layout, where the mode can exist');
    ok(!/#board\.oneday/.test(css.split('@media (max-width:900px)')[1]||''),
      'and nothing about it is declared inside the narrow block');
    ok(/case 'todayonly':\{[^{}]*save\(\);\s*render\(\);\s*return;/.test(html),
      'the click case saves, renders and RETURNS, rather than breaking into the shared tail');
    ok(!/case 'todayonly':\{[^{}]*break;/.test(html),'so it never does both');
    ok(/s\.todayOnly=!s\.todayOnly;\s*showDay\(today\(\)\);/.test(html),
      'and BOTH directions reach today through showDay, never by writing boardOffset or stripDay');
    ok(!/boardOffset|stripDay/.test((html.match(/case 'todayonly':\{[\s\S]*?\}/)||[''])[0]),
      'so neither half of the board position is ever written by hand from the switch');
    ok(/if\(dayDue&&todayOnlyOn\(\)\) showDay\(today\(\)\)/.test(html),
      'and the midnight re-centre is the same one call, in rollIfNewDay, guarded on the mode');
  }
  S().settings.todayOnly=false; click('[data-action="nav-today"]'); await wait(30);
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
{ /* tab order is positional, the same axis task order rides */
  const now=Date.now();
  const mkf=(id,name,up,pos)=>({id,name,tasks:[],up,dn:up,pos:pos||up});
  { /* one device reorders, the other renames: both land */
    const a=dev(); a.floats=[mkf('f2','Ideas',100,now),mkf('f1','Inbox',100,now)];
    const b=dev(); b.floats=[mkf('f1','Inbox, renamed',now+50,100),mkf('f2','Ideas',100,100)];
    const m=A.mergeStates(a,b), m2=A.mergeStates(b,a);
    ok(m.floats.map(f=>f.name).join()==='Ideas,Inbox, renamed',
      'a tab reorder and a tab rename made apart both survive');
    ok(A.stateSig(m)===A.stateSig(m2),'and both devices agree');
  }
  { /* two reorders: the later one holds, deterministically */
    const a=dev(); a.floats=[mkf('f2','Ideas',100,now+2000),mkf('f1','Inbox',100,now+2000)];
    const b=dev(); b.floats=[mkf('f1','Inbox',100,now+1000),mkf('f2','Ideas',100,now+1000)];
    const m=A.mergeStates(a,b);
    ok(m.floats.map(f=>f.id).join()==='f2,f1','the later reorder is the one that holds');
    ok(A.stateSig(m)===A.stateSig(A.mergeStates(b,a)),'from either direction');
  }
  { /* a reorder cannot resurrect a tab deleted elsewhere */
    const a=dev(); a.tomb={f2:now}; a.floats=[mkf('f1','Inbox',100,100)];
    const b=dev(); b.floats=[mkf('f2','Ideas',100,now+5000),mkf('f1','Inbox',100,now+5000)];
    ok(!A.mergeStates(a,b).floats.some(f=>f.id==='f2'),
      'moving a tab somebody deleted does not bring it back');
  }
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

console.log('— merge: a done task can never be left in the carry tray —');
{
  /* BUG 1, root cause A. Nothing on one device can put a ticked task in the tray:
     rollover keeps done tasks on their day and the tray has no tick. The merge made
     one, because `done` rides dn and `loc` rides pos and the two are resolved apart,
     so a tick made on the tablet composed with a roll made on the laptop into a
     finished task sitting in the tray with three triage buttons and no way to undo it.
     pickNewer repairs it, which is the last layer holding BOTH sides. */
  const ydayD=plus(-1), mid=new Date(T()+'T00:00:00').getTime();
  const onDay=(s,t,d,z)=>{ (s.days[d]=s.days[d]||{must:[],should:[],extra:[]})[z||'must'].push(t); return s };
  const carryIds=s=>arrOf(s.carry).map(t=>t.id).sort();
  const arrOf=x=>Array.isArray(x)?x:[];

  { /* R4b, the reported shape: the tablet ticked yesterday's task at 08:00 while the
       laptop, waking at midnight, had already rolled it into the tray. */
    const ticked=onDay(dev(),tk('r1','walk the dog',100,{done:true,dn:mid+8*36e5,pos:100}),ydayD);
    const rolled=dev();
    rolled.carry=[tk('r1','walk the dog',100,{dn:100,pos:mid,from:'Prio 0 · Mon'})];
    const m=A.mergeStates(ticked,rolled), m2=A.mergeStates(rolled,ticked);
    ok(carryIds(m).length===0,'a tick made after another device rolled it does not land in the tray');
    ok((m.days[ydayD].must||[]).some(t=>t.id==='r1'&&t.done),
      'it stays on the day it was finished, ticked, which is where rollover would have left it');
    ok(byId(m,'r1').pos===mid&&byId(m,'r1').dn===mid+8*36e5,
      'and no stamp moves: repairing is not an edit, so it cannot out-rank the next real move');
    ok(A.stateSig(m)===A.stateSig(m2),'both devices reach that same answer');
    ok(A.stateSig(A.mergeStates(m,m2))===A.stateSig(m),'and a second round changes nothing: it converges');
  }
  { /* the tick was made in a float tab rather than on a day: same rule, that home */
    const inTab=dev(); inTab.floats[0].tasks=[tk('r3','sort the receipts',100,{done:true,dn:mid+36e5,pos:100})];
    const rolled=dev(); rolled.carry=[tk('r3','sort the receipts',100,{dn:100,pos:mid})];
    const m=A.mergeStates(inTab,rolled);
    ok(carryIds(m).length===0&&m.floats[0].tasks.some(t=>t.id==='r3'&&t.done),
      'a tick made in a float tab restores the tab, not a day: any real home will do');
  }
  { /* the repair reaches only what is actually done */
    const open=dev(); open.carry=[tk('r4','still open',100,{dn:100,pos:mid,from:'Prio 0 · Mon'})];
    const m=A.mergeStates(dev(),open);
    ok(carryIds(m).join()==='r4','an unfinished carried task is left exactly where it is');
    ok(byId(m,'r4').from==='Prio 0 · Mon','with the label saying where it came from');
  }
  { /* AN ALREADY CONVERGED BLOB: both sides say carry, so the day is long gone. It is
       filed to the day its dn stamp falls on, the day it was finished. This is also
       the one-sided path, a corrupt copy arriving from a device that had converged on
       it before the rule existed. */
    const fin=mid+9*36e5;                       /* ticked at 09:00 today */
    const bad=dev(); bad.carry=[tk('r5','pay the bill',100,{done:true,dn:fin,pos:mid})];
    const m=A.mergeStates(dev(),bad);
    ok(carryIds(m).length===0,'a corrupted planner is repaired as it arrives, not carried on');
    ok((m.days[T()].must||[]).some(t=>t.id==='r5'&&t.done),
      'the finished task is filed to the day its dn stamp names, in Prio 0');
    const both=A.mergeStates(bad,clone(bad));
    ok(carryIds(both).length===0&&(both.days[T()].must||[]).some(t=>t.id==='r5'),
      'and the same when both sides hold the corruption, which is how it converged');
    ok(A.stateSig(m)===A.stateSig(A.mergeStates(bad,dev())),'the repair is the same from either side');
    ok(A.stateSig(A.mergeStates(m,bad))===A.stateSig(m),
      'a repaired planner merged against the stale corrupt one stays repaired');
  }
  { /* a planner written before per item stamps has no dn to date the repair by */
    const old=dev(); old.carry=[{id:'r6',title:'from the old format',done:true,subtasks:[]}];
    const m=A.mergeStates(dev(),A.stampLegacy(old));
    ok(carryIds(m).length===0&&(m.days[T()].must||[]).some(t=>t.id==='r6'),
      'a legacy stamp is a sentinel and not a moment, so that one lands on today, not in 1970');
  }
  { /* the invariant holds through the door the app actually uses */
    const ticked=onDay(dev(),tk('r7','file the form',100,{done:true,dn:mid+7*36e5,pos:100}),ydayD);
    const rolled=dev(); rolled.carry=[tk('r7','file the form',100,{dn:100,pos:mid})];
    const p=A.readCloud(JSON.parse(JSON.stringify(rolled)));
    const m=A.mergeStates(ticked,p);
    ok(arrOf(m.carry).length===0,'and it holds for a copy that came off the wire through readCloud');
  }
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
  ok(/Carry-over/.test(ld.querySelector('#tray').textContent),
    'coming back to the app after midnight fills the tray without a reload');
  ok(items()===0&&LS().settings.trayOpen===false,
    'and the arrival is the collapsed bar: a new carry never takes the top of the board');
  ok(ld.querySelector('#tray .traycnt').textContent==='1 waiting',
    'the bar counts the one item waiting');
  ld.querySelector('[data-action="tray-toggle"]').click(); await wait(40);
  ok(items()===1,'opening the bar reveals the carried item');
  ok(LS().carry.length===1&&LS().carry[0].id==='nite1','the unfinished task is the one carried');
  ok(LS().settings.lastRoll===T(),'the day is marked as carried over');
  ok((LS().days[plus(-1)].must||[]).some(t=>t.id==='nite2'),'the finished one stays on its day as history');

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
  ok(LS().settings.trayOpen===false,
    'a manual pull is a fresh arrival too, so it re-collapses an open tray');
  /* put the tray back to one item for the checks that follow, and open it */
  const late=LS().carry.findIndex(t=>t.id==='late1');
  LS().carry.splice(late,1); delete LS().days[plus(-2)];
  lw.A.save(); lw.A.render(); await wait(25);
  ld.querySelector('[data-action="tray-toggle"]').click(); await wait(40);

  const labels=[...ld.querySelectorAll('.trayitem .tbtn')].map(b=>b.textContent.trim());
  ok(labels.length===3,'each carried task offers three triage buttons');
  ok(labels.every(Boolean),'none of the triage buttons is blank');
  ok(labels[0]==='Today'&&labels[1]==='Free Floating','they name where the task would go');
  const bulk=[...ld.querySelectorAll('[data-action="carry-all"]')].map(b=>b.textContent.trim());
  ok(bulk.join()==='All → Today,All → Free Floating','both bulk actions are offered');
  lw.close();
}

console.log('— two windows on one device: a storage write merges, never overwrites —');
{
  /* BUG 1, ROOT CAUSE B. localStorage is shared by every tab on the origin, and each
     window held its own copy of the tree and wrote the whole thing back on its next
     commit. Two windows open on one machine were a silent last-writer-wins, and with
     the tick and the roll landing in different windows it was the second way a done
     task reached the carry tray. The listener merges the incoming write into memory
     through the same adopt path syncCycle uses. The writing tab receives no event of
     its own, which is what stops this looping. */
  const live=new JSDOM(html,{runScripts:'dangerously',url:'http://localhost/',pretendToBeVisual:true});
  const lw=live.window, ld=lw.document;
  await wait(300);
  const LS=()=>lw.A.state, LQ=s=>ld.querySelector(s);
  const LKEY='agora_dayplanner_v1';
  const stored=()=>JSON.parse(lw.localStorage.getItem(LKEY));
  /* the other window commits: this one hears about it, exactly as the browser tells it */
  const otherWindowWrites=v=>{
    lw.dispatchEvent(new lw.StorageEvent('storage',
      {key:LKEY,oldValue:null,newValue:JSON.stringify(v),url:'http://localhost/'}));
  };
  const mkt=(id,title,x)=>Object.assign({id,title,done:false,subtasks:[],up:1000,dn:1000,pos:1000},x||{});

  LS().days={}; LS().carry=[]; LS().notes=[]; LS().settings.lastRoll=T();
  lw.A.save(); await wait(20);

  { /* IT MERGES, IT DOES NOT OVERWRITE */
    const stale=stored();                       /* what the second window loaded, before this */
    LS().days[T()]={must:[mkt('w1','typed in this window',{up:Date.now()})],should:[],extra:[]};
    lw.A.save(); await wait(20);
    stale.days[T()]={must:[mkt('w2','typed in the other window',{up:Date.now()})],should:[],extra:[]};
    stale.settings.view='calendar'; stale.settings.trayOpen=true; stale.settings.stripDay=plus(4);
    otherWindowWrites(stale); await wait(40);
    const ids=(LS().days[T()].must||[]).map(t=>t.id).sort().join();
    ok(ids==='w1,w2','both windows keep their work: the incoming write is merged, not applied');
    ok(LS().settings.view==='board'&&LS().settings.stripDay!==plus(4),
      'and the other window view settings do not travel with it');
    ok(!!LQ('.col[data-day="'+T()+'"]'),'the board is drawn from the merged tree, normally');
    ok(stored().days[T()].must.length===2,
      'the merged result is written back, so the next window to load gets both');
  }
  { /* AND IT CANNOT LOOP: the same bytes again change nothing, so nothing is adopted */
    const same=stored();
    const colWas=LQ('#board .col'), rawWas=lw.localStorage.getItem(LKEY);
    otherWindowWrites(same); await wait(40);
    ok(LQ('#board .col')===colWas,'a write this window already holds triggers no render at all');
    ok(lw.localStorage.getItem(LKEY)===rawWas,'and no write back, so two windows cannot ping-pong');
  }
  { /* THE REPORTED REPRO. Window A ticks yesterday task; window B, opened before the
       date turned, rolls it into the tray and commits. Both root causes in one gesture. */
    LS().days={}; LS().carry=[]; lw.A.save(); await wait(20);
    const mid=new Date(T()+'T00:00:00').getTime();
    LS().days[plus(-1)]={must:[mkt('tw1','walk the dog',{done:true,up:100,dn:mid+8*36e5,pos:100})],
      should:[],extra:[]};
    lw.A.save(); await wait(20);
    const rolled=stored();
    rolled.days[plus(-1)]={must:[],should:[],extra:[]};
    rolled.carry=[mkt('tw1','walk the dog',{up:100,dn:100,pos:mid,from:'Prio 0 · Mon'})];
    otherWindowWrites(rolled); await wait(40);
    ok(LS().carry.length===0,'the tick here and the roll there do not compose into a tray item');
    ok((LS().days[plus(-1)].must||[]).some(t=>t.id==='tw1'&&t.done),
      'the finished task stays finished, on the day it was finished');
    ok(LQ('#tray').innerHTML==='','and with nothing waiting the tray slot draws nothing at all');
  }
  { /* A CARRY ARRIVING THIS WAY DRAWS AS THE BAR, like any other fresh arrival */
    LS().settings.trayOpen=false;
    const s=stored();
    s.carry=[mkt('tw2','left from Monday',{pos:Date.now(),from:'Prio 0 · Mon'})];
    otherWindowWrites(s); await wait(40);
    ok(LS().carry.length===1&&!!LQ('#tray .tray.closed'),
      'a carry that arrives from the other window is the collapsed bar, not the open list');
    ok(LQ('#tray .traycnt').textContent==='1 waiting','counting what waits');
    LS().carry=[]; lw.A.save(); lw.A.render(); await wait(20);
  }
  const ed=()=>LQ('#noteBody');
  { /* THE UNSTAMPED WINDOW, exactly as syncCycle has it. A note body only takes its
       stamp at commit, and the editor defers the commit for as long as typing runs, so
       without flushSave() first the merge weighs a body typed a second ago as though it
       were as old as the last commit, and the other window copy silently wins. */
    ld.querySelector('.navbtn[data-v="notes"]').click(); await wait(30);
    ld.querySelector('[data-action="note-new"]').click(); await wait(40);
    const typed=txt=>{ const e=ed();
      if(!e.firstChild||e.firstChild.nodeName!=='DIV') e.innerHTML='<div></div>';
      const l=e.firstChild;
      if(!l.firstChild||l.firstChild.nodeType!==3){
        while(l.firstChild) l.removeChild(l.firstChild);
        l.appendChild(ld.createTextNode('')); }
      l.firstChild.data+=txt;
      e.dispatchEvent(new lw.Event('input',{bubbles:true})) };
    typed('draft'); lw.A.save(); await wait(20);
    const nid=LS().notes[0].id, dn0=LS().notes[0].dn;
    typed('x');                                   /* and now type on, never pausing */
    ok(LS().notes[0].body.indexOf('draftx')>-1&&LS().notes[0].dn===dn0,
      'the keystroke is in state at once, but its stamp is still waiting for the commit');
    const theirs=stored();
    theirs.notes=[Object.assign({},theirs.notes.find(n=>n.id===nid),
      {body:'written in the other window',dn:dn0+1})];
    otherWindowWrites(theirs); await wait(40);
    ok(LS().notes[0].body.indexOf('draftx')>-1,
      'the merge saw this window keystroke stamped, so the typing is not merged away');
    ok(ed().textContent.indexOf('draftx')>-1,'and the screen agrees with it');
  }
  { /* A FOREIGN RENDER, so the Notes rules apply: focus and caret both survive it */
    const bo=ed(); bo.focus();
    const tn=bo.firstChild.firstChild;
    { const r=ld.createRange(); r.setStart(tn,2); r.setEnd(tn,4);
      const sl=lw.getSelection(); sl.removeAllRanges(); sl.addRange(r); }
    const s=stored();
    s.days[T()]={must:[mkt('w9','from the other window',{up:Date.now()})],should:[],extra:[]};
    otherWindowWrites(s); await wait(40);
    ok(LS().days[T()].must.some(t=>t.id==='w9'),'the write really did arrive and re-render');
    ok(ld.activeElement===LQ('#noteBody'),'yet focus stays in the note body');
    { const r=lw.getSelection().getRangeAt(0);
      ok(r.startOffset===2&&r.endOffset===4&&LQ('#noteBody').contains(r.startContainer),
        'with the selection exactly where the typist left it'); }
  }
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

  /* dismissed from the carry-over tray; the tray arrives collapsed, so open it first */
  S().carry.push({id:'bcar',title:'dropped from the tray',done:false,subtasks:[],from:'Prio 0 · Fri'});
  S().settings.trayOpen=false;
  A.save(); A.render(); await wait(25);
  click('[data-action="tray-toggle"]'); await wait(25);
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

console.log('— custom pickers (desktop pointer) —');
{
  A.ui.pointerFine=true;   /* jsdom has no hover:hover, so force the desktop gate */
  const md=el=>el.dispatchEvent(new w.MouseEvent('mousedown',{bubbles:true,cancelable:true}));
  const kd=(el,key)=>el.dispatchEvent(new w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
  const popEl=()=>q('#popRoot .popover');
  S().settings.view='board'; S().settings.floatMode=false;
  S().settings.boardOffset=0; S().settings.stripDay=T(); S().settings.calSel=null;
  A.render(); await wait(20);

  /* destination list over #qd */
  const qd=q('#qd');
  md(qd); await wait(10);
  ok(!!popEl(),'a pointer press on the destination select opens the custom list');
  ok(qa('#popRoot .pgl').map(x=>x.textContent).join()==='Free Floating,Today,Tomorrow',
    'the three groups keep their names and order');
  ok(qa('#popRoot .popt').length===[...qd.options].length,
    'every option of the select is in the list');
  ok(qa('#popRoot .popt')[0].textContent===S().floats[0].name,
    'float tab names come through as written');
  ok(qa('#popRoot .popt').map(b=>b.dataset.pval).join()===[...qd.options].map(o=>o.value).join(),
    'the list carries the exact option values');
  ok(!!q('#popRoot .popt.on')&&q('#popRoot .popt.on').dataset.pval===qd.value,
    'the current destination is the one marked selected');
  const wantVal='day:'+plus(1)+':should';
  q('#popRoot .popt[data-pval="'+wantVal+'"]').click(); await wait(10);
  ok(!popEl(),'choosing closes the list');
  ok(qd.value===wantVal,'the underlying select now holds the chosen destination');

  /* keyboard on the select */
  qd.focus();
  kd(qd,'ArrowDown'); await wait(10);
  ok(!!popEl(),'ArrowDown on the focused select opens the list');
  const actIdx=()=>qa('#popRoot .popt').findIndex(b=>b.classList.contains('act'));
  const startIdx=actIdx();
  ok(startIdx===[...qd.options].findIndex(o=>o.value===qd.value),
    'the cursor starts on the current value');
  kd(qd,'ArrowDown');
  ok(actIdx()===startIdx+1,'ArrowDown moves the cursor');
  kd(qd,'Enter'); await wait(10);
  ok(!popEl(),'Enter chooses and closes');
  ok(qd.value===[...qd.options][startIdx+1].value,'the select holds what the cursor was on');
  ok(doc.activeElement===qd,'focus is back on the select');

  const before=qd.value;
  kd(qd,'ArrowDown'); await wait(10);
  kd(qd,'ArrowUp'); kd(qd,'Escape'); await wait(10);
  ok(!popEl(),'Escape closes the list');
  ok(qd.value===before,'and the value is untouched');
  ok(doc.activeElement===qd,'focus returns to the trigger after Escape');

  md(qd); await wait(10);
  md(doc.body); await wait(10);
  ok(!popEl(),'a press outside the list closes it');

  /* date picker over Jump to */
  const jd=()=>q('#jumpDate');
  md(jd()); await wait(10);
  ok(!!popEl()&&!!q('#popRoot .pgrid'),'a pointer press on Jump to opens the custom month grid');
  ok(qa('#popRoot .pdow span').length===7,'weekday header has seven days');
  ok(q('#popRoot .phead b').textContent.indexOf(String(new Date(T()+'T12:00:00').getFullYear()))>-1,
    'the header names the anchored month');
  ok(!!q('#popRoot .pday.today')&&q('#popRoot .pday.today').dataset.pday===T(),
    'today is marked the way the calendar marks it');
  const head1=q('#popRoot .phead b').textContent;
  q('#popRoot [data-pnav="1"]').click(); await wait(10);
  ok(q('#popRoot .phead b').textContent!==head1,'next month changes the header');
  ok(!!popEl(),'and the picker stays open');
  const pick=qa('#popRoot .pday').find(b=>b.textContent==='15').dataset.pday;
  q('#popRoot .pday[data-pday="'+pick+'"]').click(); await wait(20);
  ok(!popEl(),'choosing a day closes the picker');
  ok(jd().value===pick,'the date input holds the chosen day');
  ok(S().settings.stripDay===pick,'and the board jumped there through the existing handler');

  /* keyboard on the date input. The suite's own plus() takes no start date, so shift
     from an arbitrary day locally */
  const shift=(d,n)=>{const x=new Date(d+'T12:00:00');x.setDate(x.getDate()+n);return x.toISOString().slice(0,10)};
  jd().focus();
  kd(jd(),'Enter'); await wait(10);
  ok(!!popEl(),'Enter on the focused date input opens the picker');
  kd(jd(),'ArrowRight');
  ok(q('#popRoot .pday.act').dataset.pday===shift(pick,1),'ArrowRight moves the cursor a day');
  kd(jd(),'ArrowDown');
  ok(q('#popRoot .pday.act').dataset.pday===shift(pick,8),'ArrowDown moves it a week');
  kd(jd(),'Enter'); await wait(20);
  ok(!popEl()&&jd().value===shift(pick,8),'Enter chooses the cursor day');
  ok(S().settings.stripDay===shift(pick,8),'the jump handler ran unchanged');
  ok(doc.activeElement===jd(),'focus lands back on the date input');
  const jval=jd().value;
  kd(jd(),'Enter'); await wait(10); kd(jd(),'ArrowLeft'); kd(jd(),'Escape'); await wait(10);
  ok(!popEl()&&jd().value===jval,'Escape cancels without touching the input');

  /* per-task date picker drives the very same pickdate change handler */
  S().settings.boardOffset=0; S().settings.stripDay=T(); A.render(); await wait(20);
  q('#qi').value='picker target'; q('#qd').value='day:'+T()+':must'; click('#qb'); await wait(30);
  const pt=S().days[T()].must.find(t=>t.title==='picker target');
  await select(pt.id);
  const pd=()=>q('[data-action="pickdate"][data-id="'+pt.id+'"]');
  md(pd()); await wait(10);
  ok(!!popEl(),'the per-task date control opens the same picker');
  /* the input carries data-action, so the click that follows a real mousedown used to
     fall through the delegated switch into save()+render(), rebuilding the board and
     closing the picker through the scroll reset. Found in headless Chrome, pinned here. */
  const node=pd(); node.__probe=1;
  node.click(); await wait(10);
  ok(!!popEl(),'the stray click that follows mousedown does not close the picker');
  ok(pd().__probe===1,'and does not rebuild the board under it');
  kd(pd(),'Escape'); await wait(10);
  ok(!popEl(),'Escape closes it');
  ok(!!q('.task.sel'),'without also deselecting the card behind it');
  md(pd()); await wait(10);
  const dest=plus(3);
  if(!q('#popRoot .pday[data-pday="'+dest+'"]')){ q('#popRoot [data-pnav="1"]').click(); await wait(10) }
  q('#popRoot .pday[data-pday="'+dest+'"]').click(); await wait(30);
  const f1=A.findTask(pt.id);
  ok(f1&&f1.from.kind==='day'&&f1.from.date===dest,'the task moved through the existing pickdate handler');
  ok(f1.from.zone==='must','and kept its zone');
  /* after a mouse pick the date input deliberately stays unfocused: focusing it would
     light Chrome's segment highlight, which is hard OS blue and closed to CSS.
     Keyboard flows refocus, asserted above on the jump input. */
  ok(!doc.activeElement||doc.activeElement.dataset.action!=='pickdate',
    'a mouse pick leaves the date input unfocused, keeping the OS segment highlight dark');
  md(pd()); await wait(10);
  q('#popRoot [data-pact="today"]').click(); await wait(30);
  ok(A.findTask(pt.id).from.date===T(),'the Today shortcut brings the task to today');
  md(pd()); await wait(10);
  q('#popRoot [data-pact="clear"]').click(); await wait(30);
  ok(!popEl(),'Clear closes the picker');
  ok(A.findTask(pt.id).from.date===T(),'and moves nothing, matching the native clear');

  /* no fine pointer: the native controls are left alone */
  A.ui.pointerFine=false;
  md(q('#qd')); await wait(10);
  ok(!popEl(),'with no fine pointer the destination select stays native');
  md(jd()); await wait(10);
  ok(!popEl(),'and so does the date input');
  A.ui.pointerFine=null;
}

console.log('— habits: a commitment band under the board —');
{
  S().settings.view='board'; S().settings.floatMode=false; S().settings.habitsOpen=true;
  A.render(); await wait(20);
  const wk=(()=>{const x=new Date(T()+'T12:00:00');x.setDate(x.getDate()-((x.getDay()+6)%7));
    x.setHours(12,0,0,0);return x.toISOString().slice(0,10)})();
  ok(!!q('#habitsRail .hcard'),'at desktop width the panel sits in the rail with zero clicks');
  ok(q('#habitsRail').previousElementSibling&&q('#habitsRail').previousElementSibling.id==='fpanel',
    'directly under True north');
  ok(q('#habits').innerHTML==='','and the board-bottom host stays empty there');
  /* no habits yet, so the panel is a header bar; the header opens it */
  ok(!q('#habitsRail .haddrow input'),'an empty Habits panel hides its add field behind the header');
  ok(/0 habits/.test(q('#habitsRail .kh').textContent),'while the header count says it is empty');
  click('#habitsRail .kh[data-action="habit-toggle"]'); await wait(30);
  ok(!!q('#habitsRail .haddrow input'),'opening the header reveals the add field');

  q('#habitAdd').value='push-ups'; click('[data-action="habit-add"]'); await wait(30);
  ok(S().habits.list.length===1&&S().habits.list[0].name==='push-ups','Add creates a habit');
  ok(S().habits.list[0].days.join()==='1,2,3,4,5,6','a new habit starts scheduled Mon to Sat');
  ok(!!doc.activeElement&&doc.activeElement.id==='habitAdd','focus stays in the add field for the next one');
  q('#habitAdd').value='stretching';
  q('#habitAdd').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
  await wait(30);
  ok(S().habits.list.length===2,'Enter adds too');
  const hp=S().habits.list[0], hs=S().habits.list[1];
  ok(qa('#habitsRail .hdow').map(x=>x.textContent).join()==='Mo,Tu,We,Th,Fr,Sa',
    'six weekday columns, Monday to Saturday, Sunday rests');

  /* alternating schedules, set without leaving the panel */
  click('[data-action="habit-days"][data-id="'+hs.id+'"]'); await wait(20);
  ok(qa('#habitsRail .hday').length===6,'Days opens six day toggles in place');
  for(const d of [1,3,5]){ click('[data-action="habit-day"][data-id="'+hs.id+'"][data-dow="'+d+'"]'); await wait(15) }
  click('[data-action="habit-days-done"][data-id="'+hs.id+'"]'); await wait(20);
  ok(S().habits.list[1].days.join()==='2,4,6','the schedule saved as Tue, Thu, Sat');
  ok(qa('[data-action="habit-tick"][data-id="'+hs.id+'"]').length===3,'only scheduled days are tickable');
  ok(qa('#habitsRail .hdash').length===3,'unscheduled days render a muted dash, never a blank box');
  ok(qa('[data-action="habit-tick"][data-id="'+hp.id+'"]').length===6,'the other habit keeps all six');

  /* ticks land in this week, keyed by its Monday. Commit first so the change tracker
     knows the rows; ticking an uncommitted row correctly cannot move its stamps. */
  A.save(); await wait(10);
  const dn0=S().habits.list[0].dn||S().habits.list[0].up;
  click('[data-action="habit-tick"][data-id="'+hp.id+'"][data-dow="1"]'); await wait(30);
  ok((S().habits.marks[wk][hp.id][1]||0)>0,'a tick lands under the current week');
  ok(q('[data-action="habit-tick"][data-id="'+hp.id+'"][data-dow="1"]').classList.contains('on'),'and paints as done');
  A.save(); await wait(20);
  ok((S().habits.list[0].dn||0)>dn0,'ticking moves the habit dn stamp, so a tick asserts it exists');
  click('[data-action="habit-tick"][data-id="'+hp.id+'"][data-dow="1"]'); await wait(30);
  ok((S().habits.marks[wk][hp.id][1]||0)<0,'unticking records the untick rather than deleting the cell');
  click('[data-action="habit-tick"][data-id="'+hp.id+'"][data-dow="1"]'); await wait(30);

  /* rename in place, same contenteditable idiom as everything else */
  q('.hname[data-id="'+hp.id+'"]').click(); await wait(20);
  const ed=q('.hname[data-id="'+hp.id+'"]');
  ed.textContent='morning push-ups'; fire(ed,'blur'); await wait(30);
  ok(S().habits.list[0].name==='morning push-ups','clicking the name renames in place');

  /* collapse remembers, per device: the header itself is the toggle now */
  click('[data-action="habit-toggle"]'); await wait(20);
  ok(S().settings.habitsOpen===false,'collapsing the header remembers, per device');
  ok(!q('#habitsRail .hrail')&&!q('#habitAdd'),'collapsed keeps only the header');
  ok(!!q('#habitsRail .kh .chev')&&!q('#habitsRail .kh .chev.open'),'with the chevron pointing right');
  ok(/2 habits/.test(q('#habitsRail .kh').textContent),'and the count still reading while collapsed');
  click('[data-action="habit-toggle"]'); await wait(20);
  ok(!!q('#habitsRail input#habitAdd'),'opening the header again reveals the panel');
  ok(!!q('#habitsRail .kh .chev.open'),'and the chevron points down');

  /* a separate band: no Prio weight, no counts, no metrics, no dots */
  const meta0=(q('.col.today .meta')||{textContent:''}).textContent;
  const stat0=JSON.stringify(A.tally([T()]))+'|'+A.streak();
  q('#habitAdd').value='temp habit'; click('[data-action="habit-add"]'); await wait(30);
  const th=S().habits.list.find(x=>x.name==='temp habit');
  const tdow=new Date(T()+'T12:00:00').getDay()||1;
  click('[data-action="habit-tick"][data-id="'+th.id+'"][data-dow="'+tdow+'"]'); await wait(30);
  ok(JSON.stringify(A.tally([T()]))+'|'+A.streak()===stat0,'habits touch neither the tally nor the streak');
  ok((q('.col.today .meta')||{textContent:''}).textContent===meta0,'nor the board day counts');
  S().settings.view='calendar'; A.render(); await wait(20);
  const cell0=(q('.cell[data-day="'+T()+'"]')||{innerHTML:''}).innerHTML;
  S().habits.marks[wk][th.id][tdow]=-Date.now(); A.render(); await wait(20);
  ok((q('.cell[data-day="'+T()+'"]')||{innerHTML:''}).innerHTML===cell0,'nor the calendar dots');
  S().settings.view='board'; A.render(); await wait(20);

  /* deletion goes to the bin behind the 5 second Undo, like everything else.
     Commit first: only a row the tracker has seen can leave a tomb and a body. */
  A.save(); await wait(10);
  click('[data-action="habit-del"][data-id="'+th.id+'"]'); await wait(30);
  ok(!S().habits.list.find(x=>x.id===th.id),'delete removes the row');
  ok(/Deleted/.test(q('#toast').textContent)&&!!q('#toast [data-action="undo"]'),'with the usual Undo toast');
  A.save(); await wait(20);
  ok(!!S().tomb[th.id],'a tombstone records it');
  ok(!!S().bin[th.id]&&S().bin[th.id].k==='habit'&&S().bin[th.id].body.name==='temp habit',
    'and the body waits in the bin');
  click('[data-action="undo"]'); await wait(30); A.save(); await wait(20);
  ok(!!S().habits.list.find(x=>x.id===th.id),'Undo puts it back');
  ok(!S().tomb[th.id]&&!S().bin[th.id],'and the revival clears the tomb and the bin entry');
  click('[data-action="habit-del"][data-id="'+th.id+'"]'); await wait(30); A.save(); await wait(20);
  A.restoreBin(th.id); await wait(30);
  ok(!!S().habits.list.find(x=>x.id===th.id),'Restore from the Bin brings a habit back');
  ok(/Habits panel/.test(q('#toast').textContent),'and says where it went');
  click('[data-action="habit-del"][data-id="'+th.id+'"]'); await wait(30); A.save(); await wait(20);
}

console.log('— habits: merge —');
const hdev=()=>{const s=dev(); s.habits={list:[],marks:{}}; s.bin={}; return s};
const mkh=(id,name,days,up,x)=>Object.assign(
  {id,name,days:days||[1,2,3,4,5,6],up:up||100,dn:up||100,pos:up||100},x||{});
const W='2026-08-10';
{ /* added on each side */
  const a=hdev(); a.habits.list.push(mkh('h1','push-ups',null,200));
  const b=hdev(); b.habits.list.push(mkh('h2','stretching',[2,4,6],210));
  const m=A.mergeStates(a,b);
  ok(m.habits.list.length===2,'a habit added on each device: both survive');
  ok(A.stateSig(m)===A.stateSig(A.mergeStates(b,a)),'and both devices agree');
}
{ /* the requirement in the brief: different-day ticks union */
  const base=hdev(); base.habits.list.push(mkh('h1','push-ups',null,200));
  const a=clone(base), b=clone(base);
  a.habits.marks={[W]:{h1:{1:500}}};
  b.habits.marks={[W]:{h1:{3:600}}};
  const m=A.mergeStates(a,b);
  ok(m.habits.marks[W].h1[1]===500&&m.habits.marks[W].h1[3]===600,
    'a Monday tick on one device and a Wednesday tick on another both survive');
  ok(A.stateSig(m)===A.stateSig(A.mergeStates(b,a)),'whichever device runs the merge');
  /* same cell: the later action wins, tick or untick */
  const c=clone(base); c.habits.marks={[W]:{h1:{1:-700}}};
  ok(A.mergeStates(a,c).habits.marks[W].h1[1]===-700,'a later untick beats an earlier tick');
  const d2=clone(base); d2.habits.marks={[W]:{h1:{1:900}}};
  ok(A.mergeStates(c,d2).habits.marks[W].h1[1]===900,'and a later tick beats an earlier untick');
}
{ /* the three axes compose: rename and schedule on content, ticks outside, order on pos */
  const base=hdev(); base.habits.list.push(mkh('h1','push-ups',null,200));
  const a=clone(base); a.habits.list[0].name='morning push-ups';
  a.habits.list[0].days=[1,3,5]; a.habits.list[0].up=900;
  const b=clone(base); b.habits.marks={[W]:{h1:{5:600}}}; b.habits.list[0].dn=600;
  const m=A.mergeStates(a,b);
  ok(m.habits.list[0].name==='morning push-ups'&&m.habits.list[0].days.join()==='1,3,5',
    'a rename and schedule change on one device survive');
  ok(m.habits.marks[W].h1[5]===600,'alongside a tick made on the other');
}
{ /* delete versus tick: ticking asserts the habit exists, like tasks */
  const base=hdev(); base.habits.list.push(mkh('h1','push-ups',null,200));
  const a=clone(base); a.habits.list=[]; a.tomb={h1:800};
  const b=clone(base); b.habits.marks={[W]:{h1:{5:900}}}; b.habits.list[0].dn=900;
  const m=A.mergeStates(a,b);
  ok(m.habits.list.length===1&&m.habits.marks[W].h1[5]===900,
    'a tick made after a delete elsewhere revives the habit with its tick');
  const a2=clone(base); a2.habits.list=[]; a2.tomb={h1:950};
  ok(A.mergeStates(a2,b).habits.list.length===0,'a delete after the last tick still wins');
}
{ /* a device that predates habits cannot drop them */
  const a=dev();                     /* no habits key at all */
  const b=hdev(); b.habits.list.push(mkh('h1','push-ups',null,200));
  b.habits.marks={[W]:{h1:{1:500}}};
  const m=A.mergeStates(a,b);
  ok(m.habits.list.length===1&&m.habits.marks[W].h1[1]===500,
    'merging with a pre-habits planner keeps the habits and their ticks');
}

console.log('— the pickdate click no longer tears down the board (B) —');
{
  A.ui.pointerFine=false;            /* the native path, as on a phone */
  S().settings.view='board'; S().settings.floatMode=true; A.render(); await wait(20);
  q('#qd').value='float:'+S().floats[0].id;
  q('#qi').value='float picker task'; click('#qb'); await wait(30);
  const ft=S().floats[0].tasks.find(t=>t.title==='float picker task');
  await select(ft.id);
  const pdI=()=>q('[data-action="pickdate"][data-id="'+ft.id+'"]');
  ok(!!pdI(),'the date field renders in the float tab action bar');
  const probe=pdI(); probe.__probe=1;
  probe.click(); await wait(20);
  ok(pdI()&&pdI().__probe===1,
    'its click no longer falls through the switch into a board rebuild');
  const fsel=q('select[data-action="tofloat"][data-id="'+ft.id+'"]'); fsel.__probe=1;
  fsel.click(); await wait(20);
  ok(q('select[data-action="tofloat"][data-id="'+ft.id+'"]').__probe===1,
    'the file to select keeps its long-standing immunity');
  pdI().value=T(); fire(pdI(),'change'); await wait(30);
  const moved=A.findTask(ft.id);
  ok(moved&&moved.from.kind==='day'&&moved.from.date===T(),
    'a date set on the native input still moves the task through the change handler');
  S().settings.floatMode=false; A.render(); await wait(20);
  A.ui.pointerFine=null;
}

console.log('— pinned: subtask work loses to a concurrent parent delete —');
{
  const a=dev(); a.tomb={t1:300,s1:300};
  const b=put(dev(),tk('t1','parent',200,{dn:200,pos:200,subtasks:[
    {id:'s1',title:'step',done:true,up:200,dn:400,pos:200},
    {id:'s2',title:'new step',done:false,up:400,dn:400,pos:400}]}));
  const m1=A.mergeStates(a,b), m2=A.mergeStates(b,a);
  const g=A.flatten(m1);
  ok(!Object.keys(g.task).length&&!Object.keys(g.sub).length,
    'the parent delete takes the steps with it, even one ticked after the delete');
  ok(!Object.keys(m1.bin||{}).length,'and nothing reaches the bin in the merged state');
  ok(A.stateSig(m1)===A.stateSig(m2),'both directions agree');
  const c=put(dev(),tk('t1','renamed parent',500,{dn:200,pos:200,subtasks:[
    {id:'s1',title:'step',done:false,up:200,dn:200,pos:200}]}));
  const g2=A.flatten(A.mergeStates(a,c));
  ok(!!g2.task.t1,'editing the parent itself does revive it');
  ok(!Object.keys(g2.sub).length,'but its old steps stay deleted');
}

console.log('— the weekly list: one flat band, no tiers —');
{
  S().settings.view='board'; S().settings.floatMode=false; A.render(); await wait(20);
  const wsh=(d,n)=>{const x=new Date(d+'T12:00:00');x.setDate(x.getDate()+n);return x.toISOString().slice(0,10)};
  const thisMon=(()=>{const x=new Date(T()+'T12:00:00');x.setDate(x.getDate()-((x.getDay()+6)%7));
    x.setHours(12,0,0,0);return x.toISOString().slice(0,10)})();

  ok(!!q('#weekRail .wcard'),'the list sits in the rail with zero clicks');
  ok(q('#weekRail').previousElementSibling&&q('#weekRail').previousElementSibling.id==='habitsRail',
    'directly under the habits section');
  ok(!q('#weekRail .zh')&&!q('#weekRail [data-zone]'),'no Prio tiers and no day columns in it');
  /* empty, so it is a header bar first */
  ok(!q('#weekAdd'),'an empty This week panel hides its add field behind the header');
  ok(/0 open/.test(q('#weekRail .kh').textContent),'while the header count reads 0 open');
  click('#weekRail .kh[data-action="week-toggle"]'); await wait(20);
  ok(!!q('#weekAdd'),'opening the header reveals the add field');

  const stat0=JSON.stringify(A.tally([T()]))+'|'+A.streak();
  const meta0=(q('.col.today .meta')||{textContent:''}).textContent;
  q('#weekAdd').value='book the dentist'; click('[data-action="week-add"]'); await wait(30);
  ok(S().week.list.length===1&&S().week.list[0].title==='book the dentist','Add creates an item');
  ok(!!doc.activeElement&&doc.activeElement.id==='weekAdd','and focus stays in the field');
  q('#weekAdd').value='clear the inbox';
  q('#weekAdd').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
  await wait(30);
  ok(S().week.list.length===2,'Enter adds too');
  A.save(); await wait(10);

  const wt=S().week.list[0];
  click('[data-action="week-tick"][data-id="'+wt.id+'"]'); await wait(30);
  ok(S().week.list[0].done===true,'tick completes');
  ok(q('[data-action="week-tick"][data-id="'+wt.id+'"]').classList.contains('on'),'with the usual box styling');
  ok(/1 open/.test(q('#weekRail .kh .sp').textContent),'the open count follows');

  q('[data-action="week-rename"][data-id="'+wt.id+'"]').click(); await wait(20);
  const wed=q('[data-action="week-rename"][data-id="'+wt.id+'"]');
  wed.textContent='book the dentist, morning'; fire(wed,'blur'); await wait(30);
  ok(S().week.list[0].title==='book the dentist, morning','rename in place works');

  ok(JSON.stringify(A.tally([T()]))+'|'+A.streak()===stat0,'weekly items touch neither tally nor streak');
  ok((q('.col.today .meta')||{textContent:''}).textContent===meta0,'nor the board day counts');

  /* delete: bin and the 5 second Undo, like everything else */
  const w2=S().week.list[1];
  click('[data-action="week-del"][data-id="'+w2.id+'"]'); await wait(30);
  ok(!S().week.list.find(x=>x.id===w2.id),'delete removes the item');
  ok(/Deleted/.test(q('#toast').textContent)&&!!q('#toast [data-action="undo"]'),'with the usual Undo toast');
  A.save(); await wait(10);
  ok(!!S().tomb[w2.id]&&!!S().bin[w2.id]&&S().bin[w2.id].k==='wtask','tomb and bin record it');
  click('[data-action="undo"]'); await wait(30); A.save(); await wait(10);
  ok(!!S().week.list.find(x=>x.id===w2.id),'Undo puts it back');
  click('[data-action="week-del"][data-id="'+w2.id+'"]'); await wait(30); A.save(); await wait(10);
  A.restoreBin(w2.id); await wait(30);
  ok(!!S().week.list.find(x=>x.id===w2.id),'Restore from the Bin brings it back');
  ok(/This week list/.test(q('#toast').textContent),'and says where it went');

  /* the Monday sweep: ticked graduate to history, unticked carry */
  const prevMon=wsh(thisMon,-7);
  S().settings.lastWeek=prevMon; S().settings.lastRoll=T();
  A.rollIfNewDay({quiet:true}); await wait(30);
  ok(!S().week.list.find(x=>x.id===wt.id),'the ticked item left the list at the week turn');
  ok(!!S().week.list.find(x=>x.id===w2.id),'the unticked one carried into the new week');
  ok((S().week.hist[prevMon]||[]).some(x=>x.id===wt.id),'the finished one waits in that week\'s history');
  ok(!S().bin[wt.id],'closing a week is not a deletion: no bin entry');
  ok(!!S().tomb[wt.id],'but a tombstone keeps stale copies from resurrecting it');
  ok(S().settings.lastWeek===thisMon,'and the sweep marks this week done');
  click('[data-action="week-del"][data-id="'+w2.id+'"]'); await wait(30); A.save(); await wait(10);
}

console.log('— the weekly list: merge —');
const wdev=()=>{const s=hdev(); s.week={list:[],hist:{}}; return s};
const mkw=(id,title,up,x)=>Object.assign({id,title,done:false,up:up||100,dn:up||100,pos:up||100},x||{});
{ /* added on each side */
  const a=wdev(); a.week.list.push(mkw('w1','from the PC',200));
  const b=wdev(); b.week.list.push(mkw('w2','from the tablet',210));
  const m=A.mergeStates(a,b);
  ok(m.week.list.length===2,'an item added on each device: both survive');
  ok(A.stateSig(m)===A.stateSig(A.mergeStates(b,a)),'and both devices agree');
}
{ /* rename and tick compose on their own axes */
  const base=wdev(); base.week.list.push(mkw('w1','draft it',200));
  const a=clone(base); a.week.list[0].title='draft it properly'; a.week.list[0].up=900;
  const b=clone(base); b.week.list[0].done=true; b.week.list[0].dn=600;
  const m=A.mergeStates(a,b);
  ok(m.week.list[0].title==='draft it properly'&&m.week.list[0].done===true,
    'a rename on one device and a tick on the other both survive');
}
{ /* delete versus later tick revives, like tasks */
  const base=wdev(); base.week.list.push(mkw('w1','draft it',200));
  const a=clone(base); a.week.list=[]; a.tomb={w1:800};
  const b=clone(base); b.week.list[0].done=true; b.week.list[0].dn=900;
  ok(A.mergeStates(a,b).week.list.length===1,'a tick made after a delete elsewhere revives the item');
  const a2=clone(base); a2.week.list=[]; a2.tomb={w1:950};
  ok(A.mergeStates(a2,b).week.list.length===0,'a delete after the last tick still wins');
}
{ /* one device swept, the other still holds the ticked copy */
  const base=wdev(); base.week.list.push(mkw('w1','done thing',200,{done:true,dn:500}));
  const a=clone(base);
  a.week.list=[]; a.tomb={w1:1000};                     /* swept at Monday midnight */
  a.week.hist={'2026-08-03':[{id:'w1',title:'done thing',at:500}]};
  const b=clone(base);                                  /* stale: still ticked in the list */
  const m=A.mergeStates(a,b), m2=A.mergeStates(b,a);
  ok(m.week.list.length===0,'the swept item does not come back from a stale device');
  ok((m.week.hist['2026-08-03']||[]).length===1,'its history entry survives the merge');
  ok(A.stateSig(m)===A.stateSig(m2),'both directions agree');
}
{ /* a device that predates the weekly list cannot drop it */
  const a=dev();
  const b=wdev(); b.week.list.push(mkw('w1','keep me',200));
  b.week.hist={'2026-08-03':[{id:'w0',title:'old done thing',at:150}]};
  const m=A.mergeStates(a,b);
  ok(m.week.list.length===1&&(m.week.hist['2026-08-03']||[]).length===1,
    'merging with a pre-week planner keeps the list and its history');
}

console.log('— empty panels collapse to a header bar —');
{
  S().settings.view='board'; S().settings.floatMode=false;
  const keepFocus=S().focus.slice();
  S().focus=[]; S().week.list=[];
  A.save(); A.render(); await wait(25);

  /* one chevron, shared by all three, right when collapsed and down when open */
  const chev=host=>q(host+' .chev');
  ok(!!chev('#fpanel')&&!!chev('#habitsRail')&&!!chev('#weekRail'),'all three headers carry the chevron');
  const d=el=>el.querySelector('path').getAttribute('d');
  ok(d(chev('#fpanel'))===d(chev('#habitsRail'))&&d(chev('#habitsRail'))===d(chev('#weekRail')),
    'and it is the same glyph in all three');
  ok(!q('#fpanel .chev.open')&&!q('#weekRail .chev.open'),'the empty panels point it right');
  ok(!!q('#habitsRail .chev.open'),'the habits panel, holding habits, points it down');

  /* header only: no input, no empty-state text, a tag that still reads */
  ok(!q('#fi'),'empty focus: no input behind the header');
  ok(!/Nothing held/.test(q('#fpanel').textContent),'and no empty-state text either');
  ok(/not set/.test(q('#fpanel').textContent),'the True north bar reads not set, never a count');
  ok(!q('#weekAdd')&&/0 open/.test(q('#weekRail').textContent),'the weekly bar keeps its 0 open count');

  click('#fpanel .kh[data-action="panel-toggle"]'); await wait(20);
  ok(!!q('#fi')&&!!q('#fpanel .chev.open'),'the header opens it: chevron down, input ready');
  ok(/Nothing held/.test(q('#fpanel').textContent),'the empty-state text shows once opened');
  click('#fpanel .kh[data-action="panel-toggle"]'); await wait(20);
  ok(!q('#fi'),'clicking the header again closes it');

  /* open, add, and the panel stays with you; empty it and it folds away again */
  click('#fpanel .kh[data-action="panel-toggle"]'); await wait(20);
  q('#fi').value='hold the line'; click('[data-action="focus-add"]'); await wait(25);
  ok(S().focus.length===1&&!!q('#fi'),'adding through the opened panel keeps it open');
  const fid9=S().focus[0].id;
  click('[data-action="focus-del"][data-id="'+fid9+'"]'); await wait(25);
  ok(!q('#fi'),'emptying the panel collapses it back to the header');
  click('[data-action="undo"]'); await wait(25);
  /* the Undo button lives in the toast, OUTSIDE the panel, so the same press that
     restores the statement also puts the panel back to rest: the statement returns to
     view, its working parts do not (Change 6). */
  ok(!!q('#fpanel .frow'),'and restoring the item brings the statement back into view');
  ok(!q('#fi'),'with the panel at rest, since the press that restored it landed outside');
  /* the peek flag is not persisted: this is presentation, not state */
  const savedP=JSON.parse(w.localStorage.getItem('agora_dayplanner_v1'));
  ok(savedP.ui===undefined&&savedP.settings.peek===undefined,'nothing about peeking is saved');
  S().focus=keepFocus; A.save(); A.render(); await wait(20);
}

console.log('— Notes: a plain notepad as its own view —');
{
  const statN=JSON.stringify(A.tally([T()]))+'|'+A.streak();
  const nbtn=q('.navbtn[data-v="notes"]');
  ok(!!nbtn&&/Notes/.test(nbtn.textContent),'the rail offers Notes beside Board and Calendar');
  ok(!!nbtn.querySelector('svg'),'with an inline SVG icon');
  click('.navbtn[data-v="notes"]'); await wait(30);
  ok(S().settings.view==='notes','the view switches');
  ok(q('#notes').style.display!=='none','the notes host shows');
  ok(q('#board').style.display==='none','the board hides');
  ok(q('#quickadd').style.display==='none','and the quick add bar with it');
  ok(nbtn.classList.contains('on'),'the nav button marks itself active');
  ok(/No notes yet/.test(q('#notes').textContent),'an empty list says so');

  click('[data-action="note-new"]'); await wait(30);
  ok(S().notes.length===1,'New note creates one');
  ok(doc.activeElement&&doc.activeElement.id==='noteTitle','and puts the caret in the title');
  const nid=S().notes[0].id;
  ok(S().settings.noteSel===nid,'the new note is the selected one');
  ok(/Untitled/.test(q('.noterow.on').textContent),'an unnamed note lists as Untitled, never blank');

  /* the title field: state moves on input, the list row follows, nothing re-renders */
  const ti=q('#noteTitle'); ti.value='Packing list';
  ti.dispatchEvent(new w.Event('input',{bubbles:true})); await wait(10);
  ok(S().notes[0].title==='Packing list','typing in the title lands in state');
  ok(q('.noterow.on .nt').textContent==='Packing list','and the list row follows as you type');

  /* the body rides the same debounced save as everything else; no save button exists */
  ok(!qa('#notes button').some(b=>/save/i.test(b.textContent)),'no save button anywhere in the view');
  const bo=q('#noteBody');
  bo.innerHTML='<div>socks</div><div>passport</div><div>chargers</div>';
  bo.dispatchEvent(new w.Event('input',{bubbles:true})); await wait(10);
  ok(S().notes[0].body==='socks\npassport\nchargers','typing in the body lands in state');
  A.save(); await wait(20);
  const savedN=JSON.parse(w.localStorage.getItem('agora_dayplanner_v1'));
  ok(savedN.notes[0].body==='socks\npassport\nchargers','and persists through the normal save');
  ok(savedN.notes[0].title==='Packing list','the title too');
  const fl=A.flatten(S()).note[nid];
  ok(fl.up>1&&fl.dn>1&&fl.pos>1,'a note carries the same three stamps everything else does');

  /* a second note; switching swaps the editor */
  click('[data-action="note-new"]'); await wait(30);
  A.save(); await wait(10);   /* commit, so the change tracker has seen the row */
  ok(S().notes.length===2,'a second note');
  const nid2=S().notes[0].id;
  ok(nid2!==nid,'new notes land at the top of the list');
  ok(q('#noteBody').textContent==='','the editor now shows the fresh note');
  click('.noterow[data-id="'+nid+'"]'); await wait(30);
  ok(S().settings.noteSel===nid,'clicking a row selects that note');
  ok(q('#noteBody').innerHTML==='<div>socks</div><div>passport</div><div>chargers</div>',
    'and the editor swaps to its text, one div per line');

  /* the long-lived editor adds no blur cost: nothing commits on blur and nothing
     re-renders under the tap, so the FIRST click out of the body lands */
  q('#noteBody').focus();
  click('.noterow[data-id="'+nid2+'"]'); await wait(30);
  ok(S().settings.noteSel===nid2,'the first tap out of the editor acts, not the second');

  ok(JSON.stringify(A.tally([T()]))+'|'+A.streak()===statN,'notes touch neither the tally nor the streak');

  /* delete: the same 5 second Undo, then the bin */
  click('[data-action="note-del"][data-id="'+nid2+'"]'); await wait(30);
  ok(S().notes.length===1,'Delete removes the note');
  ok(/Deleted/.test(q('#toast').textContent)&&!!q('#toast [data-action="undo"]'),'with the usual Undo toast');
  click('[data-action="undo"]'); await wait(30);
  ok(S().notes.length===2,'Undo puts it back');
  ok(S().settings.noteSel===nid2,'selected again');
  const bo2=q('#noteBody'); bo2.innerHTML='<div>do not lose me</div>';
  bo2.dispatchEvent(new w.Event('input',{bubbles:true})); await wait(10);
  A.save(); await wait(10);   /* commit the body, so the bin keeps what was last typed */
  click('[data-action="note-del"][data-id="'+nid2+'"]'); await wait(30); A.save(); await wait(10);
  ok(!!S().tomb[nid2]&&!!S().bin[nid2]&&S().bin[nid2].k==='note','tomb and bin record the deletion');
  ok(S().bin[nid2].body.body==='do not lose me','the bin keeps the body text');
  q('#toast').innerHTML='';
  A.restoreBin(nid2); await wait(30);
  ok(S().notes.some(n=>n.id===nid2),'Restore from the Bin brings it back');
  ok(S().notes.find(n=>n.id===nid2).body==='do not lose me','text intact');
  ok(/Notes/.test(q('#toast').textContent),'and the toast says where it went');

  /* deleting the selected note falls back to a surviving one */
  click('[data-action="note-del"][data-id="'+nid2+'"]'); await wait(30);
  ok(S().settings.noteSel===nid&&!!q('#noteBody'),'the editor falls back to the surviving note');
  q('#toast').innerHTML='';

  click('.navbtn[data-v="board"]'); await wait(30);
  ok(S().settings.view==='board','back on the board');
  ok(q('#notes').style.display==='none','and the notes host hides');
}

console.log('— Notes: merge —');
{
  const ndev=()=>{const s=wdev(); s.notes=[]; return s};
  const mkn=(id,title,body,up,x)=>Object.assign(
    {id,title:title||'',body:body||'',up:up||100,dn:up||100,pos:up||100},x||{});
  { /* added on each side */
    const a=ndev(); a.notes.push(mkn('n1','From the PC','pc body',200));
    const b=ndev(); b.notes.push(mkn('n2','From the tablet','tab body',210));
    const m=A.mergeStates(a,b);
    ok(m.notes.length===2,'a note added on each device: both survive');
    ok(A.stateSig(m)===A.stateSig(A.mergeStates(b,a)),'and both devices agree');
  }
  { /* the axes: the title rides content, the body rides dn, so the two compose */
    const now=Date.now();
    const base=ndev(); base.notes.push(mkn('n1','Trip','pack socks',200));
    const a=clone(base); a.notes[0].title='Trip to Oslo'; a.notes[0].up=now;
    const b=clone(base); b.notes[0].body='pack socks and a charger'; b.notes[0].dn=now-1000;
    const m=A.mergeStates(a,b), m2=A.mergeStates(b,a);
    ok(m.notes[0].title==='Trip to Oslo','a title edit on one device survives');
    ok(m.notes[0].body==='pack socks and a charger','beside a body edit made on the other');
    ok(A.stateSig(m)===A.stateSig(m2),'and both devices agree');
  }
  { /* the honest limit, pinned: two body edits, the later wins the WHOLE body */
    const now=Date.now();
    const base=ndev(); base.notes.push(mkn('n1','Trip','original',200));
    const a=clone(base); a.notes[0].body='alpha rewrite, kept'; a.notes[0].dn=now;
    const b=clone(base); b.notes[0].body='beta rewrite, lost'; b.notes[0].dn=now-5;
    const m=A.mergeStates(a,b), m2=A.mergeStates(b,a);
    ok(m.notes[0].body==='alpha rewrite, kept','concurrent body edits: the later one wins whole');
    ok(JSON.stringify(m).indexOf('beta rewrite')===-1,
      'the losing body is silently gone, nowhere in the merged state, bin included');
    ok(A.stateSig(m)===A.stateSig(m2),'both devices at least agree on which survived');
  }
  { /* delete versus a later body edit: the edit asserts the note exists */
    const now=Date.now();
    const base=ndev(); base.notes.push(mkn('n1','Trip','original',200));
    const a=clone(base); a.notes=[]; a.tomb={n1:now-100};
    const b=clone(base); b.notes[0].body='edited after the delete'; b.notes[0].dn=now;
    ok(A.mergeStates(a,b).notes.length===1,'a body edit after a delete elsewhere revives the note');
    const a2=clone(base); a2.notes=[]; a2.tomb={n1:now+100};
    ok(A.mergeStates(a2,b).notes.length===0,'a delete after the last edit still wins');
  }
  { /* a device that predates notes cannot drop them */
    const a=dev();
    const b=ndev(); b.notes.push(mkn('n1','Keep me','still here',200));
    const m=A.mergeStates(a,b);
    ok(m.notes.length===1&&m.notes[0].body==='still here','merging with a pre-notes planner keeps the notes');
    ok(A.stateSig(m)===A.stateSig(A.mergeStates(b,a)),'from either direction');
  }
}

console.log('— Notes: the writing surface —');
{
  /* one note left from the block above: "Packing list", three lines of body */
  click('.navbtn[data-v="notes"]'); await wait(30);
  ok(!!q('.noteed .notepage'),'the editor is one page surface, not bare fields');
  ok(!!q('.notepage #noteTitle')&&!!q('.notepage #noteBody'),'title and body live on the page');
  ok(q('#noteBody').getAttribute('contenteditable')==='true','the body is an editable page');
  ok(!q('#notes textarea'),'no boxed textarea remains in the view');
  ok(!!q('.notepage .notewrap'),'the reading measure is a column inside the page, not the page pushed away');
  const mt=q('#noteMeta').textContent;
  ok(/^Edited today/.test(mt),'the quiet meta line shows when the note was last edited');
  ok(/3 words/.test(mt),'and a word count');
  ok(!/sav/i.test(q('.notemeta').textContent),'the meta strip never talks about saving');
  const bo=q('#noteBody'); bo.innerHTML='<div>one two three four</div>'; fire(bo,'input'); await wait(10);
  ok(/4 words/.test(q('#noteMeta').textContent),'the count follows as you type, with no re-render');
  ok(/Edited today/.test(q('#noteMeta').textContent),'and the edit time reads today mid-typing');
  ok(q('#noteBody')===bo,'typing never rebuilds the editor');
  A.save(); await wait(10);
}

console.log('— Notes: search, sort by last edit, the untitled row label —');
{
  const now=Date.now();
  S().notes=[
    {id:'na',title:'Alpha',body:'apples and pears',up:now-30000,dn:now-30000,pos:now-30000},
    {id:'nb',title:'Beta',body:'boats and harbours',up:now-20000,dn:now-20000,pos:now-20000},
    {id:'nc',title:'',body:'Citrus first line\nand the rest of the citrus note',up:now-10000,dn:now-10000,pos:now-10000},
  ];
  S().settings.noteSel='na'; A.save(); A.render(); await wait(25);
  const ids=()=>qa('.noterow').map(r=>r.dataset.id);
  ok(JSON.stringify(ids())===JSON.stringify(['nc','nb','na']),
    'the list sorts by most recently edited ('+ids().join(',')+')');
  ok(q('.noterow[data-id="nc"] .ntx').textContent==='Citrus first line',
    'an untitled note is known by its first line, never a blank row');
  /* the body preview is gone from the row. The fallback above is therefore the ONLY
     thing naming an untitled note, which is why it stays. */
  ok(!q('.noterow .nsub')&&q('.noterow[data-id="nc"]').textContent.trim()==='Citrus first line',
    'the row is that label alone: no body preview line under it');
  ok(q('.noterow[data-id="na"] .ntx').textContent==='Alpha'&&
    !/apples/.test(q('.noterow[data-id="na"]').textContent),
    'a titled note lists its title and none of its body');

  /* search: titles and bodies, patched in place, editor untouched */
  const bodyEl=q('#noteBody'), se=q('#noteSearch');
  se.value='beta'; fire(se,'input'); await wait(10);
  ok(JSON.stringify(ids())===JSON.stringify(['nb']),'search matches a title');
  se.value='pears'; fire(se,'input'); await wait(10);
  ok(JSON.stringify(ids())===JSON.stringify(['na']),'search reaches into bodies');
  se.value='CITRUS'; fire(se,'input'); await wait(10);
  ok(ids().length===1&&ids()[0]==='nc','case does not matter');
  se.value='no such thing'; fire(se,'input'); await wait(10);
  ok(/Nothing matches/.test(q('#noteRows').textContent),'an empty result says so');
  ok(q('#noteBody')===bodyEl,'filtering never rebuilds the editor');
  ok(S().settings.noteSel==='na','and never moves the selection');
  se.value=''; fire(se,'input'); await wait(10);
  ok(ids().length===3,'clearing the box brings the whole list back');

  /* a new note clears the query, so it is never born invisible */
  se.value='pears'; fire(se,'input'); await wait(10);
  click('[data-action="note-new"]'); await wait(25);
  ok(q('#noteSearch').value===''&&qa('.noterow').length===4,'a new note clears the search and shows itself');
  const nn=S().notes.find(n=>!n.title&&!n.body);
  click('[data-action="note-del"][data-id="'+nn.id+'"]'); await wait(25);
  q('#toast').innerHTML='';

  /* typing does not shuffle the list; the sort catches up on the next paint */
  click('.noterow[data-id="na"]'); await wait(25);
  const b2=q('#noteBody'); b2.innerHTML='<div>apples and pears, plus a lemon</div>'; fire(b2,'input'); await wait(10);
  ok(qa('.noterow')[0].dataset.id==='nc','the list holds still while you type');
  A.save(); A.render(); await wait(25);
  ok(qa('.noterow')[0].dataset.id==='na','and lifts the fresh edit to the top on the next paint');
}

console.log('— Notes: pin —');
{
  const ids=()=>qa('.noterow').map(r=>r.dataset.id);
  click('.noterow[data-id="nb"]'); await wait(25);
  const before=A.flatten(S()).note.nb;
  click('[data-action="note-pin"][data-id="nb"]'); await wait(25);
  ok(S().notes.find(n=>n.id==='nb').pinned===true,'Pin marks the note');
  ok(ids()[0]==='nb','a pinned note sits at the top of the list');
  ok(!!q('.noterow[data-id="nb"] .nt svg'),'its row carries the pin mark, an inline SVG');
  ok(/Unpin/.test(q('[data-action="note-pin"][data-id="nb"]').textContent),'the button now offers Unpin');
  ok(q('[data-action="note-pin"][data-id="nb"]').getAttribute('aria-pressed')==='true','and says so to assistive tech');
  A.save(); await wait(10);
  const f=A.flatten(S()).note.nb;
  ok(f.up===before.up&&f.dn===before.dn,'pinning touches neither the title stamp nor the body stamp');
  ok(f.pos>before.pos,'only the position stamp moves: pin rides the pos axis');
  ok(ids()[1]==='na','the unpinned rest still sorts by last edit');
  const se=q('#noteSearch'); se.value='boats'; fire(se,'input'); await wait(10);
  ok(ids().length===1&&ids()[0]==='nb','search works over a pinned note');
  se.value=''; fire(se,'input'); await wait(10);
  click('[data-action="note-pin"][data-id="nb"]'); await wait(25);
  ok(!('pinned' in S().notes.find(n=>n.id==='nb')),'Unpin removes the flag entirely, exports stay clean');
  ok(ids()[0]==='na','and the list falls back to the recency order');
  /* deleting a pinned note: the same Undo, the same bin, the body intact */
  click('.noterow[data-id="nc"]'); await wait(25);
  click('[data-action="note-pin"][data-id="nc"]'); await wait(25);
  A.save(); await wait(10);
  click('[data-action="note-del"][data-id="nc"]'); await wait(25);
  ok(/Deleted/.test(q('#toast').textContent)&&!!q('#toast [data-action="undo"]'),
    'deleting a pinned note offers the usual 5 second Undo');
  q('#toast').innerHTML=''; A.save(); await wait(10);
  ok(!!S().bin.nc&&S().bin.nc.k==='note','then it waits in the bin');
  A.restoreBin('nc'); await wait(25);
  const back=S().notes.find(n=>n.id==='nc');
  ok(!!back&&back.body.indexOf('Citrus first line')===0,'Restore brings the body back intact');
  ok(back.pinned===true,'still pinned');
  q('#toast').innerHTML='';
}

console.log('— Notes: pin merge —');
{
  const ndev=()=>{const s=dev(); s.notes=[]; return s};
  const mkn=(id,title,body,up,x)=>Object.assign(
    {id,title:title||'',body:body||'',up:up||100,dn:up||100,pos:up||100},x||{});
  { /* pin composes with a body edit made elsewhere: the body merge is untouched */
    const now=Date.now();
    const base=ndev(); base.notes.push(mkn('n1','Trip','original',200));
    const a=clone(base); a.notes[0].pinned=true; a.notes[0].pos=now;
    const b=clone(base); b.notes[0].body='rewritten elsewhere'; b.notes[0].dn=now-50;
    const m=A.mergeStates(a,b), m2=A.mergeStates(b,a);
    ok(m.notes[0].pinned===true,'a pin on one device survives');
    ok(m.notes[0].body==='rewritten elsewhere','beside a body edit made on the other');
    ok(A.stateSig(m)===A.stateSig(m2),'and both devices agree');
  }
  { /* pin against unpin: the later position wins, deterministically */
    const now=Date.now();
    const base=ndev(); base.notes.push(mkn('n1','Trip','original',200,{pinned:true}));
    const a=clone(base); delete a.notes[0].pinned; a.notes[0].pos=now;
    const b=clone(base); b.notes[0].pos=now-100;
    const m=A.mergeStates(a,b);
    ok(!m.notes[0].pinned,'pin against unpin: the later change wins');
    ok(A.stateSig(m)===A.stateSig(A.mergeStates(b,a)),'from either direction');
  }
  { /* pinning cannot revive a deletion: pin is position, not an edit */
    const now=Date.now();
    const base=ndev(); base.notes.push(mkn('n1','Trip','original',200));
    const a=clone(base); a.notes=[]; a.tomb={n1:now};
    const b=clone(base); b.notes[0].pinned=true; b.notes[0].pos=now+50;
    ok(A.mergeStates(a,b).notes.length===0,'pinning a note deleted elsewhere does not bring it back');
    ok(A.mergeStates(b,a).notes.length===0,'in either direction');
  }
  { /* a planner that predates pinning merges clean */
    const a=ndev(); a.notes.push({id:'n1',title:'Old',body:'no pinned field',up:200,dn:200,pos:200});
    const b=ndev(); b.notes.push(mkn('n2','New',null,210,{pinned:true}));
    const m=A.mergeStates(a,b);
    ok(m.notes.length===2&&m.notes.find(n=>n.id==='n2').pinned===true
      &&!m.notes.find(n=>n.id==='n1').pinned,'pinned and pre-pin notes coexist');
  }
}

console.log('— Notes: rich text: storage, sanitizer, commands —');
{
  /* storage: a body with NO formatting stays the very same plain string the plain
     era stored, so the merge, the sig and every fixture see identical bytes */
  click('.noterow[data-id="na"]'); await wait(25);
  const ed=q('#noteBody');
  ed.innerHTML='<div>first line</div><div>second line</div>';
  fire(ed,'input'); await wait(10);
  ok(S().notes.find(n=>n.id==='na').body==='first line\nsecond line',
    'an unformatted body is stored as the same plain string as before');

  /* formatting flips the string to the sanitized subset, still one string on dn */
  ed.innerHTML='<div>plain <b>bold</b> and <span class="hl-ocean">marked</span></div>';
  fire(ed,'input'); await wait(10);
  ok(S().notes.find(n=>n.id==='na').body===
    '<div>plain <b>bold</b> and <span class="hl-ocean">marked</span></div>',
    'formatted content stores as the sanctioned HTML subset');

  /* the sanitizer is the whole contract: hostile input dies to its text */
  ed.innerHTML='<div>ok</div><script>window.___pwn=1</'+'script>'+
    '<p style="color:red" onclick="x()">para<img src="x"></p>'+
    '<span style="background-color: rgb(207, 227, 241)">powder</span>';
  fire(ed,'input'); await wait(10);
  const sb=S().notes.find(n=>n.id==='na').body;
  ok(sb==='<div>ok</div><div>para</div><div><span class="hl-powder">powder</span></div>',
    'script, attributes and unknown tags die; palette styles map to classes ('+sb+')');
  ok(!w.___pwn,'and nothing executed');

  /* Chrome's engine styles the EXISTING inline element when one wraps the whole
     selection; those styles re-express as sanctioned spans nested inside it */
  ed.innerHTML='<div><i style="background-color: rgb(143, 182, 216)">sea</i> '+
    '<u style="font-size: x-large">big</u> <font size="2">tiny</font></div>';
  fire(ed,'input'); await wait(10);
  ok(S().notes.find(n=>n.id==='na').body===
    '<div><i><span class="hl-ocean">sea</span></i> <u><span class="fz-l">big</span></u> <span class="fz-s">tiny</span></div>',
    'styles set on existing inline elements survive as nested spans ('+
    S().notes.find(n=>n.id==='na').body+')');

  /* the toggle-off shape, the defect the 2026-08-10 verification pass caught: the
     engine removes a highlight by laying background-color transparent OVER the
     sanctioned span, and clears a size with font-size medium; the style is the
     newest word and the carried class must yield, or formatting is permanent */
  ed.innerHTML='<div><span class="hl-ocean" style="background-color: transparent">plain again</span> '+
    '<span class="fz-l" style="font-size: medium">body size</span></div>';
  fire(ed,'input'); await wait(10);
  ok(S().notes.find(n=>n.id==='na').body==='plain again body size',
    'a transparent or medium style overrides the carried class, and with nothing left the body collapses back to plain ('+
    S().notes.find(n=>n.id==='na').body+')');

  /* command wiring: jsdom has no editing engine, so spy on execCommand */
  const calls=[];
  doc.execCommand=(c,ui2,v)=>{ calls.push(c+(v!=null&&v!==''?':'+v:'')); return true };
  ['bold','italic','underline','strike','hl-powder','size-s','size-l','ul','ol']
    .forEach(c=>click('.ntb[data-cmd="'+c+'"]'));
  await wait(10);
  ok(calls.includes('bold')&&calls.includes('italic')&&calls.includes('underline')&&
     calls.includes('strikeThrough'),'the four weights route to their commands');
  ok(calls.includes('hiliteColor:#CFE3F1'),'highlight routes with a palette colour, never a new one');
  ok(calls.includes('fontSize:2')&&calls.includes('fontSize:5'),'both sizes route through the font scale');
  ok(calls.includes('insertUnorderedList')&&calls.includes('insertOrderedList'),'lists route');
  delete doc.execCommand;

  /* the dash list converts in place: pure class work, no engine involved */
  ed.innerHTML='<ul><li>one</li><li>two</li></ul>';
  fire(ed,'input'); await wait(10);
  const li=ed.querySelector('li').firstChild;
  const r0=doc.createRange(); r0.setStart(li,1); r0.collapse(true);
  const sl0=w.getSelection(); sl0.removeAllRanges(); sl0.addRange(r0);
  click('.ntb[data-cmd="dash"]'); await wait(10);
  ok(S().notes.find(n=>n.id==='na').body==='<ul class="dash"><li>one</li><li>two</li></ul>',
    'dash converts an existing list in place');
  click('.ntb[data-cmd="ul"]'); await wait(10);
  ok(S().notes.find(n=>n.id==='na').body==='<ul><li>one</li><li>two</li></ul>',
    'and the bullet button converts it back');

  /* highlight toggle-off is structural, no engine involved: with the caret inside
     a highlighted run the same swatch unwraps it. The engine's own remove shapes
     vary and can nest a transparent span INSIDE ours, leaving the class standing;
     that was the verification pass's second catch. */
  ed.innerHTML='<div>stay <span class="hl-ocean">lit</span> word</div>';
  fire(ed,'input'); await wait(10);
  const hlT=ed.querySelector('.hl-ocean').firstChild;
  const rh=doc.createRange(); rh.setStart(hlT,1); rh.collapse(true);
  const slh=w.getSelection(); slh.removeAllRanges(); slh.addRange(rh);
  click('.ntb[data-cmd="hl-ocean"]'); await wait(10);
  ok(S().notes.find(n=>n.id==='na').body==='stay lit word',
    'the same swatch removes the highlight and the body collapses to plain ('+
    S().notes.find(n=>n.id==='na').body+')');

  /* page appearance: state, live class, and the content axis */
  const pgSel=q('#notePage');
  pgSel.value='ruled'; fire(pgSel,'change'); await wait(10);
  ok(S().notes.find(n=>n.id==='na').pg==='ruled','the page choice lands in state');
  ok(q('#noteBody').classList.contains('pg-ruled'),'and paints the ruling live, no re-render');
  A.save(); await wait(10);
  const b4=A.flatten(S()).note.na;
  pgSel.value='dot'; fire(pgSel,'change'); await wait(10); A.save(); await wait(10);
  const f1=A.flatten(S()).note.na;
  ok(f1.up>b4.up&&f1.dn===b4.dn&&f1.pos===b4.pos,
    'a page flip stamps content only: the body axis never moves');
  ok(q('#noteBody').classList.contains('pg-dot')&&!q('#noteBody').classList.contains('pg-ruled'),
    'dotted replaces ruled');
  pgSel.value='plain'; fire(pgSel,'change'); await wait(10);
  ok(!('pg' in S().notes.find(n=>n.id==='na')),'blank removes the field entirely, exports stay clean');

  /* search reaches through markup and counts are markup blind. THE BODY IS NOT DRAWN
     in the row any more, which is exactly why this pair matters: the only way back to
     a note by its contents is the search box, so it has to keep reaching. */
  ed.innerHTML='<div>find the <b>golden</b> thread</div>';
  fire(ed,'input'); await wait(10); A.save(); await wait(10);
  const se=q('#noteSearch'); se.value='golden thread'; fire(se,'input'); await wait(10);
  const hits=qa('.noterow').map(r=>r.dataset.id);
  ok(hits.length===1&&hits[0]==='na',
    'search sees through formatting: a phrase crossing a tag boundary still matches');
  ok(!/golden/.test(q('.noterow[data-id="na"]').textContent),
    'and matches a body the row never shows');
  se.value=''; fire(se,'input'); await wait(10);
  ok(q('.noterow[data-id="na"] .ntx').textContent==='Alpha'&&!q('.noterow .nsub'),
    'the row stays the title alone after the search clears');
  ok(/4 words/.test(q('#noteMeta').textContent),'the word count reads text, not tags');

  /* migration: a legacy plain body with literal markup characters stays literal */
  S().notes.push({id:'nl',title:'Legacy',body:'use <b> tags here',
    up:Date.now()-60000,dn:Date.now()-60000,pos:Date.now()-60000});
  A.save(); A.render(); await wait(20);
  click('.noterow[data-id="nl"]'); await wait(20);
  ok(q('#noteBody').textContent==='use <b> tags here',
    'a legacy plain body renders its markup characters as text');
  ok(!q('#noteBody').querySelector('b'),'never as formatting');
  fire(q('#noteBody'),'input'); await wait(10);
  ok(S().notes.find(n=>n.id==='nl').body==='use <b> tags here',
    'and an edit round-trips it untouched');

  /* export serialization: the body string is JSON-safe rich or plain */
  ok(JSON.parse(JSON.stringify(S())).notes.find(n=>n.id==='na').body===
    S().notes.find(n=>n.id==='na').body,'a formatted body survives the export path byte for byte');

  /* the bin keeps formatting, and Restore brings it back whole */
  click('.noterow[data-id="na"]'); await wait(20); A.save(); await wait(10);
  click('[data-action="note-del"][data-id="na"]'); await wait(25);
  q('#toast').innerHTML=''; A.save(); await wait(10);
  ok(S().bin.na.body.body==='<div>find the <b>golden</b> thread</div>','the bin keeps the markup');
  A.restoreBin('na'); await wait(25);
  ok(S().notes.find(n=>n.id==='na').body==='<div>find the <b>golden</b> thread</div>',
    'Restore brings the formatting back intact');
  q('#toast').innerHTML='';
}

console.log('— Notes: page appearance merge —');
{
  const ndev=()=>{const s=dev(); s.notes=[]; return s};
  const mkn=(id,title,body,up,x)=>Object.assign(
    {id,title:title||'',body:body||'',up:up||100,dn:up||100,pos:up||100},x||{});
  { /* a page flip composes with a body edit made elsewhere */
    const now=Date.now();
    const base=ndev(); base.notes.push(mkn('n1','Trip','original',200));
    const a=clone(base); a.notes[0].pg='ruled'; a.notes[0].up=now;
    const b=clone(base); b.notes[0].body='rewritten elsewhere'; b.notes[0].dn=now-50;
    const m=A.mergeStates(a,b);
    ok(m.notes[0].pg==='ruled'&&m.notes[0].body==='rewritten elsewhere',
      'a page flip on one device composes with a body edit on the other');
    ok(A.stateSig(m)===A.stateSig(A.mergeStates(b,a)),'and both devices agree');
  }
  { /* the honest limit: page flip against a later title rename, later up takes both */
    const now=Date.now();
    const base=ndev(); base.notes.push(mkn('n1','Trip','original',200));
    const a=clone(base); a.notes[0].title='Trip to Oslo'; a.notes[0].up=now;
    const b=clone(base); b.notes[0].pg='dot'; b.notes[0].up=now-5;
    const m=A.mergeStates(a,b);
    ok(m.notes[0].title==='Trip to Oslo'&&!m.notes[0].pg,
      'page and title share the content axis: the later edit takes the whole set');
    ok(A.stateSig(m)===A.stateSig(A.mergeStates(b,a)),'deterministically, both ways');
  }
  { /* a planner that predates the field merges clean */
    const a=dev();
    const b=ndev(); b.notes.push(mkn('n1','Keep','body',210,{pg:'ruled'}));
    const m=A.mergeStates(a,b);
    ok(m.notes.length===1&&m.notes[0].pg==='ruled','a pre-pg planner drops nothing');
  }
}

console.log('— Notes: a foreign render never steals the caret —');
{
  /* the exact case renderNotes restores by hand: a render arriving from elsewhere
     (a sync adopt, the midnight check) while someone is typing. The caret is kept
     as an absolute text offset, so it survives even inside formatted spans. */
  click('.noterow[data-id="na"]'); await wait(25);
  const bo=q('#noteBody'); bo.focus();
  const tn=bo.firstChild.firstChild;   /* <div>"find the "<b>… -> the leading text node */
  { const r=doc.createRange(); r.setStart(tn,4); r.setEnd(tn,9);
    const sl=w.getSelection(); sl.removeAllRanges(); sl.addRange(r); }
  A.render(); await wait(20);
  const bo2=q('#noteBody');
  ok(bo2!==bo,'the render really did rebuild the field');
  ok(doc.activeElement===bo2,'yet focus stays in the body');
  { const r=w.getSelection().getRangeAt(0);
    ok(r.startOffset===4&&r.endOffset===9&&bo2.contains(r.startContainer),
      'with the selection exactly where it was'); }

  /* and inside a formatted run: the offset walks through the <b> boundary */
  const bt=bo2.querySelector('b').firstChild;   /* "golden" */
  { const r=doc.createRange(); r.setStart(bt,3); r.collapse(true);
    const sl=w.getSelection(); sl.removeAllRanges(); sl.addRange(r); }
  A.render(); await wait(20);
  { const r=w.getSelection().getRangeAt(0);
    ok(doc.activeElement===q('#noteBody')&&r.startContainer.textContent==='golden'&&r.startOffset===3,
      'a caret parked inside bold text returns to the same character'); }
  const ti=q('#noteTitle'); ti.focus(); ti.setSelectionRange(1,3);
  A.render(); await wait(20);
  ok(doc.activeElement===q('#noteTitle')&&q('#noteTitle').selectionStart===1
    &&q('#noteTitle').selectionEnd===3,'the title gets the same protection');
  /* mid-search: the query, its caret and the filtered list all survive */
  const se=q('#noteSearch'); se.focus(); se.value='citrus'; fire(se,'input'); await wait(10);
  se.setSelectionRange(6,6);
  A.render(); await wait(20);
  const se2=q('#noteSearch');
  ok(doc.activeElement===se2&&se2.value==='citrus','a foreign render keeps the search text and focus');
  ok(se2.selectionStart===6,'and its caret');
  ok(qa('.noterow').length===1&&qa('.noterow')[0].dataset.id==='nc','and the filter still applies after the render');
  se2.value=''; fire(se2,'input'); await wait(10);
  click('.navbtn[data-v="board"]'); await wait(25);
}

console.log('— Notes: the caret counts line breaks —');
{
  /* The reported "characters in the wrong place". The caret is flattened to an
     absolute offset, and line breaks used to cost nothing, so the start of a line
     and the end of the line before it were the SAME number and the restore always
     chose the earlier one. Every foreign render (the 25s sync poll is one) with the
     caret at a line start dropped it a line up, and the next keystroke went there. */
  S().notes=[{id:'nl',title:'Lines',body:'one\ntwo\nthree',up:1,dn:1,pos:1}];
  S().settings.view='notes'; S().settings.noteSel='nl';
  A.render(); await wait(25);
  const put=(node,off)=>{ const r=doc.createRange(); r.setStart(node,off); r.collapse(true);
    const s=w.getSelection(); s.removeAllRanges(); s.addRange(r) };
  const here=()=>{ const r=w.getSelection().getRangeAt(0);
    return {t:r.startContainer.textContent,o:r.startOffset,c:r.startContainer} };
  /* typing at wherever the caret came back to, the way the engine would */
  const press=ch=>{ const r=w.getSelection().getRangeAt(0), n=r.startContainer;
    if(n.nodeType===3) n.data=n.data.slice(0,r.startOffset)+ch+n.data.slice(r.startOffset);
    else n.appendChild(doc.createTextNode(ch));
    fire(q('#noteBody'),'input') };

  let ed=q('#noteBody'); ed.focus();
  ok(ed.childNodes.length===3,'three lines render as three blocks');
  put(ed.childNodes[2].firstChild,0);          /* the start of line three */
  A.render(); await wait(20);
  ok(q('#noteBody')!==ed,'the render really did rebuild the field');
  ok(here().t==='three'&&here().o===0,'a caret at the start of a line comes back there');
  press('X'); await wait(10);
  ok(S().notes[0].body==='one\ntwo\nXthree',
    'so the next keystroke lands on that line, not the end of the one before ('+
    JSON.stringify(S().notes[0].body)+')');

  S().notes[0].body='one\ntwo\nthree'; A.render(); await wait(20);
  ed=q('#noteBody'); ed.focus();
  put(ed.childNodes[1].firstChild,3);          /* the END of line two */
  A.render(); await wait(20);
  ok(here().t==='two'&&here().o===3,'and the end of the line before it is a different place');

  /* an empty line has no text node of its own; the break holds it open */
  S().notes[0].body='one\n\nthree'; A.render(); await wait(20);
  ed=q('#noteBody'); ed.focus();
  put(ed.childNodes[1],0);                     /* the blank middle line */
  A.render(); await wait(20);
  { const h=here(), ed2=q('#noteBody');
    ok(h.c===ed2.childNodes[1]&&h.o===0,'a caret on a blank line stays on the blank line'); }
  /* and the line BELOW the blank one: the break itself has to cost a character, or
     the two share a number and the caret falls back onto the blank line */
  ed=q('#noteBody'); ed.focus();
  put(ed.childNodes[2].firstChild,0);
  A.render(); await wait(20);
  ok(here().t==='three'&&here().o===0,'the line below a blank one is a place of its own');
  /* the same, with the break inside a single block rather than between two */
  S().notes[0].body='<div>a<br>b</div>'; A.render(); await wait(20);
  ed=q('#noteBody'); ed.focus();
  put(ed.firstChild.lastChild,0);
  A.render(); await wait(20);
  ok(here().t==='b'&&here().o===0,'a break inside one block counts the same way');

  /* a body that shrank under the caret: park it inside the last line, never between
     the blocks, where the next character is typed outside every line */
  S().notes[0].body='one\ntwo\nthree'; A.render(); await wait(20);
  ed=q('#noteBody'); ed.focus();
  put(ed.childNodes[2].firstChild,5);
  S().notes[0].body='one';
  A.render(); await wait(20);
  { const h=here(), ed3=q('#noteBody');
    ok(h.c!==ed3&&h.c.nodeType===3&&h.t==='one'&&h.o===3,
      'a caret past the end of a shrunken body clamps into the last line'); }
  press('!'); await wait(10);
  ok(S().notes[0].body==='one!','and typing there stays on that line, not on a new one');

  /* the offsets still walk through inline formatting, the case already relied on */
  S().notes[0].body='<div>plain <b>bold</b> tail</div><div>second</div>';
  A.render(); await wait(20);
  ed=q('#noteBody'); ed.focus();
  put(ed.querySelector('b').firstChild,2);
  A.render(); await wait(20);
  ok(here().t==='bold'&&here().o===2,'a caret inside a bold run still returns to the same character');
  put(q('#noteBody').childNodes[1].firstChild,0);
  A.render(); await wait(20);
  ok(here().t==='second'&&here().o===0,'and a line start below formatted content is exact too');
}

console.log('— Notes: a nested block is still a line —');
{
  /* Chrome writes nested blocks (an Enter inside a wrapped line gives
     <div>one<div>two</div></div>). The serializer read only the root's own children
     and joined their text, so every break inside a nested block was eaten and two
     lines silently became one on the next keystroke. */
  S().notes=[{id:'ns',title:'Shapes',body:'seed',up:1,dn:1,pos:1}];
  S().settings.noteSel='ns'; A.render(); await wait(20);
  const ed=q('#noteBody');
  const round=h=>{ ed.innerHTML=h; fire(ed,'input'); return S().notes[0].body };
  ok(round('<div>one</div><div>two</div>')==='one\ntwo','two blocks are two lines');
  ok(round('<div><div>one</div><div>two</div></div>')==='one\ntwo',
    'a wrapper around them changes nothing');
  ok(round('<div>one<div>two</div></div>')==='one\ntwo',
    "Chrome's nested-Enter shape keeps its break");
  ok(round('<div>one<br>two</div>')==='one\ntwo','a break inside one block is still a line');
  ok(round('<div>one</div><div><br></div><div>two</div>')==='one\n\ntwo','a blank line survives');
  ok(round('<div>one</div>')==='one','and a single line is still a single line');
  ok(round('<div><div>a</div><div><b>b</b></div></div>')==='<div><div>a</div><div><b>b</b></div></div>',
    'formatting keeps the rich path, nesting and all');
  S().settings.view='board'; A.render(); await wait(20);
}

console.log('— Notes: a keystroke is never merged away —');
{
  /* The reported revert. A note's body rides the dn stamp, and dn only moves at
     commit; the editor calls save() on every keystroke and every call resets the
     400ms debounce, so a typing burst leaves the body newer than its stamp. A sync
     cycle landing in that window weighed the unstamped local body against the
     cloud's copy of the SAME dn, and the tie broke by comparing the two strings:
     appending an ordinary character sorts AFTER the shorter old one, so the cloud
     copy won, was adopted, re-rendered and written to localStorage, and the typing
     was gone. syncCycle now flushes the debounce before it merges. */
  const cloud={row:null};
  const net=async(url,opts)=>{
    opts=opts||{};
    if((opts.method||'GET').toUpperCase()==='GET')
      return {ok:true,status:200,text:async()=>'',
        json:async()=>cloud.row?[{data:cloud.row.data,updated_at:cloud.row.updated_at}]:[]};
    const b=JSON.parse(opts.body)[0];
    cloud.row={data:JSON.parse(JSON.stringify(b.data)),updated_at:b.updated_at};
    return {ok:true,status:200,text:async()=>'',json:async()=>[]};
  };
  const d=new JSDOM(html,{runScripts:'dangerously',url:'http://localhost/',pretendToBeVisual:true,
    beforeParse(win){ win.fetch=net;
      win.localStorage.setItem('agora_dayplanner_synckey','hs-race') }});
  await wait(300);
  const win=d.window, dc=win.document, AA=win.A;
  const ed=()=>dc.querySelector('#noteBody');
  const body=()=>AA.state.notes[0].body;
  const cbody=()=>cloud.row.data.notes[0].body;
  /* type the way the engine does: mutate the text node, then raise input */
  const line=()=>{ const e=ed();
    if(!e.firstChild||e.firstChild.nodeName!=='DIV') e.innerHTML='<div></div>';
    const l=e.firstChild;
    if(!l.firstChild||l.firstChild.nodeType!==3){
      while(l.firstChild) l.removeChild(l.firstChild);
      l.appendChild(dc.createTextNode('')); }
    return l.firstChild };
  const typed=txt=>{ const t=line(); t.data+=txt;
    ed().dispatchEvent(new win.Event('input',{bubbles:true})) };
  const rubbed=n=>{ const t=line(); t.data=t.data.slice(0,-n);
    ed().dispatchEvent(new win.Event('input',{bubbles:true})) };

  dc.querySelector('.navbtn[data-v="notes"]').click(); await wait(25);
  dc.querySelector('[data-action="note-new"]').click(); await wait(30);
  typed('hello');
  AA.save();                                   /* the pause that flushes the debounce */
  await AA.syncCycle({}); await wait(40);
  const dn0=AA.state.notes[0].dn;
  ok(cbody()==='hello','the cloud holds the committed body');

  typed('x');                                  /* and now type on, never pausing */
  ok(body()==='hellox'&&AA.state.notes[0].dn===dn0,
    'a keystroke reaches state at once, but its stamp waits for the commit');
  const before=ed();
  await AA.syncCycle({}); await wait(60);
  ok(body()==='hellox','a sync cycle mid-typing keeps the keystroke');
  ok(ed().textContent==='hellox','the screen agrees with it');
  ok(AA.state.notes[0].dn>dn0,'the merge saw it stamped, not as old as the cloud copy');
  ok(cbody()==='hellox','and the cloud was told');
  ok(ed()===before,'nothing arrived from elsewhere, so the editor was never rebuilt');

  /* the mirror: text that sorts BEFORE the cloud copy (a deletion) survived the old
     tie-break by luck. Pin both directions or half the bug can come back unnoticed. */
  rubbed(2);
  await AA.syncCycle({}); await wait(60);
  ok(body()==='hell'&&cbody()==='hell','a deletion mid-typing survives the same way');

  /* and the merge still does its job: a genuinely newer body from the other device */
  cloud.row.data.notes[0].body='written on the phone';
  cloud.row.data.notes[0].dn=Date.now()+5000;
  cloud.row.updated_at=new Date(Date.now()+5000).toISOString();
  await AA.syncCycle({}); await wait(60);
  ok(body()==='written on the phone','a genuinely newer body from elsewhere still lands');

  /* a burst of type-and-delete with a cycle after every single keystroke */
  cloud.row.data.notes[0].dn=Date.now()-1000;   /* drop the fixture's future stamp */
  ed().innerHTML='<div>base</div>';
  ed().dispatchEvent(new win.Event('input',{bubbles:true}));
  AA.save(); await AA.syncCycle({}); await wait(40);
  let drift=0;
  for(const op of ['a','b','c','<','d','<','<','e','f','<']){
    if(op==='<') rubbed(1); else typed(op);
    await AA.syncCycle({}); await wait(15);
    if(body()!==ed().textContent||cbody()!==body()) drift++;
  }
  ok(drift===0,'through a burst of typing and deleting, with a sync cycle after every '+
    'keystroke, state, screen and cloud never disagree ('+drift+' disagreements)');
  ok(body()==='baseae','and the burst ends with exactly what was typed ('+body()+')');
  win.close();
}

console.log('— Notes: a stale editor cannot write over a live one —');
{
  /* The other half of the reported revert: a render landing between the DOM mutation
     and the serialization, writing an older body back over a newer one. It cannot
     reach state, and the reason is worth pinning: the input listener is delegated on
     document, and a rebuilt view leaves the old editor detached, so its events never
     bubble anywhere. Anything that moves that listener onto the element itself
     re-opens this. */
  S().notes=[{id:'nx',title:'Alpha',body:'alpha body',up:1,dn:1,pos:1},
             {id:'ny',title:'Beta',body:'beta body',up:2,dn:2,pos:2}];
  S().settings.view='notes'; S().settings.noteSel='nx';
  A.render(); await wait(25);
  const old=q('#noteBody');
  old.firstChild.firstChild.data='alpha body edited';   /* the engine has just typed */
  A.render(); await wait(20);                            /* a foreign render lands first */
  ok(q('#noteBody')!==old,'the view was rebuilt under the pending keystroke');
  old.dispatchEvent(new w.Event('input',{bubbles:true}));
  await wait(10);
  ok(S().notes[0].body==='alpha body','the detached editor cannot write to state');
  ok(S().notes[0].body===q('#noteBody').textContent,'state and screen still agree');
  /* and with the selection moved on, it cannot write into the note now open either */
  click('.noterow[data-id="ny"]'); await wait(25);
  old.dispatchEvent(new w.Event('input',{bubbles:true}));
  await wait(10);
  ok(S().notes.find(n=>n.id==='ny').body==='beta body',
    'nor leak one note into another when the selection has moved');
  S().settings.view='board'; A.render(); await wait(20);
}

console.log('— Notes: undo and redo —');
{
  /* Why a hand-rolled stack rather than the browser's: measured in real Chrome and
     re-measured by tests/viewports.js. renderNotes rebuilds #noteBody, and a fresh
     element starts with an EMPTY native stack, so every foreign render wiped undo and
     the 25s sync poll is a foreign render; and the input handler's live patch of the
     row label and the meta line, a textContent write outside the editable, collapses
     Chrome's typing coalescing to one character per press. Both are disqualifying. */
  const put=(node,off)=>{ const r=doc.createRange(); r.setStart(node,off); r.collapse(true);
    const s=w.getSelection(); s.removeAllRanges(); s.addRange(r) };
  /* the first text node under a node: a plain body renders as <div>text</div>, so the
     caret belongs in the text, never in the block that holds it */
  const tx=n=>{ while(n&&n.nodeType!==3) n=n.firstChild; return n };
  const atEnd=ed=>{ const t=tx(ed); put(t,t.length) };
  /* type into the editor the way the engine would, then raise the input the app hears */
  const typeIn=(ed,txt)=>{
    txt.split('').forEach(ch=>{
      const r=w.getSelection().getRangeAt(0), n=r.startContainer, o=r.startOffset;
      if(n.nodeType===3){ n.data=n.data.slice(0,o)+ch+n.data.slice(o); put(n,o+1) }
      else { const t=doc.createTextNode(ch); n.appendChild(t); put(t,1) }
      fire(ed,'input');
    });
  };
  const undo=()=>q('#noteBody').dispatchEvent(new w.KeyboardEvent('keydown',
    {key:'z',ctrlKey:true,bubbles:true}));
  const key=o=>q('#noteBody').dispatchEvent(new w.KeyboardEvent('keydown',
    Object.assign({key:'z',bubbles:true},o)));
  const bodyOf=id=>S().notes.find(n=>n.id===id).body;
  /* one note, one editor, caret at the end: every scenario below starts clean rather
     than inheriting the last one's history */
  const openNote=async(id,body)=>{
    S().notes=[{id:id,title:id,body:body,up:1,dn:1,pos:1}];
    S().settings.view='notes'; S().settings.noteSel=id;
    A.render(); await wait(25);
    const ed=q('#noteBody'); ed.focus();
    if(tx(ed)) atEnd(ed); else { const t=doc.createTextNode(''); ed.appendChild(t); put(t,0) }
    return ed;
  };

  { /* a step is a WORD, not a character: the whole reason for the hand-rolled stack */
    const ed=await openNote('u1','seed');
    typeIn(ed,' one two'); await wait(10);
    ok(bodyOf('u1')==='seed one two','the typing landed ('+bodyOf('u1')+')');
    undo(); await wait(10);
    ok(bodyOf('u1')==='seed one','one step back drops a whole word, not a character');
    ok(q('#noteBody').textContent==='seed one','and the editor shows it');
    undo(); await wait(10);
    ok(bodyOf('u1')==='seed','a second step goes back another word');
    undo(); await wait(10);
    ok(bodyOf('u1')==='seed','and the bottom of the history holds, no crash');
    ok(!!q('#noteBody'),'the editor is still standing at the bottom');
  }

  { /* redo, in all the spellings the two platforms use */
    const ed=await openNote('u2','seed');
    typeIn(ed,' one two'); await wait(10);
    key({ctrlKey:true,key:'Z'}); await wait(10);
    ok(bodyOf('u2')==='seed one',
      'the letter is matched either case, so Shift\'s capital still reaches undo');
    undo(); await wait(10);
    ok(bodyOf('u2')==='seed','wound all the way back');
    key({ctrlKey:true,key:'y'}); await wait(10);
    ok(bodyOf('u2')==='seed one','Ctrl+Y redoes one step');
    key({ctrlKey:true,shiftKey:true}); await wait(10);
    ok(bodyOf('u2')==='seed one two','Ctrl+Shift+Z redoes the next');
    key({ctrlKey:true,shiftKey:true}); await wait(10);
    ok(bodyOf('u2')==='seed one two','and stops at the newest state, it does not wrap');
    undo(); undo(); await wait(10);
    ok(bodyOf('u2')==='seed','Ctrl+Z winds back again');
    key({metaKey:true,shiftKey:true}); await wait(10);
    ok(bodyOf('u2')==='seed one','Cmd+Shift+Z redoes on a Mac');
    key({metaKey:true}); await wait(10);
    ok(bodyOf('u2')==='seed','and Cmd+Z undoes');
  }

  { /* a fresh edit clears the redo branch, the way every editor does */
    const ed=await openNote('u5','seed');
    typeIn(ed,' one two'); await wait(10);
    undo(); await wait(10);
    ok(bodyOf('u5')==='seed one','one step back, with a redo waiting');
    atEnd(q('#noteBody')); typeIn(q('#noteBody'),'!'); await wait(10);
    ok(bodyOf('u5')==='seed one!','a new edit lands on the current state');
    key({ctrlKey:true,key:'y'}); await wait(10);
    ok(bodyOf('u5')==='seed one!','redo is gone once a new edit is made');
  }

  { /* the caret comes back with the text it belongs to */
    const ed=await openNote('u6','alpha');
    typeIn(ed,' beta'); await wait(10);
    typeIn(q('#noteBody'),' gamma'); await wait(10);
    ok(bodyOf('u6')==='alpha beta gamma','two words typed');
    undo(); await wait(10);
    ok(bodyOf('u6')==='alpha beta','one step back');
    const r=w.getSelection().getRangeAt(0);
    ok(q('#noteBody').contains(r.startContainer),'undo leaves the caret inside the editor');
    ok(r.startOffset===10,'at the character the step was taken from ('+r.startOffset+')');
  }

  { /* the boundary: switching notes starts a fresh history, it never undoes backwards
       into the note before it */
    S().notes=[{id:'b1',title:'First',body:'first body',up:1,dn:1,pos:2},
               {id:'b2',title:'Second',body:'second body',up:1,dn:1,pos:1}];
    S().settings.view='notes'; S().settings.noteSel='b1';
    A.render(); await wait(25);
    let ed=q('#noteBody'); ed.focus(); atEnd(ed);
    typeIn(ed,' edited one'); await wait(10);
    ok(bodyOf('b1')==='first body edited one','the first note took its edit');
    click('.noterow[data-id="b2"]'); await wait(25);
    ed=q('#noteBody'); ed.focus(); atEnd(ed);
    typeIn(ed,' edited two'); await wait(10);
    ok(bodyOf('b2')==='second body edited two','the second note took its own');
    for(let i=0;i<10;i++){ undo(); await wait(5) }
    await wait(10);
    ok(bodyOf('b2')==='second body','undo walks back to where the second note started');
    ok(bodyOf('b1')==='first body edited one','and never reaches into the note before it');
    ok(q('#noteBody').textContent==='second body','the editor still shows the note that is open');
    /* and back: the first note's own history did not survive the trip either */
    click('.noterow[data-id="b1"]'); await wait(25);
    undo(); await wait(10);
    ok(bodyOf('b1')==='first body edited one',
      'returning to a note does not offer steps back into an older visit');
  }

  { /* THE SYNC RULE. A merge writes a body without passing the tracker, so the
       history is stale by definition. Undo must refuse rather than resurrect this
       device's pre-merge text over text that just arrived from the other one. */
    const ed=await openNote('m1','seed');
    typeIn(ed,' local words here'); await wait(10);
    ok(bodyOf('m1')==='seed local words here','local typing before the merge');
    S().notes.find(n=>n.id==='m1').body='body from the other device';   /* the merge lands */
    A.render(); await wait(25);                                          /* the foreign render */
    ok(q('#noteBody').textContent==='body from the other device','the foreign body is on screen');
    undo(); await wait(10);
    ok(bodyOf('m1')==='body from the other device',
      'an undo after a foreign body refuses rather than overwriting it ('+bodyOf('m1')+')');
    ok(q('#noteBody').textContent==='body from the other device','and the screen still agrees');
    /* the history re-seeds on what arrived, so editing carries straight on */
    atEnd(q('#noteBody')); typeIn(q('#noteBody'),' mine'); await wait(10);
    ok(bodyOf('m1')==='body from the other device mine','typing resumes on the merged text');
    undo(); await wait(10);
    ok(bodyOf('m1')==='body from the other device',
      'and the next undo works again, back to the merged text');
  }

  { /* a foreign render that does NOT change the body must not cost a step: the 25s
       poll usually agrees with what is on screen and fires all day */
    const ed=await openNote('m2','seed');
    typeIn(ed,' kept words'); await wait(10);
    A.render(); await wait(25);
    undo(); await wait(10);
    ok(bodyOf('m2')==='seed kept','a foreign render that agrees keeps the history usable');
    undo(); await wait(10);
    ok(bodyOf('m2')==='seed','and the step before it as well');
  }

  { /* the bound: the stack is capped, the oldest steps fall off, it never grows free */
    const ed=await openNote('u3','');
    for(let i=0;i<90;i++) typeIn(ed,'w'+i+' ');
    await wait(10);
    const deep=w.A.ui.noteHist.past.length;
    ok(deep<=60,'the history is bounded at 60 steps ('+deep+')');
    ok(deep>=55,'and it really did fill up ('+deep+')');
    const words=bodyOf('u3').trim().split(/\s+/).length;
    for(let i=0;i<200;i++){ undo(); await wait(0) }
    await wait(10);
    const left=bodyOf('u3').trim().split(/\s+/).length;
    ok(left<words,'undoing past the bound stops cleanly ('+left+' of '+words+' words left)');
    ok(left>0,'and it stops at the oldest step it still holds, not at nothing');
    ok(!!q('#noteBody'),'the editor is still standing');
  }

  { /* undo is the editor's key only: the title must not lose the body */
    const ed=await openNote('u4','first second');
    typeIn(ed,' third'); await wait(10);
    q('#noteTitle').dispatchEvent(new w.KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}));
    await wait(10);
    ok(bodyOf('u4')==='first second third','Ctrl+Z in the title does not undo the body');
    q('#noteSearch').dispatchEvent(new w.KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}));
    await wait(10);
    ok(bodyOf('u4')==='first second third','nor does Ctrl+Z in the search box');
  }

  /* ---- the toolbar's step buttons: the chords do not exist on a phone ---- */
  const ub=()=>q('#noteTools .ntb[data-cmd="undo"]');
  const rb=()=>q('#noteTools .ntb[data-cmd="redo"]');

  { /* they exist, they are real buttons, and neither renders blank */
    await openNote('tb1','seed');
    ok(!!ub()&&!!rb(),'the toolbar carries an undo and a redo button');
    ok(ub().tagName==='BUTTON'&&rb().tagName==='BUTTON','both are real buttons, not glyphs on a div');
    ok((ub().getAttribute('aria-label')||'').trim()==='Undo','the undo button is named');
    ok((rb().getAttribute('aria-label')||'').trim()==='Redo','the redo button is named');
    ok(!!ub().getAttribute('title')&&!!rb().getAttribute('title'),'both carry a tooltip as well');
    ok(ub().innerHTML.includes('<svg')&&rb().innerHTML.includes('<svg'),'drawn as inline SVG');
    ok(!/[\u{1F300}-\u{1FAFF}\u{2700}-\u{27BF}]/u.test(ub().innerHTML+rb().innerHTML),'and no emoji');
    ok(ub().classList.contains('ntb')&&rb().classList.contains('ntb'),
      'both carry .ntb, so they inherit the 44px coarse target and the mousedown contract');
    ok(q('#noteTools').contains(ub())&&q('#noteTools').contains(rb()),'both sit in the toolbar row');
  }

  { /* the guard at both ends: unavailable rather than sitting there doing nothing */
    const ed=await openNote('tb2','seed');
    ok(ub().disabled===true,'a note just opened has nothing to undo, so Undo is unavailable');
    ok(rb().disabled===true,'and nothing to redo either');
    const before=bodyOf('tb2');
    rb().click(); ub().click(); await wait(10);
    ok(bodyOf('tb2')===before,'pressing either dead button does nothing at all');
    typeIn(ed,' one'); await wait(10);
    ok(ub().disabled===false,'the first finished word makes Undo available');
    ok(rb().disabled===true,'while Redo stays unavailable, nothing has been undone yet');
    ub().click(); await wait(10);
    ok(bodyOf('tb2')==='seed','the press took the step');
    ok(ub().disabled===true,'back at the bottom, Undo reads unavailable again');
    ok(rb().disabled===false,'and Redo has become available');
    typeIn(q('#noteBody'),' two'); await wait(10);
    ok(rb().disabled===true,'a fresh edit kills the redo branch and the button follows');
  }

  { /* TEN STEPS IN EACH DIRECTION, driven by the buttons alone */
    const ed=await openNote('tb3','');
    typeIn(ed,'a1 a2 a3 a4 a5 a6 a7 a8 a9 a10 '); await wait(10);
    const full=bodyOf('tb3'), deep=w.A.ui.noteHist.past.length;
    ok(deep>=10,'ten finished words are at least ten steps ('+deep+')');
    /* the run the requirement names: ten presses, ten whole words gone */
    for(let i=0;i<10;i++){ ub().click(); await wait(4) }
    await wait(10);
    ok(bodyOf('tb3')==='a1','ten presses of Undo walk back ten whole steps ('+bodyOf('tb3')+')');
    /* and on to the true bottom, counting, so the depth is measured rather than assumed */
    let back=10;
    while(!ub().disabled&&back<200){ ub().click(); await wait(2); back++ }
    await wait(10);
    ok(back>=10,'the history holds at least ten steps back ('+back+')');
    ok(ub().disabled===true,'at the bottom Undo reads unavailable');
    ok(bodyOf('tb3')==='','and the bottom is the note as it was opened');
    ok(rb().disabled===false,'with every one of those steps waiting on Redo');
    let fwd=0;
    while(!rb().disabled&&fwd<200){ rb().click(); await wait(2); fwd++ }
    await wait(10);
    ok(fwd===back,'Redo climbs exactly as many steps as Undo took ('+fwd+' of '+back+')');
    ok(fwd>=10,'which is at least ten forward as well ('+fwd+')');
    ok(bodyOf('tb3')===full,'and lands on the text the run started from');
    ok(q('#noteBody').textContent===full,'the editor shows it');
    ok(rb().disabled===true,'Redo is spent');
    ok(ub().disabled===false,'while Undo is live again, so the run is repeatable');
  }

  { /* ONE history, not two: a chord and a button wind the same stack */
    const ed=await openNote('tb4','');
    typeIn(ed,'one two three four '); await wait(10);
    const full=bodyOf('tb4');
    undo(); await wait(10);                      /* chord */
    ub().click(); await wait(10);                /* button */
    ok(bodyOf('tb4')==='one two three',
      'a chord then a button are two steps of ONE stack, not one step each of two ('+bodyOf('tb4')+')');
    rb().click(); await wait(10);                /* button redoes the chord's step */
    ok(bodyOf('tb4')==='one two three four','the button redoes the step the chord took');
    key({ctrlKey:true,key:'y'}); await wait(10); /* chord redoes the button's step */
    ok(bodyOf('tb4')===full,'and the chord redoes the step the button took');
    ok(rb().disabled===true,'the button reads the same exhausted stack the chord emptied');
    key({ctrlKey:true,key:'y'}); await wait(10);
    ok(bodyOf('tb4')===full,'a chord past the end changes nothing');
    ok(rb().disabled===true,'and leaves the button unavailable');
  }

  { /* the caret after a BUTTON undo: text without a caret is half a feature */
    const ed=await openNote('tb5','alpha');
    typeIn(ed,' beta'); await wait(10);
    typeIn(q('#noteBody'),' gamma'); await wait(10);
    ok(bodyOf('tb5')==='alpha beta gamma','two words typed');
    ub().click(); await wait(10);
    ok(bodyOf('tb5')==='alpha beta','the button took one step back');
    const r=w.getSelection().getRangeAt(0);
    ok(q('#noteBody').contains(r.startContainer),'the caret is inside the editor after a button undo');
    ok(r.startOffset===10,'at the character the step was taken from ('+r.startOffset+')');
    ok(doc.activeElement===q('#noteBody'),
      'and the editor holds focus, so the next keystroke lands where the word came out');
    typeIn(q('#noteBody'),'!'); await wait(10);
    ok(bodyOf('tb5')==='alpha beta!','which it does');
  }

  { /* Section 4's contract. An undo fired against a lost selection restores text with
       nowhere to put the caret, so the press must never blur the editor. */
    const ed=await openNote('tb6','seed');
    typeIn(ed,' one'); await wait(10);
    const md=el=>{ const e=new w.MouseEvent('mousedown',{bubbles:true,cancelable:true});
      el.dispatchEvent(e); return e.defaultPrevented };
    ok(md(ub())===true,'mousedown on Undo is prevented, so the editor keeps focus and selection');
    ok(rb().disabled===true,'Redo is unavailable at this point');
    ok(md(q('#noteTools'))===true,
      'and the strip itself prevents it, so a press on a dead button cannot blur the editor either');
    ok(/\.ntb\[disabled\][^}]*pointer-events:none/.test(html),
      'a disabled step button is pointer-transparent, which is what routes that press to the strip');
    ok(md(q('#notePage'))===false,'the page select keeps its default, so its dropdown still opens');
  }

  { /* the buttons obey the sync rule for free, because they call the same function */
    const ed=await openNote('tb7','seed');
    typeIn(ed,' local words'); await wait(10);
    S().notes.find(n=>n.id==='tb7').body='from the other device';
    A.render(); await wait(25);
    ok(ub().disabled===true,
      'after a foreign body the button reads unavailable rather than offering a step that would refuse');
    ub().click(); await wait(10);
    ok(bodyOf('tb7')==='from the other device','and a press cannot overwrite what just arrived');
  }
  S().settings.view='board'; A.render(); await wait(20);
}

console.log('— Notes: a dash and a space become a bullet —');
{
  const put=(node,off)=>{ const r=doc.createRange(); r.setStart(node,off); r.collapse(true);
    const s=w.getSelection(); s.removeAllRanges(); s.addRange(r) };
  const space=()=>q('#noteBody').dispatchEvent(
    new w.KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true}));
  const bodyOf=id=>S().notes.find(n=>n.id===id).body;

  S().notes=[{id:'d1',title:'Dash',body:'',up:1,dn:1,pos:1}];
  S().settings.view='notes'; S().settings.noteSel='d1';
  A.render(); await wait(25);
  let ed=q('#noteBody'); ed.focus();

  /* a lone dash opening a line, then a space */
  ed.innerHTML='<div>-</div>'; fire(ed,'input'); await wait(10);
  put(ed.firstChild.firstChild,1);
  space(); await wait(10);
  ok(bodyOf('d1')==='<ul class="dash"><li><br></li></ul>',
    'a dash and a space open a list item ('+bodyOf('d1')+')');
  ok(!!q('#noteBody ul.dash>li'),'and the shape on screen is the app\'s own dash list');
  ok(!q('#noteBody ul:not(.dash)'),'never a second list type');
  { const r=w.getSelection().getRangeAt(0);
    ok(q('#noteBody li').contains(r.startContainer)||r.startContainer===q('#noteBody li'),
      'the caret sits inside the new bullet'); }

  /* the same space, twice more, walks back out and leaves the literal dash */
  space(); await wait(10);   /* the first space simply lands in the empty bullet */
  ok(/^<ul class="dash">/.test(bodyOf('d1')),'one space alone stays in the list');
  { const li=q('#noteBody li');
    li.textContent=' ';       /* the engine's first space, which jsdom does not insert */
    put(li.firstChild,1); }
  space(); await wait(10);
  ok(bodyOf('d1')==='- ','a second space leaves the list and leaves a literal dash ('+
    JSON.stringify(bodyOf('d1'))+')');
  ok(!q('#noteBody ul'),'the list is gone entirely when its last item leaves');

  /* the round trip is lossless: what is left behind is exactly what was typed to get
     in, so the same two keys open the list again */
  ok(q('#noteBody').textContent==='- ','the line left behind reads as the typed dash');
  ed=q('#noteBody');
  ed.innerHTML='<div>-</div>'; fire(ed,'input'); await wait(10);
  put(ed.firstChild.firstChild,1);
  space(); await wait(10);
  ok(bodyOf('d1')==='<ul class="dash"><li><br></li></ul>',
    'and the very same dash opens the list again ('+bodyOf('d1')+')');

  /* mid-list: the bullet leaving takes only itself, the items above and below stay */
  ed.innerHTML='<ul class="dash"><li>one</li><li> </li><li>three</li></ul>';
  fire(ed,'input'); await wait(10);
  { const li=q('#noteBody li:nth-child(2)'); put(li.firstChild,1); }
  space(); await wait(10);
  ok(bodyOf('d1')==='<ul class="dash"><li>one</li></ul><div>- </div><ul class="dash"><li>three</li></ul>',
    'an empty bullet in the middle steps out between its neighbours ('+bodyOf('d1')+')');

  /* the trigger is narrow on purpose: a dash that is not alone on the line is text */
  ed.innerHTML='<div>a - b</div>'; fire(ed,'input'); await wait(10);
  put(ed.firstChild.firstChild,3);
  ok(space()===true,'a dash inside a line does not claim the space');
  await wait(10);
  ok(bodyOf('d1')==='a - b','and the line is left as ordinary text');
  ed.innerHTML='<div>first</div><div>-</div>'; fire(ed,'input'); await wait(10);
  put(ed.children[1].firstChild,1);
  space(); await wait(10);
  ok(bodyOf('d1')==='<div>first</div><ul class="dash"><li><br></li></ul>',
    'a dash opening the SECOND line converts that line only ('+bodyOf('d1')+')');

  /* already inside a list, "- " is just text: no nested list, no new stored shape */
  ed.innerHTML='<ul class="dash"><li>-</li></ul>'; fire(ed,'input'); await wait(10);
  put(q('#noteBody li').firstChild,1);
  ok(space()===true,'a dash inside a bullet does not convert again');
  await wait(10);
  ok(bodyOf('d1')==='<ul class="dash"><li>-</li></ul>','the list is left exactly as it was');

  /* the conversion is one undo step, so it is as easy to leave as to reach */
  ed.innerHTML='<div>-</div>'; fire(ed,'input'); await wait(10);
  put(ed.firstChild.firstChild,1);
  space(); await wait(10);
  ok(/^<ul class="dash">/.test(bodyOf('d1')),'converted, ready to undo');
  q('#noteBody').dispatchEvent(new w.KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}));
  await wait(10);
  ok(bodyOf('d1')==='-','one undo takes the conversion back to the dash ('+
    JSON.stringify(bodyOf('d1'))+')');
  S().settings.view='board'; A.render(); await wait(20);
}

console.log('— Notes: the spellcheck underline is the browser\'s, not ours —');
{
  /* Change 4 asked for the red squiggle to clear when a word is finished with a
     space. It cannot be done, and nothing here pretends otherwise: the mark is drawn
     by the browser's own spellchecker in a layer no page can read or repaint. What
     the app CAN do is leave the checker switched on and get out of its way, and that
     is what these pin: spellcheck is never disabled behind the user's back. */
  S().notes=[{id:'s1',title:'Spell',body:'teh quick brown',up:1,dn:1,pos:1}];
  S().settings.view='notes'; S().settings.noteSel='s1';
  A.render(); await wait(25);
  const ed=q('#noteBody');
  ok(ed.getAttribute('spellcheck')===null,
    'the editor carries no spellcheck attribute, so it inherits the browser default: on');
  /* the ONE element that legitimately opts out is the sync key box, where the value is
     a random string and every one of them would be flagged. Anything else opting out
     would be the disable-it-and-say-nothing workaround this change refused to ship. */
  const offs=(html.match(/spellcheck\s*=\s*["']false["']/g)||[]).length;
  ok(offs===1,'exactly one element in the file opts out of spellcheck ('+offs+')');
  ok(/id="syncKeyIn"[^>]*spellcheck="false"/.test(html),'and it is the sync key box, not the editor');
  ok(!/\.spellcheck\s*=\s*false/.test(html),'no script switches spellcheck off at runtime');
  ok(!/spellcheck/.test(html.slice(html.indexOf('id="noteBody"'),html.indexOf('id="noteBody"')+400)),
    'the note editor markup never mentions it at all');
  S().settings.view='board'; A.render(); await wait(20);
}

console.log('— placement: rail on desktop, board bottom on a phone —');
{
  const phone=new JSDOM(html,{runScripts:'dangerously',url:'http://localhost/',pretendToBeVisual:true,
    beforeParse(win){
      Object.defineProperty(win,'innerWidth',{value:390,writable:true,configurable:true});
      Object.defineProperty(win,'innerHeight',{value:844,writable:true,configurable:true});
    }});
  const pw2=phone.window, pd2=pw2.document; await wait(300);
  const pq2=s=>pd2.querySelector(s);
  ok(!!pq2('#habits .hpanel'),'a phone keeps the habits band under the day column');
  ok(!!pq2('#weekMobile .wcard'),'and the weekly list right under it');
  ok(pq2('#habitsRail').innerHTML===''&&pq2('#weekRail').innerHTML==='','with the rail hosts empty');
  /* a fresh device holds nothing, so both bands sit as header bars in this placement too */
  ok(!pq2('#habitAdd')&&!pq2('#weekAdd'),'both empty bands start as header bars');
  pq2('#habits [data-action="habit-toggle"]').click(); await wait(30);
  ok(!!pq2('#habitAdd'),'the habits header opens the empty band in the phone placement');
  pq2('#habits [data-action="habit-toggle"]').click(); await wait(30);
  ok(!pq2('#habitAdd'),'and closes it again');
  pq2('#weekMobile [data-action="week-toggle"]').click(); await wait(30);
  ok(!!pq2('#weekAdd'),'the weekly header opens the same way');
  /* with a habit defined the persisted manual collapse governs, exactly as before */
  pw2.A.state.habits.list.push({id:'ph1',name:'stretch',days:[1,2,3,4,5,6],up:Date.now()});
  pw2.A.save(); pw2.A.render(); await wait(30);
  ok(!!pq2('#habitAdd'),'a band holding a habit renders expanded');
  pq2('#habits [data-action="habit-toggle"]').click(); await wait(30);
  ok(pw2.A.state.settings.habitsOpen===false,'manual collapse still remembers, per device');
  pq2('#habits [data-action="habit-toggle"]').click(); await wait(30);
  ok(pw2.A.state.settings.habitsOpen!==false,'and reopens');
}

console.log('— no interactive element renders blank —');
{
  S().settings.view='board'; S().settings.floatMode=false; A.render(); await wait(20);
  ok(qa('#habitsRail button,#weekRail button').length>0&&
    qa('#habitsRail button,#weekRail button').every(b=>b.textContent.trim().length>0),
    'every habits and weekly control has visible text');
  const blank=qa('button').filter(b=>!b.textContent.trim()&&!(b.getAttribute('aria-label')||'').trim());
  ok(blank.length===0,'no button anywhere on the board renders with an empty label');
  /* inputs cannot label themselves with text content: they need a placeholder, an
     aria-label or a title. The 2026-08-10 viewport pass caught both date inputs bare. */
  const bare=qa('input,select,textarea').filter(el=>el.id!=='fileIn'&&
    !(el.getAttribute('aria-label')||'').trim()&&!(el.getAttribute('title')||'').trim()&&
    !(el.getAttribute('placeholder')||'').trim()&&el.tagName!=='SELECT');
  ok(bare.length===0,'no input on the board is missing a label ('+
    bare.map(e=>e.id||e.className).join(', ')+')');
  ok((q('#jumpDate').getAttribute('aria-label')||'').length>0,'the Jump to date input carries an aria-label');
  const anyTask=qa('.task .ttl[data-id]')[0];
  if(anyTask){ anyTask.click(); await wait(25); }
  const pick=q('input[data-action="pickdate"]');
  ok(!!pick&&(pick.getAttribute('aria-label')||'').length>0,'the per-task date input carries an aria-label');
}

console.log('— the copy pass: the lines that stopped rendering —');
{
  /* 2026-08-14: a removal pass over text the app was saying about itself. Every one of
     these was a rendered string inside an element of its own, and the ELEMENT went with
     the string: an emptied .meta keeps its 3px margin and an emptied .lockmsg keeps its
     padding, so either would hold a band of canvas exactly where the sentence was, which
     is the trap the `:not(:empty)` contract closes for the render slots. What is pinned
     here is the absence, and the name every control had to keep once its visible label
     was gone. Nothing about the counts themselves changed: the zone header still shows
     .zh .n, the rail bars still show theirs, and state is untouched. */
  /* this block rewrites a day, both rail panels and the tray to reach every removal,
     so it hands the planner back exactly as it found it: a later block reads the
     saved bytes and the state signature and must not see any of this. */
  const KEEP=['days','habits','week','focus','carry','settings'];
  const snap=JSON.parse(JSON.stringify(KEEP.reduce((o,k)=>(o[k]=S()[k],o),{})));
  S().settings.view='board'; S().settings.floatMode=false;
  S().days[T()]={must:[{id:'cp1',title:'a prio 0',done:false,subtasks:[]}],
    should:[{id:'cp2',title:'a prio 1',done:true,subtasks:[]}],extra:[]};
  A.render(); await wait(25);
  ok(!q('.col[data-day] .colhead .meta'),'a day header draws no tally element at all');
  ok(!/nothing planned/.test(q('#board').textContent),'"nothing planned" is gone from the board');
  ok(!/\d+ of \d+ done/.test(q('#board').textContent),'and so is "N of N done"');
  ok(!!q('.zone[data-day="'+T()+'"][data-zone="must"] .zh .n'),
    'the per-zone count on the zone header is untouched');
  /* the Extra lock drops BOTH sentences: the one that only editorialised and the one
     that explained the rule. The glyph is the whole locked state now, and the .lockmsg
     element goes with the string in either case, Prio 0 on the day or not. */
  const exL=q('.zone[data-day="'+T()+'"][data-zone="extra"]');
  ok(exL.classList.contains('locked')&&!!exL.querySelector('.zh .lk'),
    'a locked Extra with a Prio 0 on the day is locked and shows the lock glyph');
  ok(!exL.querySelector('.lockmsg')&&!/Opens when every Prio 0 is ticked/.test(exL.textContent),
    'and no longer says what unlocks it, the .lockmsg element included');
  S().days[T()].must=[]; A.render(); await wait(25);
  const ex=q('.zone[data-day="'+T()+'"][data-zone="extra"]');
  ok(ex.classList.contains('locked')&&!!ex.querySelector('.zh .lk'),
    'with no Prio 0 the zone is still locked and still shows the glyph');
  ok(!ex.querySelector('.lockmsg')&&!/Free time is earned/.test(q('#board').textContent),
    'and says nothing there either');
  ok(!/Opens when every Prio 0 is ticked/.test(q('#board').textContent),
    'the lock sentence is off the board entirely');
  /* the inline add: a plus, and a name that is not the plus */
  const za=q('.zadd');
  ok(!!za&&za.textContent.trim()==='+','the inline add control is the plus alone');
  ok((za.getAttribute('aria-label')||'').trim().length>0,
    'and carries an accessible name, or the blank-label sweep above would have it');
  ok(!/\+ add/.test(q('#board').textContent),'the word "add" is off the board');
  /* the two rail fields: bare, named where only a screen reader looks */
  S().habits.list=[{id:'cph',name:'a habit',days:[1,2,3,4,5,6]}];
  S().week.list=[{id:'cpw',title:'a week item',done:false}];
  S().settings.habitsOpen=true; S().settings.weekOpen=true;
  A.render(); await wait(25);
  const hi=q('#habitAdd'), wi=q('#weekAdd');
  ok(!!hi&&!hi.getAttribute('placeholder'),'the habits field shows no placeholder');
  ok((hi.getAttribute('aria-label')||'').trim().length>0,'and is named by aria-label instead');
  ok(!!wi&&!wi.getAttribute('placeholder'),'the weekly field shows no placeholder');
  ok((wi.getAttribute('aria-label')||'').trim().length>0,'and is named the same way');
  /* the app's own source sits in a <script> in the body, so read what is DRAWN */
  const shown=()=>qa('body > *:not(script)').map(e=>e.textContent).join(' ');
  ok(!/Add a habit|Sometime this week/.test(shown()),
    'neither placeholder string is drawn anywhere');
  /* the collapsed-panel bars are a DIFFERENT line and were NOT part of this pass */
  S().habits.list=[]; S().week.list=[]; S().focus=[];
  delete A.ui.peek.habits; delete A.ui.peek.week; delete A.ui.peek.focus; A.ui.northOn=false;
  A.render(); await wait(25);
  ok(/0 habits/.test(q('#habitsRail').textContent),'the habits bar still counts "0 habits"');
  ok(/0 open/.test(q('#weekRail').textContent),'the weekly bar still says "0 open"');
  ok(/not set/.test(q('#fpanel').textContent),'and True north still says "not set"');
  /* the tray keeps its heading and every triage control; only the sentence went.
     Opened for the check, since a collapsed bar deliberately draws no controls. */
  S().carry=[{id:'cy1',title:'left over',from:'Mon 1 Jun'}];
  S().settings.trayOpen=true; A.render(); await wait(25);
  ok(!!q('#tray .trayhead'),'the carry-over tray still draws its head');
  ok(!q('#tray .why')&&!/unfinished from before/.test(q('#tray').textContent),
    'without the sentence under it');
  ok(qa('#tray .trayhead .tbtn').length===2&&qa('#tray .trayitem').length===1,
    'and both move-all controls and the item itself are still there');
  ok(S().carry.length===1,'the roll is untouched: carry still holds what it held');
  /* free floating: the tab head is its name and its controls */
  S().settings.floatMode=true; A.render(); await wait(25);
  ok(qa('.col.backlog').length>0&&!q('.col.backlog .colhead .meta'),
    'a Free Floating tab head draws no open count');
  ok(!/\d+ open/.test(q('#board').textContent),'"(N) open" is gone from the tabs');
  ok(!!q('.col.backlog .colhead .dow'),'the tab name is still there');
  /* hand it all back, then commit so no debounced write from here lands later */
  KEEP.forEach(k=>{ S()[k]=snap[k] });
  A.render(); await wait(25); A.save(); await wait(20);
}

console.log('— touch targets: the coarse-pointer block —');
{
  /* jsdom does no layout, so the geometry itself is verified by tests/viewports.js in
     real Chrome (four profiles, 2026-08-10). What can regress silently here is the
     block's existence: every rule below is what keeps a finger target at 44px. */
  const css=html.slice(0,html.indexOf('</style>'));
  const block=css.slice(css.indexOf('@media (pointer:coarse)'));
  ok(block.length>100,'the coarse-pointer touch block exists');
  ok(/\.box::before\{content:'';position:absolute;inset:/.test(block),
    'tick boxes grow an invisible hit overlay');
  ok(/\.mini::before\{content:'';position:absolute;inset:/.test(block),
    'mini glyph buttons grow a hit overlay');
  ok(/\.ttl::before\{content:'';position:absolute;inset:-4px 0 -22px\}/.test(block),
    'task titles grow a downward-biased overlay (never up into the row above)');
  ok(/\.nbtn,\.tbtn,\.abtn,\.mrow button\{min-height:44px;min-width:44px\}/.test(block),
    'the glow-clipped button classes grow for real to 44px');
  ok(/\.hrcells \.box::before\{inset:-8px -12px -16px\}/.test(block),
    'rail habit cells may not reach up into the name and tools line');
  ok(/#rail \.railfoot button\{min-height:44px\}/.test(block),
    'the rail foot outranks the 42px width-media rule on touch');
  ok(/\.binrow \.nbtn\{min-height:44px\}/.test(block),
    'bin rows outrank their 40px width-media rule on touch');
  ok(/\.nact,\.ntb\{min-height:44px;min-width:44px\}/.test(block),
    'the quiet note actions AND the toolbar buttons grow to 44px on touch');
  ok(/#noteSearch/.test(block),'the notes search box is in the 44px input list');
  ok(/#notePage\{min-height:44px\}/.test(block),'the page select grows to 44px on touch');
}

console.log('— themes: the switch is instant, device-local, and invisible to state —');
{
  const tbtn=q('.railfoot [data-action="themes"]');
  ok(!!tbtn&&tbtn.textContent==='Theme','the rail foot offers the Theme control beside Help, Sync, Export, Import and Bin');
  click('.railfoot [data-action="themes"]'); await wait(25);
  ok(!!q('#themeModal'),'it opens the theme modal');
  const opts=qa('#themeModal [data-action="theme-set"]');
  ok(opts.length===2,'two options, no more');
  ok(opts.map(b=>b.textContent).join(',')==='Cloud blue,Monochrome','both named plainly');
  ok(opts[0].getAttribute('aria-pressed')==='true','the active theme is the marked one');
  ok(/never syncs/.test(q('#themeModal').textContent),'the modal says the choice stays on this device');

  const before={planner:w.localStorage.getItem('agora_dayplanner_v1'),sig:A.stateSig(S())};
  click('[data-action="theme-set"][data-t="mono"]'); await wait(25);
  ok(doc.documentElement.getAttribute('data-theme')==='mono','the attribute lands on <html> in the same frame, no reload');
  ok(w.localStorage.getItem('agora_dayplanner_theme')==='mono','the choice persists under its own localStorage key');
  ok(q('meta[name="theme-color"]').getAttribute('content')==='#070708','the PWA theme-color meta follows the theme');
  ok(w.localStorage.getItem('agora_dayplanner_v1')===before.planner,'the planner storage is byte-identical after the switch');
  ok(A.stateSig(S())===before.sig,'the state signature is untouched, so sync has nothing to push');
  ok(!('theme' in S())&&!('theme' in S().settings),'no theme field ever reaches state or settings');
  ok(A.MERGED_KEYS.indexOf('theme')<0,'the merge whitelist has never heard of it');
  ok(qa('#themeModal [data-action="theme-set"]')[1].getAttribute('aria-pressed')==='true','the modal marks the new choice at once');
  ok(A.themeGet()==='mono','themeGet answers the stored choice');

  click('[data-action="theme-set"][data-t="sky"]'); await wait(25);
  ok(doc.documentElement.getAttribute('data-theme')===null,'switching back removes the attribute entirely');
  ok(w.localStorage.getItem('agora_dayplanner_theme')==='sky','and stores the plain choice');
  ok(q('meta[name="theme-color"]').getAttribute('content')==='#CFE3F1','the meta returns to cloud blue');
  click('#themeModal [data-action="mclose"]'); await wait(25);
  ok(!q('#themeModal'),'Done closes the modal');
}

console.log('— themes: one variable set, no hardcoded colour, red confined —');
{
  const css=html.slice(html.indexOf('<style>'),html.indexOf('</style>'));
  const rootBlock=(css.match(/:root\{[^}]*\}/)||[''])[0];
  const monoBlock=(css.match(/:root\[data-theme="mono"\]\{[^}]*\}/)||[''])[0];
  ok(rootBlock.length>500&&monoBlock.length>500,'both theme blocks exist');
  const names=b=>[...b.matchAll(/--([a-z0-9-]+)\s*:/g)].map(m=>m[1]);
  const rootVars=new Set(names(rootBlock)), monoVars=names(monoBlock);
  const orphan=monoVars.filter(v=>!rootVars.has(v));
  ok(monoVars.length>40&&orphan.length===0,
    'mono re-declares '+monoVars.length+' variables and invents none of its own ('+orphan.join(',')+')');
  const CORE=['bg','canvas','panel','panel2','card','cloud','pearl','tasktile','line','line2',
    'txt','mut','mut2','navy','denim','ocean','teal','must','should','extra','done','today',
    'on','onpri','grad','gradf','shadow','scrim','railbg','bgfx','traybg','sheen','fdx','fbx',
    'ink-rgb','shd-rgb','denim-rgb','teal-rgb','today-rgb','pearl-rgb'];
  const missing=CORE.filter(v=>!monoVars.includes(v));
  ok(missing.length===0,'the mono block covers every core role ('+missing.join(',')+')');
  ok(!/--r:|--r2:|--rail:/.test(monoBlock),'mono changes colour and type only: radii and layout variables stay shared');
  /* the rest of the sheet reads variables only (comments are prose, not rules) */
  const body=css.replace(rootBlock,'').replace(monoBlock,'').replace(/\/\*[\s\S]*?\*\//g,'');
  const stray=(body.match(/#[0-9A-Fa-f]{6}\b|rgba?\((?!var\()[.0-9]/g)||[]);
  ok(stray.length===0,'no rule outside the theme blocks hardcodes a colour ('+stray.slice(0,4).join(' ')+')');
  /* the no-white rule holds inside the dark theme too */
  const monoClean=monoBlock.replace(/\/\*[\s\S]*?\*\//g,'');
  ok(!/#fff\b|#ffffff|255\s*,\s*255\s*,\s*255/i.test(monoClean),'nothing in the mono theme is pure white');
  const monoHex=[...monoClean.matchAll(/#([0-9A-Fa-f]{6})\b/g)].map(m=>m[1]);
  const maxCh=Math.max(...monoHex.flatMap(h=>[0,2,4].map(i=>parseInt(h.slice(i,i+2),16))));
  ok(maxCh<0xFF,'the brightest mono channel is 0x'+maxCh.toString(16).toUpperCase()+', short of pure white in every channel');
  /* red appears only where something must stand out. WIDENED DELIBERATELY on
     2026-08-12: --north (the True north statements) joined the list. The active
     nav accent added NOTHING here: it reuses --today, so mono gets its red and
     cloud blue its teal from one variable. Anything else red is still a failure. */
  const redDecls=[...monoClean.matchAll(/--([a-z0-9-]+)\s*:[^;]*#E8443C/gi)].map(m=>m[1]);
  const allowedRed=['done','today','grad','ring1','ring2','ring3','north'];
  ok(redDecls.length>0&&redDecls.every(v=>allowedRed.includes(v)),
    'red backs only completion, today, the primary action and the north statements ('+redDecls.join(',')+')');
  const redRgb=[...monoClean.matchAll(/--([a-z0-9-]+)\s*:[^;]*232\s*,\s*68\s*,\s*60/g)].map(m=>m[1]);
  ok(redRgb.join(',')==='today-rgb','the red channel triplet backs only the today tint');
  ok(!/#E8443C|232\s*,\s*68\s*,\s*60/i.test(rootBlock),'cloud blue never sees the red');
  /* flatness: the mono gradients are flat stand-ins, the washes and sheens are gone */
  ok(/--grad:linear-gradient\(135deg,#E8443C,#E8443C\)/.test(monoClean),'the mono primary fill is flat');
  ok(/--gradf:linear-gradient\(135deg,#E9E9EC,#E9E9EC\)/.test(monoClean),'the mono decorative fill is flat');
  ok(/--bgfx:none/.test(monoClean)&&/--sheen:none/.test(monoClean)&&/--sheen2:none/.test(monoClean),
    'the background washes and button sheens flatten to none');
  /* typography: the pixel face leads only the mono label stacks, fallbacks intact */
  ok(/--fdx:'Silkscreen','Space Grotesk'/.test(monoClean)&&/--fbx:'Silkscreen','Inter'/.test(monoClean),
    'mono label faces lead with Silkscreen and keep the sans chain behind it');
  ok(!/Silkscreen/.test(rootBlock),'cloud blue keeps its faces untouched');
  ok(/family=Silkscreen/.test(html),'Silkscreen loads through the same fonts link the app already uses');
  ok(/font-family:var\(--fdx\)/.test(body)&&/font-family:var\(--fbx\)/.test(body),
    'numerals and short labels read the themed faces');
  ok(!/#noteBody\{[^}]*var\(--fbx\)/.test(css)&&!/\.ttl\{[^}]*var\(--fbx\)/.test(css)&&!/\.modal p\{[^}]*var\(--fbx\)/.test(css),
    'body text never takes the dot-matrix face');
  /* the boot script applies the stored theme before the stylesheet exists */
  ok(html.indexOf('agora_dayplanner_theme')<html.indexOf('<style>'),'the head boot script runs before the stylesheet, so no flash');
}

console.log('— themes: WCAG contrast holds in both palettes —');
{
  const lin=c=>{c/=255;return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4)};
  const lum=h=>{h=h.replace('#','');return 0.2126*lin(parseInt(h.slice(0,2),16))+0.7152*lin(parseInt(h.slice(2,4),16))+0.0722*lin(parseInt(h.slice(4,6),16))};
  const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
  const css=html.slice(html.indexOf('<style>'),html.indexOf('</style>'));
  const readVars=b=>{const o={};[...b.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9A-Fa-f]{6})\b/g)].forEach(m=>o[m[1]]=m[2]);return o};
  const skyV=readVars((css.match(/:root\{[^}]*\}/)||[''])[0]);
  const monoV={...skyV,...readVars((css.match(/:root\[data-theme="mono"\]\{[^}]*\}/)||[''])[0])};
  const stops=b=>{const m=b.match(/--grad:linear-gradient\([^;]*\)/);return m?m[0].match(/#[0-9A-Fa-f]{6}/g):[]};
  const themes=[['cloud blue',skyV,stops((css.match(/:root\{[^}]*\}/)||[''])[0])],
                ['mono',monoV,stops((css.match(/:root\[data-theme="mono"\]\{[^}]*\}/)||[''])[0])]];
  for(const [name,v,gs] of themes){
    const pair=(f,b)=>ratio(v[f],v[b]);
    ok(pair('txt','pearl')>=4.5&&pair('txt','cloud')>=4.5&&pair('txt','tasktile')>=4.5&&pair('txt','panel')>=4.5&&pair('txt','card')>=4.5,
      name+': body ink reads at 4.5+ on every surface');
    ok(pair('mut','cloud')>=4.5&&pair('mut','pearl')>=4.5&&pair('mut','tasktile')>=4.5,
      name+': muted ink reads at 4.5+ where it carries meaning');
    ok(pair('mut2','cloud')>=3&&pair('mut2','pearl')>=3,name+': whisper ink stays at 3+');
    ok(pair('navy','cloud')>=4.5&&pair('navy','pearl')>=4.5&&ratio(v.on,v.navy)>=4.5,
      name+': strong ink and its inversion hold at 4.5+');
    ok(pair('txt','ocean')>=4.5,name+': the deepest highlight keeps the ink legible');
    ok(pair('done','tasktile')>=3&&pair('done','cloud')>=3&&pair('done','pearl')>=3,
      name+': the completion fill reads against every surface it sits on');
    ok(pair('today','cloud')>=3,name+': the today marker reads against the column');
    ok(ratio(v.onpri,v.done)>=3,name+': the tick glyph reads on its fill');
    ok(gs.length>0&&gs.every(s=>ratio(v.onpri,s)>=3),name+': the primary label reads on its fill');
    ok(pair('denim','cloud')>=3&&pair('denim','pearl')>=3,name+': focus and drag cues stay visible');
    /* the True north statement is 19px/700, WCAG large text, so 3:1 is its bar */
    ok(pair('north','northbg')>=3,
      name+': the north statement holds the large-text bar on its backdrop ('+pair('north','northbg').toFixed(2)+')');
  }
  ok(ratio(skyV.north,skyV.northbg)>=4.5,
    'cloud blue: the statement ink clears even the normal-text bar ('+ratio(skyV.north,skyV.northbg).toFixed(2)+')');
  /* mono only: the red and the ink must also carry against the near-black canvas,
     something the blue theme never asks of its canvas */
  ok(ratio(monoV.today,monoV.canvas)>=3,'mono: red reads on the canvas');
  ok(ratio(monoV.txt,monoV.canvas)>=7,'mono: ink on canvas is high contrast');
  ok(ratio(monoV.ocean,monoV.canvas)>=3,'mono: the off-board note reads on the canvas');
}

console.log('— themes: the choice survives a fresh boot —');
{
  const dom2=new JSDOM(html,{runScripts:'dangerously',url:'http://localhost/',pretendToBeVisual:true,
    beforeParse(win){ try{win.localStorage.setItem('agora_dayplanner_theme','mono')}catch(e){} }});
  await wait(300);
  const w2=dom2.window;
  ok(w2.document.documentElement.getAttribute('data-theme')==='mono','a fresh boot paints mono from the head script');
  ok(w2.document.querySelector('meta[name="theme-color"]').getAttribute('content')==='#070708','the meta is set before the app script runs');
  ok(!!w2.A&&w2.A.themeGet()==='mono','the app agrees with the head script after boot');
  ok(!!w2.document.querySelector('#board'),'the planner boots normally under mono');
  ok(w2.A.state.settings.view==='board','with its settings untouched by the theme');
  w2.close();
}

console.log('— layout: the rail collapses, device-local and unsynced —');
{
  const root=doc.documentElement;
  const hide=q('#railcollapse'), show=q('#railshow');
  ok(!!hide&&!!show,'a control to hide the rail and one to bring it back');
  ok(hide.tagName==='BUTTON'&&show.tagName==='BUTTON','both are real buttons');
  ok((hide.getAttribute('aria-label')||'').trim()==='Hide sidebar','the hide control is named');
  ok((show.getAttribute('aria-label')||'').trim()==='Show sidebar','the show control is named');
  ok(!!hide.querySelector('svg')&&!!show.querySelector('svg'),'drawn as inline SVG');
  ok(!/[\u{1F300}-\u{1FAFF}\u{2700}-\u{27BF}]/u.test(hide.innerHTML+show.innerHTML),'and no emoji');
  ok(!show.closest('#rail'),'the restore control is OUTSIDE the rail, or hiding it would hide the way back');

  const sig0=A.stateSig(S()), saved0=w.localStorage.getItem('agora_dayplanner_v1');
  ok(root.getAttribute('data-rail')===null,'the rail starts open');
  hide.click(); await wait(20);
  ok(root.getAttribute('data-rail')==='off','the hide control collapses it');
  ok(w.localStorage.getItem('agora_dayplanner_rail')==='off','and remembers the choice on this device');
  ok(A.railOpen()===false,'the app agrees');
  show.click(); await wait(20);
  ok(root.getAttribute('data-rail')===null,'the show control brings it back');
  ok(w.localStorage.getItem('agora_dayplanner_rail')==='on','and remembers that too');

  /* the whole point of a separate key: it can never reach state, the sig, or the cloud */
  hide.click(); await wait(20);
  ok(A.stateSig(S())===sig0,'collapsing changes no signature, so sync has nothing to push');
  ok(w.localStorage.getItem('agora_dayplanner_v1')===saved0,'and writes nothing to the planner');
  const savedR=JSON.parse(w.localStorage.getItem('agora_dayplanner_v1'));
  ok(!('rail' in savedR.settings)&&!('railOpen' in savedR.settings),'no rail field in saved settings');
  ok(JSON.stringify(savedR).indexOf('agora_dayplanner_rail')<0,'and the key name appears nowhere in the planner');
  ok(A.MERGED_KEYS.indexOf('rail')<0,'the merge has no rail key to carry');
  show.click(); await wait(20);
}

console.log('— layout: the rail choice survives a fresh boot —');
{
  const dom3=new JSDOM(html,{runScripts:'dangerously',url:'http://localhost/',pretendToBeVisual:true,
    beforeParse(win){ try{win.localStorage.setItem('agora_dayplanner_rail','off')}catch(e){} }});
  await wait(300);
  const w3=dom3.window;
  ok(w3.document.documentElement.getAttribute('data-rail')==='off',
    'a fresh boot collapses the rail from the head script, before first paint');
  ok(!!w3.A&&w3.A.railOpen()===false,'the app agrees after boot');
  ok(!!w3.document.querySelector('#board'),'the planner boots normally with the rail collapsed');
  ok(w3.A.state.settings.view==='board','with its settings untouched by the rail');
  ok(JSON.stringify(w3.A.state).indexOf('data-rail')<0,'and nothing about it in state');
  w3.close();
}

console.log('— layout: scrollbars appear while scrolling and go at rest —');
{
  /* one mechanism, applied through `*`, so a scroller added later is covered the day
     it is written. The gutter is constant; only the thumb colour moves. */
  ok(/\*::-webkit-scrollbar\{width:10px;height:10px\}/.test(html),'every scroller reserves a constant gutter');
  ok(/\*::-webkit-scrollbar-thumb\{background-color:transparent/.test(html),'the thumb is invisible at rest');
  ok(/\.scrolling::-webkit-scrollbar-thumb\{background-color:rgba\(var\(--ink-rgb\)/.test(html),
    'and coloured while scrolling, from a theme variable rather than a hardcoded colour');
  ok(/\*\{scrollbar-width:thin;scrollbar-color:transparent transparent\}/.test(html),
    'Firefox gets the same constant gutter and the same two states');
  ok(/\.scrolling\{scrollbar-color:rgba\(var\(--ink-rgb\)/.test(html),'with its thumb colour themed too');
  /* the width is declared ONCE and never varies by state, which is what makes the
     appearance free of layout: a rule that changed it would reflow the content */
  ok((html.match(/::-webkit-scrollbar\{width:/g)||[]).length===1,
    'the gutter width is declared once and no state changes it');
  ok(!/\.scrolling::-webkit-scrollbar\{/.test(html),'no scrolling-state rule touches the track size');

  const el=q('#rail');
  el.classList.remove('scrolling');
  el.dispatchEvent(new w.Event('scroll',{bubbles:false}));
  await wait(20);
  ok(el.classList.contains('scrolling'),'a scroll marks the element that scrolled');
  const board=q('#board');
  board.dispatchEvent(new w.Event('scroll',{bubbles:false}));
  await wait(20);
  ok(board.classList.contains('scrolling'),'a different scroller is marked independently');
  ok(el.classList.contains('scrolling'),'and the first is still marked, they do not share a timer');
  await wait(1000);
  ok(!el.classList.contains('scrolling')&&!board.classList.contains('scrolling'),
    'both go quiet once the scrolling stops');
  /* scroll does not bubble, so the listener has to be in the capture phase or a
     scroller nested anywhere below document would never be seen */
  ok(/addEventListener\('scroll'[\s\S]{0,400}?capture:true/.test(html),'the listener is capture-phase');
  ok(/addEventListener\('scroll'[\s\S]{0,400}?passive:true/.test(html),'and passive, so it cannot delay a scroll');
  /* the keyboard scrolls too, and raises the same event, so nothing is hover-only */
  ok(!/@media \(hover:hover\)\{[^}]*\.scrolling/.test(html),'the scrolling state is not gated on hover');
}

console.log('— layout: the logo resets the view —');
{
  const logo=q('.brandbtn');
  ok(!!logo&&logo.tagName==='BUTTON','the logo is a real button');
  ok((logo.getAttribute('aria-label')||'').trim().length>0,'and carries a name');
  ok(!!logo.querySelector('.mark')&&!!logo.querySelector('.brand'),'wrapping the mark and the wordmark');

  /* put the view as far from normal as it goes, with data in every list */
  S().notes.push({id:'hn1',title:'a note',body:'some body',up:1,dn:1,pos:1});
  S().settings.view='notes'; S().settings.noteSel='hn1';
  S().settings.floatMode=true; S().settings.boardOffset=3; S().settings.stripDay=T();
  S().settings.calSel=T(); S().settings.calOffset=2;
  A.ui.noteQ='searching'; A.ui.sel='whatever';
  A.save(); A.render(); await wait(30);
  const before=JSON.stringify({days:S().days,notes:S().notes,floats:S().floats,
    habits:S().habits,week:S().week,focus:S().focus,bin:S().bin,tomb:S().tomb});
  const sigBefore=A.stateSig(S());
  const syncBefore=JSON.stringify({key:A.sync.key,state:A.sync.state});

  logo.click(); await wait(40);
  ok(S().settings.view==='board','the logo lands on the board');
  ok(S().settings.floatMode===false,'out of Free Floating');
  ok(S().settings.boardOffset===0,'today back in view');
  ok(S().settings.stripDay===null,'and today on the narrow strip too');
  ok(S().settings.calSel===null&&S().settings.calOffset===0,'no calendar selection carried back');
  ok(S().settings.noteSel===null,'no note left open');
  ok(A.ui.noteQ===''&&A.ui.sel===null,'no stale search and no card left open');
  ok(!!q('#board .col'),'and the board is actually on screen');

  ok(JSON.stringify({days:S().days,notes:S().notes,floats:S().floats,
    habits:S().habits,week:S().week,focus:S().focus,bin:S().bin,tomb:S().tomb})===before,
    'not one item of planner data was touched');
  ok(A.stateSig(S())===sigBefore,'the signature is unchanged, so it pushes nothing of its own');
  ok(JSON.stringify({key:A.sync.key,state:A.sync.state})===syncBefore,'and the sync connection is left alone');
  ok(!/location\.reload|window\.location\s*=/.test(html),'it is a view reset, never a page reload');

  { /* an edit still inside the save debounce is COMMITTED by the reset, not dropped */
    S().settings.view='notes'; S().settings.noteSel='hn1'; A.render(); await wait(30);
    const ed=q('#noteBody'); ed.focus();
    ed.textContent='typed but not yet committed';
    fire(ed,'input'); await wait(10);              /* inside the 400ms debounce */
    q('.brandbtn').click(); await wait(40);
    const savedH=JSON.parse(w.localStorage.getItem('agora_dayplanner_v1'));
    ok(/typed but not yet committed/.test((savedH.notes.find(n=>n.id==='hn1')||{}).body||''),
      'the half-typed body was flushed to storage before the view changed under it');
    ok(S().settings.view==='board','and the reset still happened');
  }
  S().notes=S().notes.filter(n=>n.id!=='hn1'); A.save(); A.render(); await wait(20);
}

console.log('— tabs: reorder by tap, the fix for risk 12 —');
{
  S().settings.floatMode=true; S().settings.view='board';
  S().floats=[{id:'tA',name:'Alpha',tasks:[],up:1,pos:1},
              {id:'tB',name:'Bravo',tasks:[],up:1,pos:2},
              {id:'tC',name:'Charlie',tasks:[],up:1,pos:3}];
  A.save(); A.render(); await wait(30);
  const heads=()=>qa('.col.backlog');
  const order=()=>S().floats.map(f=>f.id).join(',');
  const mv=(fid,d)=>q('[data-action="float-move"][data-fid="'+fid+'"][data-d="'+d+'"]');

  ok(heads().length===3,'three tabs on the board');
  ok(!mv('tA',-1),'the first tab renders NO left control rather than a dead one');
  ok(!!mv('tA',1),'but it can go right');
  ok(!!mv('tB',-1)&&!!mv('tB',1),'a middle tab has both');
  ok(!mv('tC',1),'the last tab renders no right control');
  ok(!!mv('tC',-1),'but it can go left');
  qa('[data-action="float-move"]').forEach(b=>{
    ok((b.getAttribute('aria-label')||'').trim().length>0&&b.textContent.trim().length>0,
      'every move control has a name AND a visible label: '+(b.getAttribute('aria-label')||''));
  });
  ok(qa('[data-action="float-move"]').length===4,'four move controls across three tabs');
  ok(mv('tB',-1).className===q('[data-action="float-rename"]').className,
    'styled as the minis they sit beside');

  const posBefore=S().floats.map(f=>f.pos);
  mv('tA',1).click(); await wait(40);
  ok(order()==='tB,tA,tC','tapping right moves the tab one position');
  A.save(); await wait(10);
  ok(S().floats.find(f=>f.id==='tA').pos>posBefore[0],'and the move is written to the pos axis');
  mv('tA',-1).click(); await wait(40);
  ok(order()==='tA,tB,tC','tapping left moves it back');
  mv('tC',-1).click(); await wait(40);
  ok(order()==='tA,tC,tB','the last tab can move left');
  /* the guard IS the refusal: having moved to the end, tB stops offering a right
     control at all, so there is no dead button to press */
  ok(!mv('tB',1),'a tab that reaches the end stops offering the control that took it there');
  ok(!!mv('tB',-1),'and offers only the direction it can still go');
  ok(order()==='tA,tC,tB','with the order left exactly where the last move put it');

  /* no new state field anywhere: a tap writes exactly what a drop writes */
  A.save(); await wait(10);
  const savedT=JSON.parse(w.localStorage.getItem('agora_dayplanner_v1'));
  savedT.floats.forEach(f=>ok(Object.keys(f).every(k=>['id','name','tasks','up','pos','dn'].includes(k)),
    'a reordered tab carries only the fields it always had: '+Object.keys(f).join('/')));
  ok(!('floatOrder' in savedT.settings),'and no ordering field was invented in settings');

  { /* it merges as an ordinary reorder, exactly as a drag-produced one does */
    const mine=JSON.parse(JSON.stringify(S()));
    const theirs=JSON.parse(JSON.stringify(S()));
    mine.floats=[mine.floats[1],mine.floats[0],mine.floats[2]];
    mine.floats.forEach((f,i)=>{ f.pos=9e12+i });      /* the later word on order */
    const m=A.mergeStates(mine,theirs);
    ok(m.floats.map(f=>f.id).join(',')===mine.floats.map(f=>f.id).join(','),
      'the later reorder wins the merge, the same rule a drag lands under');
    ok(m.floats.length===3,'and no tab is lost or duplicated by it');
  }
  /* the drag path is untouched: still a draggable header, still one handler */
  ok(qa('.col.backlog .colhead[draggable="true"]').length===3,'every header is still a drag handle');
  S().settings.floatMode=false; A.save(); A.render(); await wait(20);
}

console.log('— This week collapses with content in it —');
{
  S().week.list=[{id:'wk1',title:'book the dentist',done:false,up:1,pos:1}];
  S().settings.weekOpen=true; A.save(); A.render(); await wait(30);
  const kh=()=>q('#weekRail .kh');
  ok(!!kh()&&kh().dataset.action==='week-toggle','the header carries a toggle even with items in it');
  ok(!!q('#weekRail .chev'),'and draws a chevron it can honour');
  ok(!!q('#weekAdd'),'it starts expanded');
  kh().click(); await wait(30);
  ok(S().settings.weekOpen===false,'clicking it collapses the panel');
  ok(!q('#weekAdd'),'the add field goes with it');
  ok(!q('#weekRail .wrow'),'and so do the items');
  ok(/1 open/.test(q('#weekRail .kh').textContent),'while the header still reports the count');
  ok(!!q('#weekRail .chev')&&!q('#weekRail .chev.open'),'the chevron turns to closed');
  ok(S().week.list.length===1,'collapsing hides the item, it never deletes it');
  kh().click(); await wait(30);
  ok(S().settings.weekOpen===true&&!!q('#weekAdd'),'and clicking again opens it');

  { /* per device, like Habits: it is remembered, and it never pushes */
    const sigW=A.stateSig(S());
    kh().click(); await wait(30);
    ok(A.stateSig(S())===sigW,'a collapse changes no signature, so sync has nothing to push');
    A.save(); await wait(10);
    const savedW=JSON.parse(w.localStorage.getItem('agora_dayplanner_v1'));
    ok(savedW.settings.weekOpen===false,'the choice is written to this device');
    /* VIEWSET is what keeps a Pull from taking another screen's collapse states */
    ok(/'habitsOpen','weekOpen'/.test(html),'and it rides VIEWSET beside habitsOpen, so a Pull never imports it');
  }
  { /* survives a reload */
    const seed=w.localStorage.getItem('agora_dayplanner_v1');
    const dom4=new JSDOM(html,{runScripts:'dangerously',url:'http://localhost/',pretendToBeVisual:true,
      beforeParse(win){ try{win.localStorage.setItem('agora_dayplanner_v1',seed)}catch(e){} }});
    await wait(300);
    const w4=dom4.window;
    ok(w4.A.state.settings.weekOpen===false,'a fresh boot remembers the collapse');
    ok(!w4.document.querySelector('#weekAdd'),'and comes back collapsed with the item still held');
    ok(w4.A.state.week.list.length===1,'the item survived the reload inside the collapsed panel');
    w4.close();
  }
  S().settings.weekOpen=true; S().week.list=[]; A.save(); A.render(); await wait(20);
}

console.log('— True north shows its working parts only while in use —');
{
  S().focus=[{id:'tn1',title:'ship it calmly',done:false,up:1,pos:1},
             {id:'tn2',title:'an older line',done:true,doneAt:'2026-08-01',up:1,pos:2}];
  A.ui.northOn=false; delete A.ui.peek.focus;
  A.save(); A.render(); await wait(30);

  ok(/ship it calmly/.test(q('#fpanel').textContent),'at rest the statement is in view');
  ok(!q('#fi'),'the add field is not');
  ok(!q('#fpanel .fdone'),'nor is the Set aside archive');
  ok(!q('#fpanel .chev'),'and the pinned-open rule still draws no chevron');

  q('#fpanel').click(); await wait(30);
  ok(!!q('#fi'),'a press on the panel reveals the add field');
  ok(!!q('#fpanel .fdone'),'and the archive');
  ok(/ship it calmly/.test(q('#fpanel').textContent),'the statement is still there');

  q('#board').click(); await wait(30);
  ok(!q('#fi')&&!q('#fpanel .fdone'),'a press outside puts the working parts away');
  ok(/ship it calmly/.test(q('#fpanel').textContent),'and the statement NEVER goes, which is the point of the panel');

  q('#fpanel').click(); await wait(30);
  ok(!!q('#fi'),'open again');
  doc.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  await wait(30);
  ok(!q('#fi'),'Escape closes it too');
  ok(/ship it calmly/.test(q('#fpanel').textContent),'statement still held');

  { /* a first statement is always reachable: empty, the header opens the panel and
       the field is right there, which is the path a new device takes */
    S().focus=[]; A.ui.northOn=false; delete A.ui.peek.focus;
    A.save(); A.render(); await wait(30);
    ok(!q('#fi'),'an empty panel is a header bar');
    ok(!!q('#fpanel .kh[data-action="panel-toggle"]'),'whose header offers a toggle');
    click('#fpanel .kh[data-action="panel-toggle"]'); await wait(30);
    ok(!!q('#fi'),'opening it puts the add field in reach with no statement held');
    q('#fi').value='the very first line';
    click('[data-action="focus-add"]'); await wait(30);
    ok(S().focus.length===1,'a first statement can be set');
    ok(!!q('#fi'),'and the field stays under your hands for a second one');
  }
  { /* neither flag is ever written anywhere */
    A.ui.northOn=true; A.save(); await wait(10);
    const savedN=JSON.parse(w.localStorage.getItem('agora_dayplanner_v1'));
    ok(savedN.settings.northOn===undefined&&savedN.northOn===undefined,'northOn is never saved');
    ok(JSON.stringify(savedN).indexOf('northOn')<0,'it appears nowhere in the planner at all');
    ok(A.stateSig(S()).indexOf('northOn')<0,'and never reaches the signature');
  }
  S().focus=[]; A.ui.northOn=false; A.save(); A.render(); await wait(20);
}

console.log('— Notes: folders — create, rename, delete —');
{
  S().notes=[
    {id:'fd1',title:'Loose one',body:'body a',up:1,dn:1,pos:1},
    {id:'fd2',title:'Loose two',body:'body b',up:2,dn:2,pos:2},
  ];
  S().folders=[]; S().settings.view='notes'; S().settings.noteSel='fd1';
  A.ui.noteQ='';
  A.save(); A.render(); await wait(30);
  ok(!!q('[data-action="folder-new"]'),'the note list offers + New folder');
  click('[data-action="folder-new"]'); await wait(40);
  ok(S().folders.length===1,'pressing it creates a folder');
  const fid=S().folders[0].id;
  ok(S().folders[0].name==='New folder','with a starter name');
  const ren=q('.fldname[data-kind="folderrename"]');
  ok(!!ren,'and its rename already open, like a new tab');
  ren.textContent='Work'; fire(ren,'blur'); await wait(30);
  ok(S().folders[0].name==='Work','the typed name lands');
  ok(/Work/.test(q('#noteRows').textContent),'the folder renders as a heading in the list');
  ok(/Empty/.test(q('#noteRows').textContent),'an empty folder says so instead of hiding');
  A.save(); await wait(10);
  const ff=A.flatten(S()).folder[fid];
  ok(!!ff&&ff.up>1&&ff.dn>0&&ff.pos>0,'a folder carries all three stamps like any item');

  /* rename by the mini, not only at creation */
  click('[data-action="folder-rename"][data-fid="'+fid+'"]'); await wait(20);
  const ren2=q('.fldname[data-kind="folderrename"]');
  ok(!!ren2,'the pencil opens the rename in place');
  const upBefore=A.flatten(S()).folder[fid].up;
  ren2.textContent='Deep work'; fire(ren2,'blur'); await wait(30);
  A.save(); await wait(10);
  ok(S().folders[0].name==='Deep work','the new name lands');
  ok(A.flatten(S()).folder[fid].up>=upBefore&&A.flatten(S()).folder[fid].up>1,
    'a rename rides the content stamp');

  /* an empty folder deletes at once, with the 5 second Undo */
  click('[data-action="folder-del"][data-fid="'+fid+'"]'); await wait(30);
  ok(!q('.mback'),'an empty folder is not worth a confirmation');
  ok(S().folders.length===0,'it goes immediately');
  ok(/Folder deleted/.test(q('#toast').textContent)&&!!q('[data-action="undo"]'),
    'the toast says so and offers Undo');
  click('[data-action="undo"]'); await wait(30);
  ok(S().folders.length===1&&S().folders[0].id===fid,'Undo brings the same folder back');
  q('#toast').innerHTML='';

  /* deleting a folder that holds notes asks first and moves them out */
  S().notes.find(n=>n.id==='fd1').folder=fid;
  A.save(); A.render(); await wait(25);
  click('[data-action="folder-del"][data-fid="'+fid+'"]'); await wait(30);
  ok(!!q('.mback'),'deleting a folder with notes inside asks first');
  ok(/should not delete them/.test(q('.modal').textContent),'and says the notes are safe');
  click('[data-action="folder-del-move"][data-fid="'+fid+'"]'); await wait(30);
  ok(S().folders.length===0,'the folder goes');
  ok(S().notes.length===2,'the notes do not');
  ok(!('folder' in S().notes.find(n=>n.id==='fd1')),'the note is back in the loose list, the field gone entirely');
  ok(/Folder deleted/.test(q('#toast').textContent)&&!!q('[data-action="undo"]'),
    'with the same 5 second Undo a tab delete gets');
  click('[data-action="undo"]'); await wait(30);
  ok(S().folders.length===1&&S().notes.find(n=>n.id==='fd1').folder===fid,
    'Undo restores the folder with its note back inside');

  /* past the toast: the tomb records it and the bin can bring it back whole */
  click('[data-action="folder-del"][data-fid="'+fid+'"]'); await wait(30);
  click('[data-action="folder-del-move"][data-fid="'+fid+'"]'); await wait(30);
  q('#toast').innerHTML=''; A.save(); await wait(20);
  ok(!!S().tomb[fid],'the deletion is recorded so other devices learn of it');
  ok(!!S().bin[fid]&&S().bin[fid].k==='folder','and the folder waits in the bin');
  ok(!S().bin.fd1,'the notes it held never touch the bin: they were moved, not deleted');
  A.restoreBin(fid); await wait(25);
  ok(S().folders.some(f=>f.id===fid),'Restore brings the folder back');
  ok(S().notes.find(n=>n.id==='fd1').folder===fid,'and gathers its still-loose notes back in');
  ok(/Restored to Notes/.test(q('#toast').textContent),'the toast names where it went');
  q('#toast').innerHTML='';
  S().folders=[]; delete S().notes.find(n=>n.id==='fd1').folder;
  A.save(); A.render(); await wait(20);
}

console.log('— Notes: moving in and out, from the row and from the page —');
{
  S().folders=[{id:'fw',name:'Work',up:1,dn:1,pos:1},{id:'fh',name:'Home',up:1,dn:1,pos:2}];
  S().notes=[{id:'mv1',title:'Movable',body:'text here',up:5,dn:5,pos:5}];
  S().settings.view='notes'; S().settings.noteSel='mv1'; A.ui.noteQ='';
  A.save(); A.render(); await wait(30);

  ok(!!q('.noteli [data-action="note-movemenu"][data-id="mv1"]'),
    'the list row offers Move without opening the note');
  ok(!!q('.notemeta [data-action="note-movemenu"][data-id="mv1"]'),
    'and the open page offers the same Move');
  ok(!!q('.notemeta [data-action="note-pin"]')&&!!q('.notemeta [data-action="note-del"]'),
    'beside the Pin and Delete it does not displace');
  ok(!q('#notes [draggable="true"]'),'no drag surface anywhere in the notes view: taps are the route');

  const before=A.flatten(S()).note.mv1;
  /* loose into a folder, from the LIST row */
  click('.noteli [data-action="note-movemenu"][data-id="mv1"]'); await wait(25);
  ok(!!q('#noteMoveModal'),'the row Move opens the folder chooser');
  ok(qa('#noteMoveModal .popt').length===3,'the loose list and both folders are on offer');
  ok(!!q('#noteMoveModal .popt[data-fid=""].on'),'with the current place marked');
  click('#noteMoveModal .popt[data-fid="fw"]'); await wait(30);
  ok(S().notes[0].folder==='fw','a loose note moves into a folder from the list');
  ok(!q('#noteMoveModal'),'and the chooser closes');
  ok(/Moved to "Work"/.test(q('#toast').textContent),'the toast names the folder');
  A.save(); await wait(10);
  const mid=A.flatten(S()).note.mv1;
  ok(mid.up===before.up&&mid.dn===before.dn,'the move touches neither the title stamp nor the body stamp');
  ok(mid.pos>before.pos,'placement rides the pos axis, exactly as pinning does');

  /* the list groups it under the heading */
  const seq=qa('#noteRows > *').map(e=>
    e.classList.contains('fldhead')?('head:'+e.querySelector('.fldname').textContent)
    :(e.querySelector('.noterow')?e.querySelector('.noterow').dataset.id:'?'));
  ok(seq.indexOf('head:Work')>-1&&seq.indexOf('mv1')===seq.indexOf('head:Work')+1,
    'the note now renders under its folder heading ('+seq.join(',')+')');

  /* between folders, from the OPEN PAGE */
  click('.notemeta [data-action="note-movemenu"][data-id="mv1"]'); await wait(25);
  ok(!!q('#noteMoveModal .popt[data-fid="fw"].on'),'the chooser marks where it sits now');
  click('#noteMoveModal .popt[data-fid="fh"]'); await wait(30);
  ok(S().notes[0].folder==='fh','a filed note moves to a different folder from the open note');

  /* and back out to the loose list */
  click('.noteli [data-action="note-movemenu"][data-id="mv1"]'); await wait(25);
  click('#noteMoveModal .popt[data-fid=""]'); await wait(30);
  ok(!('folder' in S().notes[0]),'and back out entirely: the field is absent, exports stay clean');

  A.save(); await wait(10);
  const after=A.flatten(S()).note.mv1;
  ok(after.up===before.up&&after.dn===before.dn,
    'a whole round trip of moves still never touches the content or body stamps');

  /* no folders anywhere and the note loose: no dead Move control renders */
  S().folders=[]; A.save(); A.render(); await wait(25);
  ok(!q('[data-action="note-movemenu"]'),'with no folder to move to there is no Move control at all');
}

console.log('— Notes: folder merge —');
{
  const ndev=()=>{const s=dev(); s.notes=[]; s.folders=[]; return s};
  const mkn=(id,title,body,up,x)=>Object.assign(
    {id,title:title||'',body:body||'',up:up||100,dn:up||100,pos:up||100},x||{});
  const mkf=(id,name,up)=>({id,name,up:up||100,dn:up||100,pos:up||100});
  { /* a folder added on each device: both survive */
    const a=ndev(); a.folders.push(mkf('gA','Work',200));
    const b=ndev(); b.folders.push(mkf('gB','Home',210));
    const m=A.mergeStates(a,b);
    ok(m.folders.length===2,'a folder added on each device: both survive');
    ok(A.stateSig(m)===A.stateSig(A.mergeStates(b,a)),'and both devices agree');
  }
  { /* CASE 1: the same note moved to two different folders at once */
    const now=Date.now();
    const base=ndev(); base.folders.push(mkf('gA','Work'),mkf('gB','Home'));
    base.notes.push(mkn('n1','Trip','body',200));
    const a=clone(base); a.notes[0].folder='gA'; a.notes[0].pos=now;
    const b=clone(base); b.notes[0].folder='gB'; b.notes[0].pos=now-50;
    const m=A.mergeStates(a,b);
    ok(m.notes[0].folder==='gA','moved to two folders at once: the later move holds the whole placement');
    ok(m.notes.length===1&&m.folders.length===2,'nothing lost, nothing duplicated');
    ok(A.stateSig(m)===A.stateSig(A.mergeStates(b,a)),'the same answer on both devices');
  }
  { /* CASE 2: moved into a folder here while the folder is deleted there */
    const now=Date.now();
    const base=ndev(); base.folders.push(mkf('gA','Work'));
    base.notes.push(mkn('n1','Trip','body',200));
    const a=clone(base); a.folders=[]; a.tomb={gA:now};
    const b=clone(base); b.notes[0].folder='gA'; b.notes[0].pos=now+50;
    const m=A.mergeStates(a,b), m2=A.mergeStates(b,a);
    ok(m.folders.length===0,'the folder stays deleted: moving a note into it stamps the note, not the folder');
    ok(m.notes.length===1&&m.notes[0].body==='body','the note is never lost with it');
    ok(!m.notes[0].folder,'it lands back in the loose list');
    ok(A.stateSig(m)===A.stateSig(m2),'from either direction');
  }
  { /* CASE 3: renamed here, a note moved into it there: different axes compose */
    const now=Date.now();
    const base=ndev(); base.folders.push(mkf('gA','Work'));
    base.notes.push(mkn('n1','Trip','body',200));
    const a=clone(base); a.folders[0].name='Deep work'; a.folders[0].up=now;
    const b=clone(base); b.notes[0].folder='gA'; b.notes[0].pos=now+10;
    const m=A.mergeStates(a,b);
    ok(m.folders[0].name==='Deep work','the rename lands');
    ok(m.notes[0].folder==='gA','and the note lands inside the renamed folder');
    ok(A.stateSig(m)===A.stateSig(A.mergeStates(b,a)),'and both agree');
  }
  { /* a move into a folder cannot revive a note deleted elsewhere */
    const now=Date.now();
    const base=ndev(); base.folders.push(mkf('gA','Work'));
    base.notes.push(mkn('n1','Trip','body',200));
    const a=clone(base); a.notes=[]; a.tomb={n1:now};
    const b=clone(base); b.notes[0].folder='gA'; b.notes[0].pos=now+99;
    ok(A.mergeStates(a,b).notes.length===0,'moving a note into a folder does not revive its deletion');
    ok(A.mergeStates(b,a).notes.length===0,'in either direction');
  }
  { /* a move composes with a concurrent title AND body edit: three axes at once */
    const now=Date.now();
    const base=ndev(); base.folders.push(mkf('gA','Work'));
    base.notes.push(mkn('n1','Trip','original',200));
    const a=clone(base); a.notes[0].folder='gA'; a.notes[0].pos=now;
    const b=clone(base); b.notes[0].title='Trip, renamed'; b.notes[0].up=now-10;
    b.notes[0].body='rewritten'; b.notes[0].dn=now-5;
    const m=A.mergeStates(a,b);
    ok(m.notes[0].folder==='gA'&&m.notes[0].title==='Trip, renamed'&&m.notes[0].body==='rewritten',
      'a move here and a rename plus body edit there all land on one note');
    ok(A.stateSig(m)===A.stateSig(A.mergeStates(b,a)),'convergently');
  }
  { /* a planner that predates folders drops nothing */
    const a=dev();
    const b=ndev(); b.folders.push(mkf('gA','Work',200));
    b.notes.push(mkn('n1','Kept','x',210,{folder:'gA'}));
    const m=A.mergeStates(a,b);
    ok(m.folders.length===1&&m.notes.length===1&&m.notes[0].folder==='gA',
      'merging with a pre-folders planner keeps the folder and the filing');
    ok(A.stateSig(m)===A.stateSig(A.mergeStates(b,a)),'from either direction');
  }
}

/* ---- the cascade resolver, shared by every section that asks what a browser would
   actually paint at a given viewport (the sticky corner heights below, and the layout
   boundary pin further down). It walks the PARSED sheet rather than the file text:
   match the element, drop the bands that are not live at that width and height, then
   order by importance, specificity and source position and take the last one standing.
   A grep over the source proves a declaration exists; only this proves it wins. ---- */
const specOf=sel=>{
  const s=sel.replace(/::[\w-]+/g,' ').replace(/\*/g,' ');
  const ids=(s.match(/#[\w-]+/g)||[]).length;
  const cls=(s.match(/\.[\w-]+/g)||[]).length+(s.match(/\[[^\]]*\]/g)||[]).length
    +(s.replace(/\[[^\]]*\]/g,' ').match(/:[\w-]+/g)||[]).length;
  const typ=(s.replace(/\[[^\]]*\]/g,' ').match(/(^|[\s>+~])[a-zA-Z][\w-]*/g)||[]).length;
  return ids*10000+cls*100+typ;
};
/* only plain width and height queries are judged. Anything else gating one of
   these declarations is collected and reported instead of guessed at, so the
   resolver fails loudly rather than quietly going wrong when the sheet grows a
   condition it does not understand. @supports lands here for the same reason. */
const mediaLive=(cond,vw,vh)=>{
  if(!cond) return true;
  let known=true;
  for(const part of cond.split(/\s+and\s+/)){
    const m=part.trim().match(/^\(\s*(min|max)-(width|height)\s*:\s*(\d+)px\s*\)$/);
    if(!m){ known=false; continue }
    const v=m[2]==='width'?vw:vh;
    if(m[1]==='min'?v<+m[3]:v>+m[3]) return false;
  }
  return known?true:null;
};
const unjudged=[];
/* match, drop the dead bands, then order by importance, specificity and source
   position and take the last one standing: the cascade, on the real parsed sheet
   rather than on the file's text, so a rule moving between bands changes the
   answer here the same way it changes the answer in Chrome. */
const cascade=(el,prop,vw,vh)=>{
  const cands=[]; let n=0;
  const walk=(rules,cond)=>{
    for(const r of rules){
      if(r.type===4||r.type===12){
        walk(r.cssRules||[],(cond?cond+' and ':'')+
          (r.type===4?(r.media&&r.media.mediaText||''):'supports('+(r.conditionText||'?')+')'));
        continue;
      }
      if(r.type!==1) continue;
      n++;
      const val=r.style&&r.style.getPropertyValue(prop);
      if(!val) continue;
      let sp=-1;
      for(const one of r.selectorText.split(',')){
        let hit=false; try{ hit=el.matches(one.trim()) }catch(e){}
        if(hit) sp=Math.max(sp,specOf(one.trim()));
      }
      if(sp<0) continue;
      const live=mediaLive(cond,vw,vh);
      if(live===null){ unjudged.push(cond+' {'+r.selectorText+'}'); continue }
      if(!live) continue;
      cands.push({imp:r.style.getPropertyPriority(prop)==='important'?1:0,sp,n,val});
    }
  };
  walk(doc.styleSheets[0].cssRules,'');
  cands.sort((a,b)=>a.imp-b.imp||a.sp-b.sp||a.n-b.n);
  return cands.length?cands[cands.length-1].val:'';
};

console.log('— sticky note: one shared scratch block —');
{
  S().settings.view='board'; S().settings.floatMode=false;
  A.save(); A.render(); await wait(25);
  ok(!!q('#sticky')&&q('#sticky').style.display!=='none','the sticky panel shows on the board');
  ok(q('#sticky').dataset.pos==='corner','in its corner placement');
  ok(q('#stickyPad').tagName==='TEXTAREA','one plain text block: no formatting, no list');
  ok((q('#stickyPad').getAttribute('aria-label')||'').length>0,'and it is named');
  ok(q('#stickyPad').getAttribute('spellcheck')===null,'spellcheck stays on, like the notes editor');
  ok(!q('#notes #sticky'),'it sits beside the notes view, never inside it');

  const pad=q('#stickyPad');
  pad.value='milk, and call the plumber'; fire(pad,'input'); await wait(10);
  ok(S().sticky.text==='milk, and call the plumber','typing lands in state as you type');
  ok(S().sticky.at>0,'stamped at the keystroke, so a merge always weighs the text at its true moment');
  A.save(); await wait(10);
  const savedS=JSON.parse(w.localStorage.getItem('agora_dayplanner_v1'));
  ok(savedS.sticky.text==='milk, and call the plumber','and persists through the normal save');

  S().settings.floatMode=true; A.render(); await wait(20);
  ok(q('#sticky').style.display!=='none','still there on Free Floating');
  S().settings.floatMode=false; S().settings.view='notes'; A.render(); await wait(20);
  /* 'top', not 'foot': in Notes the strip is the FIRST block of the content column,
     so it stands at the top right with the list and the editor below it. Board and
     Free Floating keep the bottom right corner. */
  ok(q('#sticky').style.display!=='none'&&q('#sticky').dataset.pos==='top',
    'and in Notes, at its top placement, above the pane rather than below it');
  ok(/order:\s*-1/.test((html.match(/#sticky\[data-pos="top"\]\{([^}]*)\}/)||[])[1]||''),
    'which it reaches by taking the order back on the one wide rule');
  /* the fix belongs at the rule that lost the order, not on top of it: a foot
     placement still in the sheet with a top rule shadowing it is two placements
     arguing, and whichever wins depends on source order. */
  ok(!/data-pos="foot"/.test(html),
    'and no foot placement is left in the sheet for a later rule to have to override');
  ok(q('#stickyPad').value==='milk, and call the plumber','the same text in every placement: one block, not three');
  S().settings.view='calendar'; A.render(); await wait(20);
  ok(q('#sticky').style.display==='none','the calendar keeps its full width');
  S().settings.view='board'; A.render(); await wait(20);
  ok(q('#stickyPad')===pad,'a render never rebuilds the pad, so a caret can never be lost to one');

  /* SIZE: the pad was doubled, spent on a different axis at each of the three
     placements because the cheap dimension differs at each. Pinned here so a
     later tidy cannot quietly flatten them back to one number. */
  {
    const css=html.slice(html.indexOf('<style>'),html.indexOf('</style>'));
    /* same rule as the narrow block below: there is more than one min-width:901px
       block in the sheet (the board's one column mode opens another), so take the one
       that actually carries the sticky rules rather than whichever comes first */
    const wide=([...css.matchAll(/@media \(min-width:901px\)\{([\s\S]*?)\n\}/g)]
      .map(m=>m[1]).find(b=>/#main\.stickycorner/.test(b)))||'';
    /* there are five max-width:900px blocks in the sheet; take the one that
       actually carries the pad, not whichever comes first */
    const narrowB=([...css.matchAll(/@media \(max-width:900px\)\{([\s\S]*?)\n\}/g)]
      .map(m=>m[1]).find(b=>/#stickyPad/.test(b)))||'';
    /* the corner's WIDTH doubles only above 1200px, and that wall has not moved:
       at 1024 a day column's add control has its centre at x=738 and a 264px
       corner already reaches it, which the viewport pass caught as real misses.
       The HEIGHT is a separate question with a different answer, resolved below. */
    const big=(css.match(/@media \(min-width:1200px\)\{([\s\S]*?)\n\}/)||[])[1]||'';
    ok(/#sticky\{[^}]*width:232px/.test(css),
      'the corner keeps 232px as its base, which is what 901 to 1199px gets');
    ok(/#sticky\{width:464px\}/.test(big),'and doubles to 464px only where the board has the room');
    ok(/#main\.stickycorner #board\{padding-right:496px\}/.test(big),
      'with the reservation moving to match, or the last column slides back under it');
    /* ---------- HEIGHT, RESOLVED RATHER THAN GREPPED ----------
       The pass before this one pinned the corner's height by searching the sheet for
       a rule and by counting the pad rules in a band. That is blind to the two things
       which actually decide a height: whether the band is live at the width being
       claimed, and whether a later rule of equal or greater weight overrides it.
       It was blind to a worse one as well. Both of those assertions passed against a
       sheet in which the corner rule DID NOT EXIST, because "no corner rule in the
       1200 band" and "no pad height in the 901 band" are exactly what an absent
       feature looks like. The corner took the 92px base and the suite called it
       intended. A test that can be satisfied by the feature being missing is not
       pinning the feature. So the height is resolved here the way a browser resolves
       it, and the assertion is the RESULTING PIXEL VALUE at a viewport.
       For the record, specificity was never the mechanism and no source-order fix was
       ever needed: `#sticky[data-pos="corner"] #stickyPad` is two ids and an attribute
       against the base's one id, so it outranks `#stickyPad` wherever its band is
       live, in any order the two are written in. What was wrong was that it was not
       in the served file. */
    /* the cascade resolver these heights are read through is shared with the layout
       boundary pin below, so it lives at file scope: specOf, mediaLive, unjudged and
       cascade. Two sections resolving the sheet by two copies of the same walker is
       how one of them goes quietly stale. */
    const padAt=(pos,vw,vh)=>{
      const st=q('#sticky'), was=st.getAttribute('data-pos');
      st.setAttribute('data-pos',pos);
      const v=cascade(q('#stickyPad'),'height',vw,vh);
      if(was===null) st.removeAttribute('data-pos'); else st.setAttribute('data-pos',was);
      return v;
    };
    ok(/#stickyPad\{[^}]*height:92px/.test(css),
      'the 92px base is still declared, now as the floor the placements override');
    /* THE CORNER, BAND BY BAND. 92px must appear nowhere in this column: the moment
       it does, the corner is back on the base and the reservation below is holding
       room open for a pad that is not there. */
    ok(padAt('corner',1024,768)==='184px',
      'the corner resolves to 184px from 901 to 1199, where it is 232px wide and never '+
      'reaches a day column add control: '+padAt('corner',1024,768));
    ok(padAt('corner',1280,800)==='130px',
      'and comes down to 130px at 1200 to 1821 on a short viewport, 23px inside the '+
      '152-passes-154-fails cliff: '+padAt('corner',1280,800));
    ok(padAt('corner',1365,800)==='130px',
      'including at the 1365 that was reported resolving to the 92px base: '+padAt('corner',1365,800));
    ok(padAt('corner',1440,1050)==='184px'&&padAt('corner',1920,1080)==='184px',
      'and pays the full 184px once the viewport is 1000px tall, the axis that imposed '+
      'the cap: '+padAt('corner',1440,1050)+' / '+padAt('corner',1920,1080));
    ok(padAt('corner',820,1180)==='168px',
      'under 900px the corner is not a corner at all: the in-flow pad keeps its 168');
    /* THE BASE IS DOWN TO ONE READER, and it is the Notes strip below 1200. That is
       the guarantee the deleted "the corner never takes the double" meant to make. */
    ok(padAt('top',1024,768)==='92px',
      'the Notes strip from 901 to 1199 is the one placement still reading the base');
    ok(padAt('top',1280,800)==='184px'&&padAt('top',1920,1080)==='184px',
      'the strip doubles at 1200 and up, where the pane can pay it, and stays doubled '+
      'in the three-column band: '+padAt('top',1280,800)+' / '+padAt('top',1920,1080));
    ok(padAt('top',820,1180)==='168px','and the narrow flow is 168 in either placement');
    ok(!unjudged.length,
      'every band gating this height is a plain width or height query, so the resolver '+
      'judges all of them: '+unjudged.join('; '));

    /* ---------- THE RESERVATION, AS THE INEQUALITY IT CLAIMS TO BE ----------
       #main.stickycorner .colbody's padding-bottom is the vertical twin of #board's
       padding-right: it is what gives a column enough scroll to put its tail, the
       "+ add" row included, clear of the corner. The sheet states the guarantee as
       reservation >= corner height + its 18px offset, so that is what is checked, at
       every band, against the RESOLVED pad rather than against the two numbers the
       comments happen to name. Grow the pad and forget the padding and this fails
       here rather than as hit-test misses in the browser pass. */
    const cb=q('.colbody');
    ok(!!cb,'a day column has a scrolling body to carry the reservation');
    const resAt=(vw,vh)=>parseFloat(cascade(cb,'padding-bottom',vw,vh))||0;
    const off=+((css.match(/#sticky\{[^}]*bottom:(\d+)px/)||[])[1])||0;
    /* the pad is not the whole corner: #sticky's 8+9 of padding, 2 of border, the 3px
       flex gap and the 15px cap box stand above it. 37, measured once, named here. */
    const CHROME=17+2+3+15;
    for(const [vw,vh] of [[1024,768],[1280,800],[1365,800],[1440,1050],[1920,1080]]){
      const pad=parseFloat(padAt('corner',vw,vh)), need=pad+CHROME+off;
      ok(resAt(vw,vh)>=need,
        'the column reserves the corner it actually has at '+vw+'x'+vh+': '+resAt(vw,vh)+
        ' >= '+pad+' + '+CHROME+' + '+off+' = '+need);
    }
    /* the reservation is the thing that keeps the last column clear AND, because
       it counts inside the board's scroll width, is what stops a non-scrolling
       board from ever putting a column under the corner. It must track the
       corner's own width, so it repeats the same expression. */
    const res=(wide.match(/#main\.stickycorner #board\{padding-right:([^}]*)\}/)||[])[1]||'';
    ok(/264px/.test(res),'the base reservation is the base corner width plus its 32px offset');
    /* Notes keeps the doubled width it already had; no pass has touched widths since */
    ok(/#sticky\[data-pos="top"\]\{[^}]*width:464px/.test(wide),
      'the Notes strip keeps its 464px width, untouched by the placement move');
    /* the order lives in the WIDE band only. Under 900px there is no right hand
       side to sit at, and 205px of pad hoisted above the list would bury the list
       and stand in the way of the keyboard, so narrow keeps it at the end. */
    ok(/#sticky\[data-pos="top"\]\{[^}]*order:-1/.test(wide),
      'the top placement takes its order inside the 901px band, where a right hand side exists');
    ok(!/order:\s*-1/.test(narrowB),
      'and under 900px the pad stays at the end of the flow, clear of the list and the keyboard');
    /* narrow keeps 168. Height is uncovered there but it is not free of scroll:
       a near-empty board at 820 measures exactly 1180 of 1180, so 336 would start
       a scroll that was not there, and it is most of a phone screen with the
       keyboard up. Doubled once (84 to 168), not twice. */
    ok(/#stickyPad\{height:168px/.test(narrowB),
      'the narrow pad stays at 168, because doubling again starts a scroll at 820 that was not there');
    ok(/font-size:16px/.test(narrowB),'and keeps the 16px that stops the browser zooming on focus');

    /* THE THIRD COLUMN, and the width that pays for it. Above the threshold the strip
       stops being a row of #main's column and becomes a grid track beside the list and
       the editor, so all three start at the content top and the band the strip held
       open across the top is gone rather than moved somewhere else. The band is found
       by what it DOES (the track that saturates at 464px) rather than by its number,
       so the arithmetic below is free to disagree with it and say so. */
    const threeM=[...css.matchAll(/@media \(min-width:(\d+)px\)\{([\s\S]*?)\n\}/g)]
      .find(m=>/grid-template-columns:[^;]*464px/.test(m[2]));
    const threeW=threeM?+threeM[1]:NaN, three=threeM?threeM[2]:'';
    ok(three,'the strip has a third-column band of its own above the two-column grid');
    /* THE STRIP'S TRACK IS FLEXIBLE, WHICH IS THE 2026-08-17 CORRECTION: the old band
       started at 1822 by asking for the strip's DOUBLED 464px as a prerequisite, the
       one ceiling in a sum of floors, so between 1554 and 1821 the two-row grid held a
       221px row for the strip while leaving MORE dead canvas beside it than the strip
       takes. Now the editor track floors at its 718 and the strip takes what the row
       leaves, saturating at 464 exactly where the old band began, so 1822 and up
       resolves pixel for pixel the layout the fixed band drew. */
    const gridDecl=((three.match(/#main\.stickytop\{[^}]*grid-template-columns:([^;]*)/)||[])[1]||'').trim();
    const trackM=gridDecl.match(/^272px minmax\((\d+)px,1fr\) minmax\((\d+)px,(\d+)px\)$/);
    ok(!!trackM,'three tracks: the 272px list, a floored editor, and a strip the row sizes: '+gridDecl);
    const edFloor=trackM?+trackM[1]:NaN, stripMin=trackM?+trackM[2]:NaN, stripMax=trackM?+trackM[3]:NaN;
    ok(/#main\.stickytop\{[^}]*grid-template-rows:minmax\(0,1fr\)/.test(three),
      'one row, so the three share a top edge and the list and the editor still fill the pane');
    ok(/#main\.stickytop \.notelist\{grid-row:1\}/.test(three),
      'the list drops its two-row span, there being only one row left to sit in');
    ok(/#main\.stickytop \.noteed\{grid-column:2;grid-row:1\}/.test(three),
      'the editor takes the middle track, beside the list rather than under the strip');
    ok(/#main\.stickytop #sticky\{grid-column:3;grid-row:1;margin:0;width:auto;justify-self:stretch\}/.test(three),
      'and the strip takes the third at width:auto, so the TRACK sizes it: the 464px '+
      'declaration belongs to the two-row bands and would overflow a narrow track');
    /* IN FLOW, still. A grid track cannot be floated over .ntools, Unpin or Delete, and
       width does not relax that refusal: the wider the pane, the more of those controls
       an overlay would reach. Nothing in the band may position the strip. */
    ok(!/position:\s*(absolute|fixed)/.test(three),
      'nothing in the band positions the strip: it is a column there, never an overlay');
    ok(!/#sticky\[data-pos="top"\]/.test(three)&&!/#stickyPad/.test(three),
      'the strip keeps its 184px pad: the band resizes only the width, on the track');
    ok(!/stickycorner/.test(three),
      'and the board corner is not in the band at all, at any width, which is risk 16 kept shut');
    ok(css.indexOf('@media (min-width:'+threeW+'px)')>css.indexOf('@media (min-width:1200px)'),
      'the wider branch is declared after the two-column grid, so it is the one that applies');
    /* THE THRESHOLD IS ARITHMETIC, checked against the parts rather than written twice,
       and since the track went flexible there are TWO identities to hold. The editor
       track has to carry .notewrap's reading measure whole: the measure plus
       .notepage's padding and border, .noteed's own padding and the scrollbar gutter a
       scrolling note takes. Beside it stand the list and the strip's minmax floor with
       the grid's two gaps, inside a content area that is the viewport less the rail
       and #main's padding: that sum is where the band starts. INDEPENDENTLY, the band
       must start exactly where the two-row grid's dead canvas beside the full strip
       would out-measure the strip itself (rail + padding + list + gap + 464 + 464),
       which is the criterion that DERIVED the floor rather than choosing it. Change
       the list, the strip, the gap, the measure, the rail or any of the padding and
       one of these stops adding up, rather than the editor quietly losing the measure
       the numbers exist to protect. */
    const num=re=>{const m=css.match(re);return m?+m[1]:NaN};
    const parts={
      list:num(/\.notelist\{width:(\d+)px/),
      strip:num(/#sticky\[data-pos="top"\]\{[^}]*width:(\d+)px/),
      gap:num(/#main\.stickytop\{[^}]*column-gap:(\d+)px/),
      rail:num(/--rail:(\d+)px/),
      mainPad:num(/#main\{[^}]*padding:\d+px (\d+)px/),
      measure:num(/\.notewrap\{width:(\d+)px/),
      pagePad:num(/\.notepage\{[^}]*padding:\d+px (\d+)px/),
      pageBorder:num(/\.notepage\{[^}]*border:(\d+)px solid/),
      edPad:num(/\.noteed\{[^}]*padding:\d+px (\d+)px/),
      bar:num(/\*::-webkit-scrollbar\{width:(\d+)px/),
    };
    ok(Object.values(parts).every(n=>n>0),'every part of the threshold reads off the sheet: '+
      JSON.stringify(parts));
    const editor=parts.measure+2*parts.pagePad+2*parts.pageBorder+parts.edPad+parts.bar;
    ok(editor===718,'the editor track needs 718px to leave the 640px measure whole: '+editor);
    ok(edFloor===editor,'and the band floors the editor track at exactly that: '+edFloor);
    ok(stripMax===parts.strip,
      'the strip saturates at the same 464 the two-row bands declare: '+stripMax);
    const fixed=parts.list+parts.gap+editor+parts.gap+2*parts.mainPad+parts.rail;
    ok(fixed+stripMin===threeW,'the band starts exactly where the parts add up, not at a '+
      'round number: '+[parts.list,parts.gap,editor,parts.gap,stripMin,2*parts.mainPad,parts.rail]
      .join(' + ')+' = '+(fixed+stripMin)+', band at '+threeW);
    const deadEq=parts.rail+2*parts.mainPad+parts.list+parts.gap+parts.strip+parts.strip;
    ok(deadEq===threeW,'and exactly where the two-row grid would leave more dead canvas '+
      'beside the strip than the strip takes: '+parts.rail+' + '+2*parts.mainPad+' + '+
      parts.list+' + '+parts.gap+' + '+parts.strip+' + '+parts.strip+' = '+deadEq);
    ok(fixed+parts.strip===1822,
      'the saturation point is the old 1822 threshold, so nothing above it moved: '+
      (fixed+parts.strip));
    /* the rail COLLAPSED only ever hands the content area more room (the freed column,
       less the 56px the restore button stands in), so the branch can never be reached
       with less width than it was cut for. Stated as a test so a later change to the
       collapsed padding has to face it. */
    const railOff=num(/:root\[data-rail="off"\] #main\{padding-left:(\d+)px\}/);
    ok(railOff>0&&railOff+parts.mainPad<parts.rail+2*parts.mainPad,
      'and collapsing the rail only widens the content area, so the threshold is cut for '+
      'the tighter expanded case: '+railOff+' + '+parts.mainPad+' against '+
      (parts.rail+2*parts.mainPad));
  }
  /* THE DEAD BAND, which was never the tray's. A slot a render can empty must
     carry its spacing on :not(:empty), the contract #habits, #weekMobile and
     #tray already kept; #boardnav and #strip did not, and in Notes they held
     11px and 9px of canvas open above the pane on top of the sticky's 138px. */
  {
    const css=html.slice(html.indexOf('<style>'),html.indexOf('</style>'));
    ok(/#boardnav\{[^}]*\}/.test(css)&&!/#boardnav\{[^}]*margin-bottom/.test(css),
      'the board nav carries no margin while it is empty');
    ok(/#boardnav:not\(:empty\)\{margin-bottom:11px\}/.test(css),
      'it takes its 11px only when it has drawn something');
    ok(/#strip:not\(:empty\)\{display:flex\}/.test(css),
      'and the day strip stays display:none while empty, so its padding cannot hold a band either');
    ok(/#tray:not\(:empty\)\{margin-bottom:12px\}/.test(css),
      'the tray slot itself always collapsed correctly, which is why it was not the cause');
  }

  const sig0=A.stateSig(S());
  pad.value='changed text'; fire(pad,'input'); await wait(10); A.save(); await wait(10);
  ok(A.stateSig(S())!==sig0,'a sticky edit changes the signature, so sync pushes it');
  pad.value=''; fire(pad,'input'); await wait(10); A.save(); await wait(10);
}

console.log('— the carry tray is a board panel, and Notes does not draw it —');
{
  /* A PRESENTATION decision and nothing else. The roll, its Monday 00:00 local
     timing and state.carry are untouched by the view: the same items sit in carry
     the whole way round and are back on screen the moment the board is. The slot is
     EMPTIED rather than hidden, so `#tray:not(:empty)` collapses the band with no
     second mechanism, and no triage control is left built in a view that does not
     offer triage. */
  const carry=()=>JSON.stringify(S().carry);
  S().carry=[{id:'cv1',title:'Email the landlord',done:false,subtasks:[],up:1,pos:1,from:'Prio 0 · Mon'},
             {id:'cv2',title:'Book the dentist',done:false,subtasks:[],up:1,pos:1,from:'Prio 0 · Mon'}];
  S().settings.view='board'; S().settings.floatMode=false; A.render(); await wait(20);
  ok(/Carry-over/.test(q('#tray').textContent),'the tray draws on the board, exactly as it did');
  const before=carry(), roll0=S().settings.lastRoll;
  S().settings.floatMode=true; A.render(); await wait(20);
  ok(/Carry-over/.test(q('#tray').textContent),'and on Free Floating, which is a mode of the same view');
  S().settings.floatMode=false; S().settings.view='notes'; A.render(); await wait(20);
  ok(q('#tray').innerHTML==='','in Notes the slot is emptied, so the tray is not drawn at all');
  ok(!q('[data-action="carry-all"]')&&!q('[data-action="carry-one"]')&&!q('[data-action="carry-drop"]'),
    'and no triage control survives in the DOM, which a hidden tray would have left there');
  ok(carry()===before,'the carried items are untouched: none dropped, marked or re-dated by the view');
  ok(S().settings.lastRoll===roll0,'and the roll never ran, so its Monday 00:00 local timing is its own');
  S().settings.view='calendar'; A.render(); await wait(20);
  ok(/Carry-over/.test(q('#tray').textContent),'the calendar is unchanged by this: only Notes opts out');
  S().settings.view='board'; A.render(); await wait(20);
  ok(/Carry-over/.test(q('#tray').textContent)&&S().carry.length===2,
    'and both items are back on the board, still waiting to be triaged');
  S().carry=[]; A.render(); await wait(20);
}

console.log('— the tray collapses by default, and the accent it carries —');
{
  /* THE COLLAPSE IS PRESENTATION, PER DEVICE. settings.trayOpen sits on VIEWSET
     beside habitsOpen, outside stateSig, defaulting to false: a carry ARRIVES as a
     header bar with the shared chevron and an "N waiting" count, and the items with
     their triage controls draw only once it is opened. */
  ok(A.fresh().settings.trayOpen===false,'a fresh planner starts with the tray collapsed');
  S().settings.view='board'; S().settings.floatMode=false; S().settings.trayOpen=false;
  S().days={};
  S().carry=[{id:'tc1',title:'left from Monday',done:false,subtasks:[],up:1,pos:1,from:'Prio 0 · Mon'},
             {id:'tc2',title:'and another',done:false,subtasks:[],up:1,pos:1,from:'Prio 1 · Tue'}];
  A.render(); await wait(20);
  ok(!!q('#tray .tray.closed')&&!!q('#tray .trayhead[data-action="tray-toggle"]'),
    'with items and the flag down, the tray is a header bar carrying the toggle');
  ok(!!q('#tray .trayhead .chev')&&!q('#tray .trayhead .chev.open'),
    'with the shared chevron pointing right, the way every collapsed panel says closed');
  ok(q('#tray .traycnt').textContent==='2 waiting','and the count, the way "0 open" counts');
  ok(!q('#tray .trayitem')&&qa('#tray .tbtn').length===0,
    'no item and no triage control is built while the bar is closed');
  click('[data-action="tray-toggle"]'); await wait(25);
  ok(S().settings.trayOpen===true,'the header press opens it');
  ok(qa('#tray .trayitem').length===2&&qa('#tray .trayhead .tbtn').length===2,
    'open, both items and both bulk actions are there to use');
  ok(!!q('#tray .trayhead .chev.open'),'and the chevron turns down');
  ok(q('#tray .traycnt').textContent==='2 waiting','the count stays on the open bar');
  A.render(); await wait(20);
  ok(qa('#tray .trayitem').length===2,'a re-render keeps it open: a flag, not a peek');
  /* BOTH DIRECTIONS, driven through the header itself. This is the assertion the
     2026-08-17 pass lacked: it pressed the header once, asserted "opens", and every
     later collapse in either suite went through rollover or an emptying triage, so a
     header that opened and never closed, half a toggle, would have passed everything.
     Same shape as the Section 18.1 absence assertions: green against a half-built
     feature. The press on the LABEL is the exact reported gesture, and it must reach
     the toggle because the action sits on the whole header, as on .kh and .hhead. */
  q('#tray .trayhead b').click(); await wait(25);
  ok(S().settings.trayOpen===false,
    'a press on the label text itself closes it: the whole header is the toggle');
  ok(!!q('#tray .tray.closed')&&!q('#tray .trayitem')&&qa('#tray .tbtn').length===0,
    'closed again, the items and every triage control leave the DOM');
  ok(!!q('#tray .trayhead .chev')&&!q('#tray .trayhead .chev.open'),
    'the chevron is drawn in the closed state too, pointing right as the idiom says closed');
  ok(q('#tray .traycnt').textContent==='2 waiting','and the count stays on the bar');
  click('[data-action="tray-toggle"]'); await wait(25);
  ok(S().settings.trayOpen===true&&qa('#tray .trayitem').length===2&&
     !!q('#tray .trayhead .chev.open'),
    'the next press opens it again with the chevron turned: a toggle, not a one-way latch');
  /* NEVER A SYNC: the flag is settings, outside stateSig, and rides VIEWSET */
  {
    const sig0=A.stateSig(S());
    S().settings.trayOpen=false;
    ok(A.stateSig(S())===sig0,'toggling the flag never changes the signature, so it never pushes');
    S().settings.trayOpen=true;
    ok(/'noteSel','trayOpen'/.test(html),
      'and it rides VIEWSET beside noteSel, so a Pull never imports another screen tray');
  }
  /* FRESH ARRIVAL RE-COLLAPSES: rollover drops the flag whenever it moves items in */
  S().days[plus(-3)]={must:[{id:'tc3',title:'stale one',done:false,subtasks:[]}],should:[],extra:[]};
  S().settings.lastRoll=null;
  A.rollover(); A.render(); await wait(20);
  ok(S().settings.trayOpen===false&&!q('#tray .trayitem'),
    'rollover lands the tray collapsed even if it stood open');
  ok(q('#tray .traycnt').textContent==='3 waiting','with the count grown to the new arrival');
  /* TRIAGE THAT EMPTIES IT drops the flag too, so a sync-only arrival also starts closed */
  click('[data-action="tray-toggle"]'); await wait(25);
  click('[data-action="carry-all"][data-to="today"]'); await wait(25);
  ok(S().carry.length===0&&S().settings.trayOpen===false,
    'emptying by triage puts the flag down for the next arrival');
  ok(q('#tray').innerHTML==='','and an empty carry draws NOTHING: no bar, no dead band');
  click('[data-action="undo"]'); await wait(25);
  ok(S().carry.length===3&&S().settings.trayOpen===true,
    'the undo brings the items back into an OPEN tray, the state triage happened in');
  ok(qa('#tray .trayitem').length===3,'drawn open, ready to keep triaging');
  /* THE ACCENT: the dot reads --today, non-text, measured over the 3:1 bar */
  const cssAll=html.slice(html.indexOf('<style>'),html.indexOf('</style>'));
  ok(/\.traydot\{[^}]*background:var\(--today\)/.test(cssAll),
    'the tray dot reads --today, the accent that already means attention here');
  ok(!/\.trayhead b::before/.test(cssAll),'the old teal pseudo dot is gone, not doubled');
  ok(!!q('#tray .traydot'),'and the dot is a real element the red sweep can see');
  ok(!/\.traydot\{[^}]*color:/.test(cssAll)&&!/\.traycnt\{[^}]*--today/.test(cssAll)&&
     !/\.trayhead[^{]*\{[^}]*--today/.test(cssAll),
    'the accent inks no text: mono red on --traybg is a 3:1 accent, not 4.5:1 ink');
  {
    const lin=c=>{c/=255;return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4)};
    const lum=h=>{h=h.replace('#','');return 0.2126*lin(parseInt(h.slice(0,2),16))+0.7152*lin(parseInt(h.slice(2,4),16))+0.0722*lin(parseInt(h.slice(4,6),16))};
    const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
    const monoB=(cssAll.match(/:root\[data-theme="mono"\]\{[^}]*\}/)||[''])[0];
    const rootB=(cssAll.match(/:root\{[^}]*\}/)||[''])[0];
    const monoToday=(monoB.match(/--today:(#[0-9A-Fa-f]{6})/)||[])[1];
    const monoTray=(monoB.match(/--traybg:(#[0-9A-Fa-f]{6})/)||[])[1];
    const skyToday=(rootB.match(/--today:(#[0-9A-Fa-f]{6})/)||[])[1];
    const pearl=(rootB.match(/--pearl:(#[0-9A-Fa-f]{6})/)||[])[1];
    ok(monoToday&&monoTray&&ratio(monoToday,monoTray)>=3,
      'mono: the red dot reads at '+(monoToday&&monoTray?ratio(monoToday,monoTray).toFixed(2):'?')+
      ' on the tray surface, over the 3:1 non-text bar');
    ok(skyToday&&pearl&&ratio(skyToday,pearl)>=3,
      'cloud blue: the teal dot reads at '+(skyToday&&pearl?ratio(skyToday,pearl).toFixed(2):'?')+
      ' on the tray sheen pearl, same bar, no red near the theme');
  }
  /* HONESTY IF ONE EVER GETS THROUGH. The merge repairs done-in-carry at the axis that
     manufactured it, so nothing should reach the tray ticked. If a future regression
     does, it must be VISIBLE rather than one more untidy row: drawn done, and left out
     of the count, so the bar disagrees with its own list. */
  S().carry=[{id:'td1',title:'still waiting',done:false,subtasks:[],up:1,pos:1,from:'Prio 0 · Mon'},
             {id:'td2',title:'finished somehow',done:true,subtasks:[],up:1,pos:1,from:'Prio 1 · Tue'}];
  S().settings.trayOpen=true; A.render(); await wait(20);
  ok(q('#tray .traycnt').textContent==='1 waiting',
    'a done task in the tray is not counted as waiting: the count counts triage, not rows');
  ok(qa('#tray .trayitem').length===2,'it is still drawn, not quietly hidden');
  ok(!!q('#tray .trayitem.done')&&q('#tray .trayitem.done .t').textContent==='finished somehow',
    'and it is the ticked one that carries the mark');
  ok(/\.trayitem\.done \.t\{[^}]*text-decoration:line-through/.test(cssAll)&&
     /\.trayitem\.done \.t\{[^}]*color:var\(--mut2\)/.test(cssAll),
    'struck through in the same --mut2 a finished card takes, with no colour of its own');
  /* the drop control is a glyph, so its name is the aria-label, like the two beside it */
  ok(q('[data-action="carry-drop"]').getAttribute('aria-label')==='Drop from the tray',
    'the carry drop control carries an accessible name rather than a bare glyph');
  ok(!!q('[data-action="carry-drop"]').getAttribute('title'),'and a title, so a pointer gets it too');
  S().carry=[]; S().settings.trayOpen=false; A.render(); await wait(20);

  /* the coarse block gives the header its finger */
  ok(/\.trayhead\[data-action\]\{min-height:44px\}/.test(cssAll.slice(cssAll.indexOf('@media (pointer:coarse)'))),
    'on a coarse pointer the header bar grows to 44px for real');
  /* hand the board back */
  S().carry=[]; S().settings.trayOpen=false;
  S().days={}; S().settings.lastRoll=T();
  A.save(); A.render(); await wait(20);
}

console.log('— the tray flag comes down when another device empties the carry —');
{
  /* THE REPORTED HOLE. trayOpen is put down at every path that makes the next
     appearance a fresh arrival: rollover drops it, and local triage that empties the
     tray drops it. A carry emptied by the OTHER device went through neither, so the
     flag stayed up from the session that opened the tray, and the next carry to arrive
     by sync alone drew as the open list and took the top of the board, which is the one
     thing the collapse contract exists to stop. The rule now sits in adopt(), the single
     funnel every foreign state comes through. */
  const cloud={row:null};
  const net=async(url,opts)=>{
    opts=opts||{};
    if((opts.method||'GET').toUpperCase()==='GET')
      return {ok:true,status:200,text:async()=>'',
        json:async()=>cloud.row?[{data:cloud.row.data,updated_at:cloud.row.updated_at}]:[]};
    const b=JSON.parse(opts.body)[0];
    cloud.row={data:JSON.parse(JSON.stringify(b.data)),updated_at:b.updated_at};
    return {ok:true,status:200,text:async()=>'',json:async()=>[]};
  };
  const d=new JSDOM(html,{runScripts:'dangerously',url:'http://localhost/',pretendToBeVisual:true,
    beforeParse(win){ win.fetch=net;
      win.localStorage.setItem('agora_dayplanner_synckey','hs-tray') }});
  await wait(300);
  const win=d.window, dc=win.document, AA=win.A;
  const st=()=>AA.state, items=()=>dc.querySelectorAll('.trayitem').length;
  const mk=(id,title,pos)=>({id,title,done:false,subtasks:[],up:1,dn:1,pos,from:'Prio 0 · Mon'});

  st().days={}; st().carry=[]; st().settings.lastRoll=T(); AA.save(); await wait(20);
  st().carry=[mk('sy1','left from Monday',1000),mk('sy2','and another',1000)];
  st().settings.trayOpen=true; AA.save(); AA.render(); await wait(30);
  ok(items()===2&&st().settings.trayOpen===true,'the tray stands open, mid triage, with two items');
  await AA.syncCycle({}); await wait(60);
  ok(!!cloud.row,'the cloud holds this device copy');

  /* the other device triages the lot: both land on today, its carry is empty, and its
     move is the newer one on the pos axis */
  const later=Date.now()+1000;
  cloud.row.data.carry=[];
  cloud.row.data.days[T()]={must:[Object.assign(mk('sy1','left from Monday',later),{from:null}),
    Object.assign(mk('sy2','and another',later),{from:null})],should:[],extra:[]};
  cloud.row.updated_at=new Date(later).toISOString();
  await AA.syncCycle({}); await wait(60);
  ok(st().carry.length===0,'the merge brings the other device triage across');
  ok(st().settings.trayOpen===false,'and the flag comes down with the last item, as local triage does');
  ok(dc.querySelector('#tray').innerHTML==='','an emptied carry still draws nothing at all, bar included');

  /* LATER: a carry arrives by sync alone. No local roll ran, so the flag is the only
     thing deciding how it draws. */
  const later2=Date.now()+2000;
  cloud.row.data.carry=[mk('sy3','left from Tuesday',later2)];
  cloud.row.updated_at=new Date(later2).toISOString();
  await AA.syncCycle({}); await wait(60);
  ok(st().carry.length===1,'the new carry arrives from the other device');
  ok(!!dc.querySelector('#tray .tray.closed')&&items()===0,
    'and draws as the collapsed bar, not as the open list the earlier session left behind');
  ok(dc.querySelector('#tray .traycnt').textContent==='1 waiting','counting the one that waits');
  ok(dc.querySelectorAll('#tray [data-action^="carry-"]').length===0,
    'with no triage control built in a bar nobody has opened');
  win.close();
}

console.log('— sticky note: merge, the honest limit said plainly —');
{
  const sdev=t=>{const s=dev(); if(t) s.sticky=t; return s};
  { /* two edits: the later stamp takes the WHOLE text, the loser is gone */
    const a=sdev({text:'newer text, kept',at:500}), b=sdev({text:'older text, lost',at:400});
    const m=A.mergeStates(a,b);
    ok(m.sticky.text==='newer text, kept','two sticky edits: the later one wins whole');
    ok(JSON.stringify(m).indexOf('older text')===-1,
      'the losing text is silently gone, nowhere in the merged state, bin included');
    ok(A.stateSig(m)===A.stateSig(A.mergeStates(b,a)),'and both devices agree which survived');
  }
  { /* the same moment on both sides still converges */
    const a=sdev({text:'tied A',at:500}), b=sdev({text:'tied B',at:500});
    ok(A.stateSig(A.mergeStates(a,b))===A.stateSig(A.mergeStates(b,a)),
      'a tied stamp resolves the same way on both devices');
  }
  { /* a device that predates the sticky cannot blank it */
    const a=sdev(null), b=sdev({text:'kept across versions',at:100});
    const m=A.mergeStates(a,b);
    ok(m.sticky.text==='kept across versions','a pre-sticky planner cannot drop the text');
    ok(A.stateSig(m)===A.stateSig(A.mergeStates(b,a)),'from either direction');
  }
  { /* an old cloud copy reads clean */
    const legacy={days:{},floats:[{id:'f1',name:'Inbox',tasks:[]}],settings:{}};
    const read=A.readCloud(clone(legacy));
    ok(!!read&&read.sticky.text===''&&read.sticky.at===0&&read.folders.length===0,
      'an old cloud copy reads with an empty sticky and no folders, never undefined');
  }
}

console.log('— nav: the active view carries the accent —');
{
  const css=html.slice(html.indexOf('<style>'),html.indexOf('</style>'));
  ok(/\.navbtn\.on\{[^}]*inset 3px 0 0 var\(--today\)/.test(css),
    'the active nav item draws an accent bar from the today variable');
  ok(/\.navbtn\.on \.em\{color:var\(--today\)\}/.test(css),'and tints its icon the same way');
  /* one variable, two palettes: red in mono, the teal now-marker in cloud blue,
     so no red is ever imported into the blue palette and the mono whitelist
     needs no new entry for it */
  const rootBlock=(css.match(/:root\{[^}]*\}/)||[''])[0];
  const monoBlock=(css.match(/:root\[data-theme="mono"\]\{[^}]*\}/)||[''])[0];
  ok(/--today:#567C8D/.test(rootBlock),'cloud blue: the accent is the palette today teal');
  ok(/--today:#E8443C/.test(monoBlock),'mono: the accent is the existing red');

  S().settings.view='board'; S().settings.floatMode=false; A.save(); A.render(); await wait(25);
  const onBtns=()=>qa('#rail .navbtn.on').map(b=>b.textContent.trim());
  ok(onBtns().join()==='Board','Board holds the mark on the board view');
  ok(q('#rail .navbtn[data-v="board"]').getAttribute('aria-current')==='page',
    'and names itself the current page');
  S().settings.view='calendar'; A.render(); await wait(25);
  ok(onBtns().join()==='Calendar','Calendar takes it on the calendar view');
  ok(!q('#rail .navbtn[data-v="board"]').getAttribute('aria-current'),'and Board has let it go');
  S().settings.view='notes'; A.render(); await wait(25);
  ok(onBtns().join()==='Notes','Notes takes it on the notes view');
  S().settings.view='board'; S().settings.floatMode=true; A.render(); await wait(25);
  ok(qa('#rail .navbtn.on').some(b=>/Back to dates/.test(b.textContent)),
    'Free Floating is marked while float mode is on');
  ok(q('#rail .navbtn[data-action="floattoggle"]').getAttribute('aria-current')==='page',
    'and named current');
  S().settings.floatMode=false; A.save(); A.render(); await wait(20);
}

console.log('— True north: red statements on a light backdrop, measured —');
{
  const css=html.slice(html.indexOf('<style>'),html.indexOf('</style>'));
  ok(/#fpanel\{background:var\(--northbg\)/.test(css),'the panel backdrop is its own variable');
  ok(/#fpanel \.frow:not\(\.done\) \.ftxt\{[^}]*color:var\(--north\)/.test(css),
    'held statements read the statement ink variable');
  ok(/#fpanel \.frow:not\(\.done\) \.ftxt\{[^}]*font-size:19px/.test(css)&&
     /#fpanel \.frow:not\(\.done\) \.ftxt\{[^}]*font-weight:700/.test(css),
    'statements are 19px at 700: WCAG large text, so the 3:1 bar is the one they must hold');
  ok(/\.frow\.done \.ftxt\{[^}]*font-size:12\.5px/.test(css),
    'set-aside statements keep their muted small face: only held ones are highlighted');

  const rootBlock=(css.match(/:root\{[^}]*\}/)||[''])[0];
  const monoBlock=(css.match(/:root\[data-theme="mono"\]\{[^}]*\}/)||[''])[0];
  ok(/--north:#3F6488/.test(rootBlock),
    'cloud blue statements are the palette text-safe denim, the zone-button ink, not an imported red');
  ok(/--northbg:#F6F6F7/.test(rootBlock),'on #F6F6F7, the app stand-in for white');
  ok(/--north:#E8443C/.test(monoBlock),'mono statements are the existing red, no second red invented');
  ok(/--northbg:#F6F6F7/.test(monoBlock),'on that same #F6F6F7, so the panel is a light island in both themes');
  const bgSky=(rootBlock.match(/--northbg:\s*(#[0-9A-Fa-f]{6})/)||[])[1];
  const bgMono=(monoBlock.match(/--northbg:\s*(#[0-9A-Fa-f]{6})/)||[])[1];
  ok(!!bgSky&&bgSky===bgMono,'both themes name one backdrop value ('+bgSky+' / '+bgMono+')');
  /* white in effect, never #ffffff: the backdrop is mono's brightest existing
     value, which is what lets the no-pure-white rule stand with no exception */
  ok(!/#fff\b|#ffffff/i.test(bgSky||''),'and it is not pure white, so the no-white rule needs no exception');

  /* the panel is a light island, so it carries its OWN ink set: a dark theme
     cannot lend a near-white panel its near-white inks. Both blocks declare the
     whole set, the same contract every other role in the palette lives under. */
  const NORTHVARS=['northtxt','northmut','northmut2','northline','northfield','northink-rgb','northfocus','northfocus-rgb'];
  const missSky=NORTHVARS.filter(v=>!new RegExp('--'+v+'\\s*:').test(rootBlock));
  const missMono=NORTHVARS.filter(v=>!new RegExp('--'+v+'\\s*:').test(monoBlock));
  ok(missSky.length===0,'cloud blue declares the whole panel ink set ('+missSky.join(',')+')');
  ok(missMono.length===0,'mono declares the whole panel ink set ('+missMono.join(',')+')');
  ok(/#fpanel\{[^}]*--txt:var\(--northtxt\)/.test(css)&&/#fpanel\{[^}]*--mut:var\(--northmut\)/.test(css)&&
     /#fpanel\{[^}]*--cloud:var\(--northfield\)/.test(css),
    'the panel re-points the roles once, so no rule inside it has to know its theme');

  /* contrast measured, not eyeballed, and the backdrop really is lighter than the rail */
  const lin=c=>{c/=255;return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4)};
  const lum=h=>{h=h.replace('#','');return 0.2126*lin(parseInt(h.slice(0,2),16))+0.7152*lin(parseInt(h.slice(2,4),16))+0.0722*lin(parseInt(h.slice(4,6),16))};
  const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
  const rSky=ratio('#3F6488',bgSky), rMono=ratio('#E8443C',bgMono);
  ok(rSky>=4.5,'cloud blue: statement ink on its backdrop measures '+rSky.toFixed(2)+', over 4.5');
  ok(rMono>=3&&rMono<4.5,
    'mono: red on its backdrop measures '+rMono.toFixed(2)+': over the large-text bar, under the normal one, which is why the 19px/700 face is load-bearing');
  /* the whole island, role by role, on the backdrop it actually sits on */
  const readV=b=>{const o={};[...b.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9A-Fa-f]{6})\b/g)].forEach(m=>o[m[1]]=m[2]);return o};
  for(const [nm,blk,bg] of [['cloud blue',rootBlock,bgSky],['mono',monoBlock,bgMono]]){
    const v=readV(blk);
    ok(ratio(v.northtxt,bg)>=4.5,nm+': the panel strong ink reads at '+ratio(v.northtxt,bg).toFixed(2));
    ok(ratio(v.northmut,bg)>=4.5,nm+': the panel label ink reads at '+ratio(v.northmut,bg).toFixed(2));
    ok(ratio(v.northmut2,bg)>=3,nm+': the panel whisper ink holds 3+ at '+ratio(v.northmut2,bg).toFixed(2));
    ok(ratio(v.northtxt,v.northfield)>=4.5,nm+': the add field text reads on the field at '+ratio(v.northtxt,v.northfield).toFixed(2));
    ok(v.northline!==bg,nm+': the panel has a rim at all, distinct from its own surface');
  }
  /* the rim is the half of "panel, not hole" that the stylesheet owns, and the two
     themes need different amounts of it. Cloud blue's panel was always a light card
     on a light rail and keeps the palette hairline it always drew, unchanged. Mono's
     panel is new: a near-white island in a near-black rail, where the edge is the
     thing standing between "card" and "cut-out", so it carries a real 3:1 boundary. */
  const monoInk=readV(monoBlock);
  ok(ratio(monoInk.northline,bgMono)>=3,
    'mono: the island carries a true edge on its backdrop ('+ratio(monoInk.northline,bgMono).toFixed(2)+')');
  ok(/--northline:#9BBBD4/.test(rootBlock),
    'cloud blue keeps the palette hairline this panel was always drawn with, so its edge did not move');
  ok(lum(bgSky)>lum('#CFE3F1'),'sky: the backdrop sits lighter than the rail powder');
  ok(lum(bgMono)>lum('#161619'),'mono: and far lighter than the mono rail, which is the point of an island');
}

console.log('— the rail: five panels on one surface, and the sizes unpaired —');
{
  const css=html.slice(html.indexOf('<style>'),html.indexOf('</style>'));
  const rootBlock=(css.match(/:root\{[^}]*\}/)||[''])[0];
  const monoBlock=(css.match(/:root\[data-theme="mono"\]\{[^}]*\}/)||[''])[0];
  const navRule=(css.match(/\n\.navbtn\{([^}]*)\}/)||[])[1]||'';
  const onRule=(css.match(/\n\.navbtn\.on\{([^}]*)\}/)||[])[1]||'';
  const stRule=(css.match(/#fpanel \.frow:not\(\.done\) \.ftxt\{([^}]*)\}/)||[])[1]||'';
  const navSize=parseFloat((navRule.match(/font-size:([\d.]+)px/)||[])[1]);
  const stSize=parseFloat((stRule.match(/font-size:([\d.]+)px/)||[])[1]);
  const stWeight=parseInt((stRule.match(/font-weight:(\d+)/)||[])[1],10);

  /* THE PAIRING IS UNDONE. The two were briefly both 19px so the rail read at one
     size; they are independent again and only one of them is load-bearing. */
  ok(navSize===13.5,'the nav labels are back to 13.5px ('+navSize+')');
  ok(stSize===19&&stWeight===700,'and the statement holds 19px/700 ('+stSize+'px/'+stWeight+')');
  ok(stSize!==navSize,'the two are no longer tied to each other');
  ok(stSize>=18.66&&stWeight>=700,
    'the statement still clears the 14pt bold large-text floor, which is what makes mono legal at 3.65');

  /* WHITE MEANS ACTIVE: the backdrop marks the current view and nothing else.
     A resting item stays on the rail, so it must declare no surface at all. */
  ok(!/background/.test(navRule),'a resting nav item declares no surface: it sits on the rail');
  ok(/\.navbtn\.on\{[^}]*background-color:var\(--northbg\)/.test(css),
    'and only the active item takes the True north backdrop');
  ok(!/\.navbtn\.on\{[^}]*background:var/.test(css),
    'as background-color, not the shorthand, or it would reset the hover layer');
  ok(/--northbg:#F6F6F7/.test(rootBlock)&&/--northbg:#F6F6F7/.test(monoBlock),
    'and it is #F6F6F7 in both themes');
  /* the ACTIVE item is the near-white island now, so the island ink rides with it */
  ok(/--mut:var\(--northmut\)/.test(onRule)&&/--navy:var\(--northtxt\)/.test(onRule)&&
     /--ink-rgb:var\(--northink-rgb\)/.test(onRule),
    'and the island ink goes with the backdrop, or mono lends a white pill its near-white text');
  ok(!/--ink-rgb:var\(--northink-rgb\)/.test(navRule),
    'while a resting item keeps the rail tint its hover and press were tuned with');
  /* hover must LAYER over the surface. As a background-color the translucent wash
     replaces the white and lets the rail through, which under mono is near-black. */
  ok(/\.navbtn:hover\{background-image:linear-gradient/.test(css),
    'hover paints over the surface rather than replacing it');
  ok(!/\.navbtn:hover\{background:rgba/.test(css),
    'so a hovered item can never show the rail through itself');

  /* THE ACTIVE ITEM lost the surface that used to be half its signal, so the marks
     it keeps have to carry it alone. Each is checked, and none of them is new. */
  ok(/border-color:var\(--northline\)/.test(onRule),'it keeps its rim');
  ok(/inset 3px 0 0 var\(--today\)/.test(onRule),'and the inset accent bar');
  ok(/font-weight:600/.test(onRule),
    'and takes the heavier label, the way .pday.today and .cell.today .n already mark the current one');
  ok(/color:var\(--navy\)/.test(onRule),'and the strong ink against the resting muted one');
  ok(/\.navbtn\.on \.em\{color:var\(--today\)\}/.test(css),'with the icon tinted to match the bar');
  ok(/\.pday\.today\{[^}]*font-weight:700/.test(css),
    'the weight idiom it borrows really does exist elsewhere, so nothing was invented');

  const lin=c=>{c/=255;return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4)};
  const lum=h=>{h=h.replace('#','');return 0.2126*lin(parseInt(h.slice(0,2),16))+0.7152*lin(parseInt(h.slice(2,4),16))+0.0722*lin(parseInt(h.slice(4,6),16))};
  const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
  const BG='#F6F6F7';
  /* the two label states now sit on DIFFERENT surfaces, so each is measured on its
     own. Resting is 13.5px/500 on the rail, active is the same size on the
     backdrop; both are normal text, so 4.5 is the bar for both. */
  ok(ratio('#41627F','#CFE3F1')>=4.5,
    'cloud blue: a resting nav label on the rail measures '+ratio('#41627F','#CFE3F1').toFixed(2));
  ok(ratio('#ABABB3','#161619')>=4.5,
    'mono: a resting nav label on the rail measures '+ratio('#ABABB3','#161619').toFixed(2));
  ok(ratio('#243A5E',BG)>=4.5,'cloud blue: the active nav label measures '+ratio('#243A5E',BG).toFixed(2));
  ok(ratio('#161619',BG)>=4.5,'mono: the active nav label measures '+ratio('#161619',BG).toFixed(2));
  /* the bar and the icon are non-text marks, so 3:1 is their bar. Cloud blue has
     no red: the accent there is the today teal, quieter than mono's red, which is
     why the surface change carries proportionally more of the signal in blue. */
  ok(ratio('#567C8D',BG)>=3,'cloud blue: the teal accent bar and icon read at '+ratio('#567C8D',BG).toFixed(2));
  ok(ratio('#E8443C',BG)>=3,'mono: the red accent bar and icon read at '+ratio('#E8443C',BG).toFixed(2));
  /* the surface step itself: the active pill against the rail it lifts off */
  ok(ratio(BG,'#CFE3F1')>1,'cloud blue: the active pill lifts off the powder rail ('+ratio(BG,'#CFE3F1').toFixed(2)+')');
  ok(ratio(BG,'#161619')>=3,'mono: and off the near-black rail at '+ratio(BG,'#161619').toFixed(2));
}

console.log('— the rail: exactly one nav item is ever the current one —');
{
  /* REGRESSION, fixed 2026-08-12: float mode is a mode OF the board view, so `v`
     stays 'board' while it runs. render() lit Board from the data-v loop and the
     float toggle from its own line, so BOTH carried .on and, worse, both carried
     aria-current="page", which tells a screen reader two things are the current
     page. Once the mark became a white surface it was visible as two active
     items at once. Board now yields the mark to the toggle while float is on. */
  const marks=()=>({on:qa('#rail .navbtn.on').map(b=>b.textContent.trim()),
    cur:qa('#rail .navbtn[aria-current="page"]').map(b=>b.textContent.trim())});
  const only=(label,want)=>{
    const m=marks();
    ok(m.on.length===1,label+': exactly one item carries the mark ('+JSON.stringify(m.on)+')');
    ok(m.cur.length===1,label+': and exactly one is named the current page ('+JSON.stringify(m.cur)+')');
    ok(m.on[0]===m.cur[0]&&new RegExp(want).test(m.on[0]||''),
      label+': and it is the right one ('+JSON.stringify(m.on)+')');
  };
  S().settings.floatMode=false;
  S().settings.view='board'; A.save(); A.render(); await wait(25); only('board','Board');
  S().settings.view='calendar'; A.render(); await wait(25); only('calendar','Calendar');
  S().settings.view='notes'; A.render(); await wait(25); only('notes','Notes');
  S().settings.view='board'; S().settings.floatMode=true; A.render(); await wait(25);
  only('float mode','Back to dates');
  ok(!q('#rail .navbtn[data-v="board"]').classList.contains('on'),
    'float mode: Board yields the mark rather than sharing it');
  ok(!q('#rail .navbtn[data-v="board"]').getAttribute('aria-current'),
    'and drops aria-current with it, so only one element claims the page');
  S().settings.floatMode=false; S().settings.view='board'; A.save(); A.render(); await wait(25);
  only('back from float','Board');
}

console.log('— the layout boundary is one pixel, and both sides stand on the same one —');
{
  /* AT EXACTLY innerWidth 900 the wide structure was built into the narrow stylesheet.
     The sheet splits at max-width:900px / min-width:901px, so 900 is a narrow window to
     every rule in the file; every gate in the script read >=900 and built the WIDE one
     there. A 900px window therefore got the seven day board, the Today only switch, the
     off-board column and the rail layout laid out by a stylesheet that draws one column,
     no rail and a day strip the script had not built. No viewport profile sits on the
     pixel, so nothing measured it. Both sides now read one boundary; this pins it from
     both, at 899, 900 and 901. */
  { /* THE SHEET, resolved the way a browser resolves it rather than grepped */
    const app=q('#app');
    const gt=vw=>cascade(app,'grid-template-columns',vw,800).trim();
    ok(gt(899)===gt(900),
      '899 and 900 resolve the same template, so 900 is a narrow window to the sheet: '+gt(900));
    ok(gt(901)!==gt(900),'and 901 is the one pixel where the sheet changes its mind');
    ok(gt(900)==='1fr','at 900 #app is the single column phone template ('+gt(900)+')');
    ok(/var\(--rail\)/.test(gt(901)),'at 901 it is the rail beside the content column ('+gt(901)+')');
    /* and there is no second boundary hiding anywhere near it */
    const seen=[];
    (function walk(rules){ for(const r of rules){
      if(r.type===4){ (String(r.media.mediaText).match(/(min|max)-width:\s*\d+px/g)||[])
        .forEach(x=>seen.push(x.replace(/\s+/g,''))); walk(r.cssRules||[]) }
      else if(r.cssRules) walk(r.cssRules);
    } })(doc.styleSheets[0].cssRules);
    const near=[...new Set(seen)].filter(x=>{ const n=+x.match(/\d+/)[0]; return n>=890&&n<=910 }).sort();
    ok(near.join(' ')==='max-width:900px min-width:901px',
      'the sheet declares exactly one boundary in the band, the 900/901 pair ('+near.join(' ')+')');
  }
  { /* THE SCRIPT, at the three pixels, in real windows */
    const seed=JSON.stringify({ver:2,days:{},carry:[],focus:[],
      floats:[{id:'f1',name:'Inbox',tasks:[],up:1}],
      habits:{list:[{id:'hh1',name:'Stretch',days:[1,2,3,4,5],up:1}],marks:{}},
      week:{list:[],hist:{}},notes:[],folders:[],sticky:{text:'',at:0},tomb:{},bin:{},
      settings:{view:'board',boardOffset:0,floatMode:false,activeFloat:'f1',calSel:null,
        calOffset:0,mRange:'day',stripDay:null,showDone:false,lastRoll:T(),
        habitsOpen:true,weekOpen:true,todayOnly:false,lastWeek:null,noteSel:null,trayOpen:false}});
    const at=async vw=>{
      const d=new JSDOM(html,{runScripts:'dangerously',url:'http://localhost/',pretendToBeVisual:true,
        beforeParse(win){
          Object.defineProperty(win,'innerWidth',{value:vw,writable:true,configurable:true});
          Object.defineProperty(win,'innerHeight',{value:800,writable:true,configurable:true});
          try{ win.localStorage.setItem('agora_dayplanner_v1',seed) }catch(e){}
        }});
      await wait(300);
      const dw=d.window, dd=dw.document;
      const snap=()=>({
        cols:dd.querySelectorAll('#board .col').length,
        strip:dd.querySelectorAll('#strip button').length,
        toggle:!!dd.querySelector('[data-action="todayonly"]'),
        oneday:dd.querySelector('#board').classList.contains('oneday'),
        habitsBand:dd.querySelector('#habits').innerHTML!=='',
        habitsRail:dd.querySelector('#habitsRail').innerHTML!=='',
        step:!!dd.querySelector('[data-action="nav"][data-d="7"]')});
      const off=snap();
      dw.A.state.settings.todayOnly=true; dw.A.render(); await wait(30);
      const on=snap();
      dw.close();
      return {off,on};
    };
    const w899=await at(899), w900=await at(900), w901=await at(901);
    const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
    ok(same(w899.off,w900.off)&&same(w899.on,w900.on),
      '900 builds exactly what 899 builds, which is what the sheet at 900 is drawing');
    ok(!same(w900.off,w901.off),'and 901 is where the script changes its mind, once, with the sheet');
    ok(w900.off.cols===1&&w900.off.strip>0&&!w900.off.toggle,
      'at 900: one day column, the day strip to move it, and no Today only switch');
    ok(w900.off.habitsBand&&!w900.off.habitsRail,
      'and the habits panel is the full width band under the board, not the rail card');
    ok(w901.off.cols===7&&w901.off.strip===0&&w901.off.toggle,
      'at 901: the seven day window, no strip, and the switch that is only meaningful here');
    ok(!w901.off.habitsBand&&w901.off.habitsRail,'with the habits panel back in the rail');
    ok(!w900.on.oneday&&!w900.on.toggle&&w900.on.step,
      'a stored Today only changes nothing at 900: the board there is a single day strip already');
    ok(w901.on.oneday&&w901.on.cols===1&&!w901.on.step,
      'and takes effect at 901, where one column is a mode rather than the only layout');
  }
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
