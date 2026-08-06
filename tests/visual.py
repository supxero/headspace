from playwright.sync_api import sync_playwright
import re
fails=[]
def ck(c,m):
    print(('  ok  ' if c else '  X   ')+m)
    if not c: fails.append(m)

SEED = """
const t=new Date().toISOString().slice(0,10);
const d=n=>{const x=new Date();x.setDate(x.getDate()+n);return x.toISOString().slice(0,10)};
const S={days:{},carry:[],focus:[{id:'f1',title:'finish what I start',done:false}],
 floats:[{id:'fa',name:'Inbox',tasks:[{id:'q1',title:'no date yet',done:false,subtasks:[]}]},
         {id:'fb',name:'Ideas',tasks:[]}],
 settings:{view:'board',boardOffset:0,floatMode:false,activeFloat:'fa',calSel:null,calOffset:0,
   mRange:'day',stripDay:t,lastRoll:t,showDone:false}};
for(let i=0;i<20;i++){const k=d(-i);
 S.days[k]={must:[{id:'a'+i,title:'write the weekly report',done:true,subtasks:[{id:'s'+i,title:'pull the numbers',done:true}]},
                  {id:'b'+i,title:'reply to Daniela',done:i%2===0,subtasks:[]}],
            should:[{id:'c'+i,title:'tidy the tracker',done:false,subtasks:[]}],extra:[]}}
S.days[t].extra=[{id:'e1',title:'read a chapter',done:false,subtasks:[]}];
localStorage.setItem('agora_dayplanner_v1',JSON.stringify(S));
"""
EMOJI=['\U0001F5D3','\U0001F4C5','\U0001F388','\U0001F3AF','\U0001F512','\U0001F513','\U0001F5D1']

