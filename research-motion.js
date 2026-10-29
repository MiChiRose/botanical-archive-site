/* Reconstructed patterns: LN-06, LN-07, LN-17 and LN-21.
   See RESEARCH-MAPPING.md for original parameters and deliberate adaptations. */
(() => {
  'use strict';
  const g=window.gsap, ST=window.ScrollTrigger;
  if(!g||!ST)return; // Readable vertical HTML is the no-animation fallback.
  g.registerPlugin(ST);
  const root=document.documentElement, reduceQuery=matchMedia('(prefers-reduced-motion: reduce)');
  const desktop=matchMedia('(min-width: 992px)'), fine=matchMedia('(hover:hover) and (pointer:fine)');
  const reduced=()=>root.dataset.reduced==='true'||reduceQuery.matches;
  const section=document.querySelector('.field-notes'), track=section.querySelector('.notes-grid');
  const panels=[...section.querySelectorAll('.note')], dots=[...section.querySelectorAll('[data-note]')];
  const ribbon=document.querySelector('.botanical-ribbon'), ribbonTrack=ribbon.querySelector('.ribbon-drift');
  const collection=ribbon.querySelector('.ribbon-collection'), pause=ribbon.querySelector('.ribbon-toggle');
  const revealed=new WeakSet(), rolls=[];
  let context, horizontal, loop, refreshTimer, active=-1, manualPause=false, inView=false, direction=1, lastY=scrollY;

  // LN-07: two vertically stacked glyphs share one overflow window.
  // Keep one accessible text node; duplicated glyphs never enter the AX tree.
  document.querySelectorAll('[data-roll]').forEach(label=>{
    const text=label.textContent, sr=document.createElement('span'), visual=document.createElement('span');
    sr.className='roll-accessible';sr.textContent=text;visual.className='roll-visual';visual.setAttribute('aria-hidden','true');
    for(const char of Array.from(text)){
      const slot=document.createElement('span'), pair=document.createElement('span');
      slot.className='roll-slot';pair.className='roll-pair';
      for(let i=0;i<2;i++){const glyph=document.createElement('span');glyph.textContent=char===' '?'\u00a0':char;pair.append(glyph);}
      slot.append(pair);visual.append(slot);
    }
    label.replaceChildren(sr,visual);label.classList.add('roll-label');
    const host=label.closest('button,a'), pairs=[...label.querySelectorAll('.roll-pair')];
    if(!host)return;
    const reset=()=>g.to(pairs,{yPercent:0,duration:reduced()?0:.6,ease:'power3.out',stagger:.02,overwrite:true});
    host.addEventListener('pointerenter',event=>{if(!reduced()&&desktop.matches&&fine.matches&&event.pointerType==='mouse')g.to(pairs,{yPercent:-50,duration:.6,ease:'power3.out',stagger:.02,overwrite:true});});
    host.addEventListener('pointerleave',reset);
    host.addEventListener('focus',()=>{if(host.matches(':focus-visible')){g.killTweensOf(pairs);g.set(pairs,{yPercent:0});}});
    rolls.push({pairs,reset});
  });

  // LN-06: reveal the line first, then retract its solid cover 300 ms later.
  panels.forEach(panel=>{
    const title=panel.querySelector('[data-wipe]'), text=document.createElement('span'), cover=document.createElement('span');
    text.className='wipe-text';text.textContent=title.textContent;
    cover.className='wipe-cover';cover.setAttribute('aria-hidden','true');title.replaceChildren(text,cover);
  });
  function reveal(panel,instant=false){
    const text=panel.querySelector('.wipe-text'), cover=panel.querySelector('.wipe-cover');
    if(instant||reduced()){revealed.add(panel);g.killTweensOf([text,cover]);g.set(text,{clearProps:'clipPath'});g.set(cover,{scaleX:0});return;}
    if(revealed.has(panel))return;
    revealed.add(panel);
    panel.dataset.titleRevealed='true';
    g.timeline().fromTo(text,{clipPath:'inset(0 100% 0 0)'},{clipPath:'inset(0 0% 0 0)',duration:.6,ease:'power2.out'})
      .fromTo(cover,{scaleX:1},{scaleX:0,duration:.6,ease:'power2.inOut'},.3);
  }
  function selectDot(progress){
    const next=Math.round(progress*(panels.length-1));
    if(next===active)return;active=next;section.dataset.activeNote=String(next+1);
    dots.forEach((dot,i)=>dot.setAttribute('aria-pressed',String(i===next)));
  }
  function settleHorizontal(){
    if(!horizontal)return;
    const st=horizontal.scrollTrigger;ST.update();st.getTween()?.progress(1);horizontal.progress(st.progress);
  }
  function jump(i){
    if(!horizontal)return;
    ST.refresh();
    const st=horizontal.scrollTrigger;
    // Align each panel's start with the same page gutter, clamped at the last panel.
    const distance=Math.max(1,track.scrollWidth-innerWidth);
    const x=panels[i].offsetLeft-panels[0].offsetLeft, p=Math.min(1,x/distance);
    scrollTo({top:st.start+(st.end-st.start)*p,behavior:'instant'});settleHorizontal();horizontal.progress(p);reveal(panels[i],true);
  }
  dots.forEach((dot,i)=>dot.addEventListener('click',()=>jump(i)));
  // Tab must not leave focus in a clipped/offscreen panel while scrub catches up.
  panels.forEach((panel,i)=>{
    panel.addEventListener('focus',()=>{if(panel.matches(':focus-visible'))jump(i);});
    panel.addEventListener('keydown',event=>{
      if(!horizontal||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();
      const next=event.key==='Home'?0:event.key==='End'?panels.length-1:Math.max(0,Math.min(panels.length-1,i+(event.key==='ArrowRight'?1:-1)));
      jump(next);panels[next].focus({preventScroll:true});
    });
    const image=panel.querySelector('img');
    panel.addEventListener('pointerenter',event=>{if(!reduced()&&desktop.matches&&fine.matches&&event.pointerType==='mouse')g.to(image,{scale:1.045,duration:.5,ease:'power3.out',overwrite:true});});
    panel.addEventListener('pointerleave',()=>g.to(image,{scale:1,duration:reduced()?0:.35,ease:'power3.out',overwrite:true}));
  });

  // LN-21: four identical collections, linear infinite travel, direction from scroll.
  for(let i=0;i<3;i++){const clone=collection.cloneNode(true);clone.setAttribute('aria-hidden','true');clone.dataset.duplicate='';ribbonTrack.append(clone);}
  function updateLoop(){
    if(!loop)return;
    loop.timeScale(direction);
    loop.paused(reduced()||manualPause||!inView||document.hidden);
    ribbon.dataset.direction=direction===1?'left':'right';
    ribbon.dataset.paused=String(loop.paused());
  }
  function buildLoop(){
    const phase=loop?loop.progress():.5;
    loop?.kill();loop=null;g.set(ribbonTrack,{x:0});
    if(reduced()){ribbon.dataset.paused='true';return;}
    const width=collection.getBoundingClientRect().width;
    const factor=innerWidth<479?.25:innerWidth<991?.5:1;
    loop=g.fromTo(ribbonTrack,{x:0},{x:-width,duration:40*(width/innerWidth)*factor,ease:'none',repeat:-1,paused:true,
      onReverseComplete:()=>loop.totalTime(loop.rawTime()+loop.duration()*100)});
    // Keep reverse travel far from the zero-time boundary while preserving the phase.
    loop.totalTime(loop.duration()*(100+(Number.isFinite(phase)?phase%1:.5)));updateLoop();
  }
  pause.addEventListener('click',()=>{
    manualPause=!manualPause;pause.setAttribute('aria-pressed',String(manualPause));
    pause.setAttribute('aria-label',manualPause?'Продолжить бегущую строку':'Остановить бегущую строку');updateLoop();
    // Replace label as an ordinary string; no stale glyph copies after a state change.
    const label=pause.querySelector('.ribbon-toggle-label');label.textContent=manualPause?'Продолжить строку':'Остановить строку';
  });
  const ribbonObserver=new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;if(inView&&!loop&&!reduced())buildLoop();updateLoop();},{rootMargin:'200px 0px',threshold:0});
  ribbonObserver.observe(ribbon);
  addEventListener('scroll',()=>{const y=scrollY;if(Math.abs(y-lastY)>1){direction=y>lastY?1:-1;lastY=y;updateLoop();}},{passive:true});
  document.addEventListener('visibilitychange',updateLoop);

  function setup(){
    context?.revert();horizontal=null;active=-1;
    const wide=desktop.matches&&!reduced();section.classList.toggle('is-horizontal',wide);
    section.classList.toggle('is-vertical-motion',!wide&&!reduced());
    section.dataset.layout=wide?'horizontal':reduced()?'static':'vertical-motion';
    section.style.height='';
    panels.forEach(panel=>{g.killTweensOf(panel.querySelectorAll('img,.wipe-text,.wipe-cover'));g.set(panel.querySelectorAll('img,.note-photo,.note-meta,.note-title,.note-description,.note-drift'),{clearProps:'all'});});
    context=g.context(()=>{
      if(wide){
        const travel=()=>Math.max(0,track.scrollWidth-innerWidth);
        const size=()=>{section.style.height=`${travel()+section.querySelector('.notes-sticky').offsetHeight}px`;};
        size();
        horizontal=g.to(track,{x:()=>-travel(),ease:'none',scrollTrigger:{id:'botanical-horizontal',trigger:section,start:'top top',end:'bottom bottom',scrub:1,invalidateOnRefresh:true,onRefreshInit:size,onRefresh:self=>{section.dataset.scrollStart=String(self.start);section.dataset.scrollEnd=String(self.end);}},onUpdate:()=>selectDot(horizontal?.progress()||0)});
        panels.forEach((panel,i)=>{
          if(revealed.has(panel))reveal(panel,true);
          if(!revealed.has(panel)){g.set(panel.querySelector('.wipe-text'),{clipPath:'inset(0 100% 0 0)'});g.set(panel.querySelector('.wipe-cover'),{scaleX:1});}
          const trigger=i<2?{trigger:panel,start:'top 90%'}:{trigger:panel,containerAnimation:horizontal,start:'left 95%'};
          ST.create({...trigger,once:true,onEnter:()=>reveal(panel)});
          g.fromTo(panel.querySelector('.note-drift'),{x:-64},{x:64,ease:'none',scrollTrigger:{trigger:panel,containerAnimation:horizontal,start:'left right',end:'right left',scrub:true,invalidateOnRefresh:true}});
        });
      }else{
        g.set(track,{clearProps:'transform'});
        panels.forEach(panel=>{
          if(reduced()){reveal(panel,true);return;}
          if(revealed.has(panel))reveal(panel,true);
          else{
            ST.create({trigger:panel.querySelector('.note-copy'),start:'top 92%',once:true,onEnter:()=>reveal(panel)});
          }
          const photo=panel.querySelector('.note-photo');
          g.fromTo(photo,{clipPath:'inset(8% 0 8% 0)'},{clipPath:'inset(0% 0 0% 0)',duration:.8,ease:'power2.out',clearProps:'clipPath',scrollTrigger:{trigger:photo,start:'top 88%',once:true},onComplete:()=>{photo.dataset.revealed='true';}});
          g.fromTo(panel.querySelector('.note-drift'),{y:-24},{y:24,ease:'none',scrollTrigger:{trigger:photo,start:'top bottom',end:'bottom top',scrub:true,invalidateOnRefresh:true}});
        });
      }
    },section);
    if(reduced()||!desktop.matches)rolls.forEach(({pairs})=>{g.killTweensOf(pairs);g.set(pairs,{yPercent:0});});
    pause.disabled=reduced();
    if(loop||inView)buildLoop();
    ST.refresh();
  }
  const preferences=new MutationObserver(setup);preferences.observe(root,{attributes:true,attributeFilter:['data-reduced']});
  desktop.addEventListener('change',setup);reduceQuery.addEventListener('change',setup);
  addEventListener('resize',()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{ST.refresh();if(loop)buildLoop();},200);});
  document.fonts.ready.then(()=>{ST.refresh();if(loop)buildLoop();});
  setup();
  addEventListener('pagehide',()=>{loop?.pause();clearTimeout(refreshTimer);});
  addEventListener('pageshow',event=>{if(event.persisted){ST.refresh();updateLoop();}});
})();
