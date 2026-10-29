/* Research adaptations LN-05/08/09/18/20/24/25/30.
 * Shared photographs, native controls, one existing GSAP ticker; no new canvas.
 * Original file/line references and deliberate differences: RESEARCH-MAPPING.md.
 */
(() => {
  'use strict';
  const g=window.gsap,ST=window.ScrollTrigger,Input=window.BotanicalInput;
  const lab=document.querySelector('.dialogue-lab'),index=document.querySelector('.field-index');
  if(!lab||!index||!g||!ST)return;
  const root=document.documentElement,reduceQuery=matchMedia('(prefers-reduced-motion: reduce)'),fine=matchMedia('(hover:hover) and (pointer:fine)'),wide=matchMedia('(min-width:992px)');
  const reduced=()=>root.dataset.reduced==='true'||reduceQuery.matches;
  const titles=[...document.querySelectorAll('[data-atlas-oval]')],images=[...lab.querySelectorAll('.atlas-image-reveal')],counters=[...lab.querySelectorAll('[data-atlas-count]')];
  const pair=lab.querySelector('.dialogue-pair'),drifts=[...pair.querySelectorAll('.dialogue-drift')],labels=[...pair.querySelectorAll('.dialogue-label')];
  const visor=lab.querySelector('.atlas-visor'),visorImage=visor.querySelector('img'),stats=lab.querySelector('.atlas-numbers');
  const list=index.querySelector('.atlas-index-list'),preview=index.querySelector('.atlas-hover'),previewImage=preview.querySelector('img'),previewVeil=preview.querySelector('.atlas-hover-veil');
  const details=[...index.querySelectorAll('details')],seenTitles=new WeakSet(),seenImages=new WeakSet(),seenCounts=new WeakSet(),transient=new Set();
  const abort=new AbortController(),signal=abort.signal;
  let context,hoverTimeline,quickX,quickY,hovered=false,point=null,scrollFrame=0,resizeTimer=0,assistFrame=0;
  let measuredWidth=innerWidth,measuredHeight=Input.viewportHeight();
  function keep(tween,done){
    transient.add(tween);tween.eventCallback('onComplete',()=>{transient.delete(tween);done?.();});return tween;
  }
  function openTitle(title){
    if(seenTitles.has(title))return;seenTitles.add(title);
    const lines=title.querySelectorAll('.atlas-oval-line'),text=title.querySelectorAll('.atlas-oval-line>span');
    title.dataset.oval='playing';
    const timeline=g.timeline().to(lines,{clipPath:'ellipse(100% 120% at 50% 0%)',duration:1.5,ease:'power2.inOut',stagger:.15})
      .to(text,{yPercent:0,duration:1.5,ease:'power2.out',stagger:.15},0);
    keep(timeline,()=>{g.set(lines,{clearProps:'clipPath'});g.set(text,{clearProps:'transform'});title.dataset.oval='done';});
  }
  function openImage(wrapper){
    if(seenImages.has(wrapper))return;seenImages.add(wrapper);wrapper.dataset.reveal='playing';
    const veil=wrapper.querySelector('.atlas-image-veil');
    keep(g.timeline().to(wrapper,{clipPath:'ellipse(120% 120% at 50% 0%)',duration:.8,ease:'power2.out'})
      .to(veil,{clipPath:'ellipse(120% 0% at 50% 100%)',duration:.6,ease:'power2.out'},.4),()=>{
        g.set(wrapper,{clearProps:'clipPath'});g.set(veil,{visibility:'hidden'});wrapper.dataset.reveal='done';
      });
  }
  function count(counter){
    if(seenCounts.has(counter))return;seenCounts.add(counter);
    const proxy={value:0},target=Number(counter.dataset.atlasCount);let previous=-1;
    keep(g.to(proxy,{value:target,duration:1,ease:'power1.out',onUpdate:()=>{
      const value=Math.round(proxy.value);if(value===previous)return;previous=value;
      counter.textContent=String(value).padStart(2,'0');counter.dataset.value=String(value);
    }}),()=>{counter.textContent=String(target).padStart(2,'0');counter.dataset.value=String(target);counter.dataset.counted='true';});
  }
  const canPreview=()=>wide.matches&&fine.matches&&!reduced()&&!document.body.classList.contains('modal-open');
  function hidePreview(immediate=false){
    hovered=false;index.dataset.preview='closed';
    if(immediate||!hoverTimeline){hoverTimeline?.pause(0);preview.hidden=true;g.set(preview,{autoAlpha:0});return;}
    hoverTimeline.timeScale(2).reverse();
  }
  function placePreview(event,immediate=false){
    point={x:event.clientX,y:event.clientY};
    const x=Math.max(10,Math.min(innerWidth-200,point.x+20)),y=Math.max(10,Math.min(innerHeight-256,point.y-20));
    if(immediate)g.set(preview,{x,y});else{quickX?.(x);quickY?.(y);}
    const row=event.target.closest?.('[data-atlas-photo]')||document.elementFromPoint(point.x,point.y)?.closest('[data-atlas-photo]');
    if(row&&preview.dataset.photo!==row.dataset.atlasPhoto){preview.dataset.photo=row.dataset.atlasPhoto;previewImage.src=`assets/${row.dataset.atlasPhoto}.jpg`;}
  }
  list.addEventListener('pointerenter',event=>{
    if(event.pointerType!=='mouse'||!canPreview())return;
    hovered=true;preview.hidden=false;placePreview(event,true);index.dataset.preview='open';hoverTimeline.timeScale(1).play();
  },{signal});
  list.addEventListener('pointermove',event=>{if(hovered&&canPreview())placePreview(event);},{passive:true,signal});
  list.addEventListener('pointerleave',()=>hidePreview(),{signal});
  list.addEventListener('click',()=>hidePreview(true),{signal});
  addEventListener('blur',()=>hidePreview(true),{signal});
  addEventListener('scroll',()=>{
    if(!hovered||scrollFrame)return;
    scrollFrame=requestAnimationFrame(()=>{
      scrollFrame=0;if(!hovered||!point)return;
      const bounds=list.getBoundingClientRect();
      if(!canPreview()||point.x<bounds.left||point.x>bounds.right||point.y<bounds.top||point.y>bounds.bottom){hidePreview();return;}
      const row=document.elementFromPoint(point.x,point.y)?.closest('[data-atlas-photo]');
      if(row)placePreview({clientX:point.x,clientY:point.y,target:row});
    });
  },{passive:true,signal});

  function setup(){
    transient.forEach(t=>t.kill());transient.clear();hoverTimeline?.kill();hoverTimeline=null;quickX=null;quickY=null;context?.revert();context=null;hidePreview(true);
    const narrow=innerWidth<=760,simple=reduced();lab.dataset.motion=simple?'static':'scroll';index.dataset.previewMode=canPreview()?'pointer':'static';
    const clearTargets=[...titles.flatMap(title=>[...title.querySelectorAll('.atlas-oval-line,.atlas-oval-line>span')]),...images,...images.map(image=>image.querySelector('.atlas-image-veil')),...drifts,...labels,visor,visorImage,...stats.querySelectorAll('.atlas-number-drift,.atlas-stat-label')];
    g.set(clearTargets,{clearProps:'transform,clipPath,opacity,visibility'});
    g.set(images.map(image=>image.querySelector('.atlas-image-veil')),{visibility:'hidden'});
    const travel=Math.min(160,Input.viewportHeight()*.2);visor.style.setProperty('--visor-travel',`${travel}px`);
    if(simple){
      counters.forEach(counter=>{counter.textContent=String(counter.dataset.atlasCount).padStart(2,'0');counter.dataset.value=counter.dataset.atlasCount;seenCounts.add(counter);});
      titles.forEach(title=>{seenTitles.add(title);title.dataset.oval='done';});images.forEach(image=>{seenImages.add(image);image.dataset.reveal='done';});return;
    }
    context=g.context(()=>{
      titles.forEach(title=>{
        if(seenTitles.has(title)){title.dataset.oval='done';return;}
        g.set(title.querySelectorAll('.atlas-oval-line'),{clipPath:'ellipse(20% 0% at 50% 0%)'});
        g.set(title.querySelectorAll('.atlas-oval-line>span'),{yPercent:-40});
        ST.create({trigger:title,start:'top 95%',once:true,onEnter:()=>openTitle(title)});
      });
      images.forEach(wrapper=>{
        if(seenImages.has(wrapper)){wrapper.dataset.reveal='done';return;}
        const veil=wrapper.querySelector('.atlas-image-veil');
        g.set(wrapper,{clipPath:'ellipse(120% 0% at 50% 0%)'});g.set(veil,{visibility:'visible',clipPath:'ellipse(120% 120% at 50% 100%)'});
        ST.create({trigger:wrapper,start:'top 80%',once:true,onEnter:()=>openImage(wrapper)});
      });
      const spread=narrow?Math.min(42,innerWidth*.09):Math.min(320,innerWidth*.22),textSpread=narrow?12:80;
      g.fromTo(drifts,{x:i=>(i?1:-1)*spread},{x:0,ease:'power2.out',scrollTrigger:{trigger:pair,start:'top bottom',end:'bottom bottom',scrub:true,invalidateOnRefresh:true,onUpdate:self=>{pair.dataset.progress=self.progress.toFixed(3);},onRefresh:self=>{pair.dataset.progress=self.progress.toFixed(3);}}});
      g.fromTo(labels,{x:i=>(i?1:-1)*textSpread},{x:0,ease:'none',scrollTrigger:{trigger:pair,start:'top bottom',end:'60% bottom',scrub:true,invalidateOnRefresh:true}});
      g.fromTo(visor,{clipPath:'ellipse(70% 0% at 50% 0%)'},{clipPath:'ellipse(70% 100% at 50% 0%)',ease:'none',scrollTrigger:{trigger:visor,start:'top bottom',end:'bottom center',scrub:true,invalidateOnRefresh:true,onUpdate:self=>{visor.dataset.progress=self.progress.toFixed(3);},onRefresh:self=>{visor.dataset.progress=self.progress.toFixed(3);}}});
      g.fromTo(visorImage,{y:0,scale:1},{y:-travel,scale:1.1,ease:'none',scrollTrigger:{trigger:visor,start:'top bottom',end:'bottom top',scrub:true,invalidateOnRefresh:true}});
      const offset=narrow?48:120;
      g.fromTo(stats.querySelectorAll('.atlas-number-drift'),{y:-offset},{y:0,ease:'power1.in',scrollTrigger:{trigger:stats,start:'top bottom',end:'bottom 65%',scrub:true,invalidateOnRefresh:true}});
      g.fromTo(stats.querySelectorAll('.atlas-stat-label'),{y:narrow?32:96},{y:0,ease:'power1.in',scrollTrigger:{trigger:stats,start:'top bottom',end:'bottom 65%',scrub:true,invalidateOnRefresh:true}});
      counters.forEach(counter=>{
        if(seenCounts.has(counter)){counter.textContent=String(counter.dataset.atlasCount).padStart(2,'0');counter.dataset.value=counter.dataset.atlasCount;return;}
        counter.textContent='00';ST.create({trigger:counter.parentElement,start:'top 90%',once:true,onEnter:()=>count(counter)});
      });
      g.set(preview,{autoAlpha:0,clipPath:'ellipse(120% 0% at 50% 0%)'});g.set(previewVeil,{clipPath:'ellipse(120% 120% at 50% 100%)'});
      hoverTimeline=g.timeline({paused:true,onReverseComplete:()=>{preview.hidden=true;}})
        .to(preview,{autoAlpha:1,clipPath:'ellipse(120% 120% at 50% 0%)',duration:.8,ease:'power2.out'})
        .to(previewVeil,{clipPath:'ellipse(120% 0% at 50% 100%)',duration:.6,ease:'power2.out'},.4);
      quickX=g.quickTo(preview,'x',{duration:.5,ease:'power2.out'});quickY=g.quickTo(preview,'y',{duration:.5,ease:'power2.out'});
    });
    ST.refresh();
  }

  // Native details owns display/keyboard state; do not tween layout height.
  details.forEach(item=>item.addEventListener('toggle',()=>{
    cancelAnimationFrame(assistFrame);
    if(item.open)details.forEach(other=>{if(other!==item)other.open=false;});
    assistFrame=requestAnimationFrame(()=>{
      assistFrame=0;ST.refresh();const active=details.find(detail=>detail.open);if(!active)return;
      const bounds=active.getBoundingClientRect(),height=Input.viewportHeight();
      if(bounds.top<0||bounds.top>height*.3)scrollTo({top:scrollY+bounds.top-(innerWidth<=760?24:100),behavior:reduced()||Input.keyboardMode()?'auto':'smooth'});
    });
  },{signal}));
  const preferences=new MutationObserver(setup);preferences.observe(root,{attributes:true,attributeFilter:['data-reduced']});
  const modeChange=()=>setup();reduceQuery.addEventListener('change',modeChange);fine.addEventListener('change',modeChange);wide.addEventListener('change',modeChange);
  addEventListener('resize',()=>{
    const height=Input.viewportHeight();if(measuredWidth===innerWidth&&measuredHeight===height)return;
    measuredWidth=innerWidth;measuredHeight=height;clearTimeout(resizeTimer);resizeTimer=setTimeout(setup,160);
  },{signal});
  document.fonts.ready.then(()=>ST.refresh());setup();
  addEventListener('pagehide',event=>{
    hidePreview(true);transient.forEach(t=>t.progress(1));cancelAnimationFrame(scrollFrame);cancelAnimationFrame(assistFrame);clearTimeout(resizeTimer);
    if(!event.persisted){context?.revert();preferences.disconnect();abort.abort();reduceQuery.removeEventListener('change',modeChange);fine.removeEventListener('change',modeChange);wide.removeEventListener('change',modeChange);}
  });
  addEventListener('pageshow',event=>{if(event.persisted)setup();});
})();