with sync_playwright() as pw:
    b=pw.chromium.launch(); pg=b.new_page(viewport={'width':1440,'height':900})
    pg.add_init_script(SEED)
    pg.goto('http://localhost:8899/index.html'); pg.wait_for_timeout(700)

    print('— light theme, no white —')
    bg=pg.eval_on_selector('body','e=>getComputedStyle(e).backgroundColor')
    ck(bg=='rgb(237, 244, 250)','page background is Cloud Blue %s'%bg)
    col=pg.eval_on_selector('.col','e=>getComputedStyle(e).backgroundColor')
    ck(col=='rgb(237, 244, 250)','columns are Powder Sky panels %s'%col)
    task=pg.eval_on_selector('.task','e=>getComputedStyle(e).backgroundColor')
    ck(task=='rgb(227, 238, 247)','task cards use the tile tint %s'%task)
    html=pg.content()
    ck('rgb(255' not in html and '255,255,255' not in html.replace(' ',''),'no white rgb anywhere')
    ck(not re.search(r'#fff(?![0-9a-fA-F])|#ffffff', html.lower()),'no white hex anywhere')

    print('— no emoji —')
    for e in EMOJI: ck(e not in html,'emoji %s removed'%hex(ord(e)))
    ck(pg.eval_on_selector_all('.navbtn .em svg','e=>e.length')==3,'nav icons are inline SVG')

    print('— layout —')
    side=pg.locator('#rail').bounding_box(); main=pg.locator('#main').bounding_box()
    ck(side['x']<main['x'],'sidebar sits left of the content')
    ck(side['width']<360,'sidebar is a fixed rail (%.0fpx)'%side['width'])
    ck(pg.eval_on_selector_all('header','e=>e.length')==0,'no top header bar')
    fp=pg.locator('#fpanel').bounding_box()
    ck(fp['x']+fp['width']<=side['x']+side['width']+2,'Focus panel lives on the left')

    print('— no page overflow at any width —')
    for wd in [1500,1280,1100,980,760]:
        pg.set_viewport_size({'width':wd,'height':900}); pg.wait_for_timeout(300)
        sw=pg.evaluate('document.documentElement.scrollWidth')
        ck(sw<=wd+2,'%dpx: no sideways scroll (%d)'%(wd,sw))
    pg.set_viewport_size({'width':1440,'height':900}); pg.wait_for_timeout(300)
    ck(pg.evaluate("document.querySelector('#board').scrollWidth > document.querySelector('#board').clientWidth"),
       'the board scrolls inside its own column')

    print('— metrics —')
    ck(pg.eval_on_selector_all('#metrics .kard','e=>e.length')==4,'four metric cards')
    for r,exp in [('day',3),('week',7),('month',5)]:
        pg.click('[data-action="mrange"][data-r="%s"]'%r); pg.wait_for_timeout(240)
        n=pg.eval_on_selector_all('.bars .bar','e=>e.length')
        ck(n==exp,'%s view -> %d bars, ring %s'%(r,n,pg.inner_text('.ring .rlab b')))
        ck('Month goal' in pg.inner_text('#metrics'),'month goal bar visible in %s'%r)
    gw=pg.eval_on_selector('.goalbar .track i','e=>e.style.width')
    ck(gw.endswith('%') and int(float(gw[:-1]))>0,'month goal bar fills to %s'%gw)

    print('— today marker + lock —')
    tint=pg.eval_on_selector('.col.today','e=>getComputedStyle(e).borderTopColor')
    ck('124' in tint,'today column ringed teal %s'%tint)
    ck(pg.eval_on_selector_all('.zh .lk','e=>e.length')>=1,'Extra lock renders as an SVG')

    print('— board, float mode, calendar —')
    ck(pg.eval_on_selector_all('.col[data-day]','e=>e.length')==7,'seven day columns')
    tops=pg.eval_on_selector_all('.col','e=>e.map(x=>Math.round(x.getBoundingClientRect().top))')
    ck(len(set(tops))==1,'columns sit in one even row')
    pg.click('[data-action="floattoggle"]'); pg.wait_for_timeout(300)
    ck(pg.eval_on_selector_all('.col.backlog','e=>e.length')==2,'both tabs shown as columns')
    pg.click('[data-action="floattoggle"]'); pg.wait_for_timeout(280)
    pg.click('[data-action="view"][data-v="calendar"]'); pg.wait_for_timeout(320)
    ck(pg.eval_on_selector_all('.calgrid .cell:not(.blank)','e=>e.length')>=28,'calendar renders a full month')
    ck(pg.eval_on_selector_all('.cell.today','e=>e.length')==1,'today ringed in the calendar')
    ck(pg.eval_on_selector_all('.cell .dots','e=>e.length')>0,'zone dots render')
    pg.screenshot(path='/home/claude/shot-cal.png',full_page=False)
    pg.click('[data-action="view"][data-v="board"]'); pg.wait_for_timeout(300)
    pg.screenshot(path='/home/claude/shot-board.png')

    print('— mobile —')
    pg.set_viewport_size({'width':390,'height':844}); pg.wait_for_timeout(420)
    ck(pg.evaluate('document.documentElement.scrollWidth')<=392,'no sideways scroll on a phone')
    ck(not pg.locator('#fpanel').is_visible(),'rail extras start hidden on a phone')
    ck(pg.eval_on_selector_all('#rail .navbtn','e=>e.length')==3,'view switcher stays reachable on a phone')
    ck(pg.eval_on_selector_all('.col[data-day]','e=>e.length')==1,'one day at a time')
    pg.click('#railtoggle'); pg.wait_for_timeout(250)
    ck(pg.locator('#fpanel').is_visible(),'Menu opens the focus panel and metrics')
    pg.evaluate("""()=>{const t=new Date().toISOString().slice(0,10);
      A.state.days[t]={must:[{id:'m1',title:'send the Riverdance report',done:false,subtasks:[{id:'s',title:'pull numbers',done:true}]},
                             {id:'m2',title:'call Zhen about the handover',done:true,subtasks:[]}],
                       should:[{id:'s1',title:'tidy the tracker',done:false,subtasks:[]}],extra:[]};A.render()}""")
    pg.click('#railtoggle'); pg.wait_for_timeout(300)
    pg.screenshot(path='/home/claude/shot-mobile.png')
    b.close()

print()
print('ALL PASSED' if not fails else '%d FAILED'%len(fails))
