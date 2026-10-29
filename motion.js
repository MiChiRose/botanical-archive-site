/* Additional botanical studies. Native scroll, CSS sticky, GSAP transforms.
   All animation states have a readable static / reduced-motion equivalent. */
(() => {
  'use strict';
  const gs=window.gsap, root=document.documentElement;
  const scene=document.querySelector('.observation'), sticky=scene.querySelector('.observation-sticky');
  const image=scene.querySelector('.study-window img'), mat=scene.querySelector('.study-mat');
  const steps=[...scene.querySelectorAll('.story-step')], buttons=[...scene.querySelectorAll('[data-step]')];
  const bar=scene.querySelector('.study-progress span');
  const headings=[...document.querySelectorAll('[data-reveal]')];
  const compact=matchMedia('(max-width: 760px)'), systemReduced=matchMedia('(prefers-reduced-motion: reduce)');
  const shortViewport=matchMedia('(max-height:599px)');
  const reduced=()=>root.dataset.reduced==='true'||systemReduced.matches;
  const staticScene=()=>reduced()||!gs;
  const clamp=v=>Math.max(0,Math.min(1,v));
  let frame=0, current=-1, observer, start=0, distance=1;
  const tweens=new Set(), seen=new WeakSet();
  function animate(target,from,to){
    if(!gs||reduced()){if(gs)gs.set(target,{clearProps:'all'});return;}
    let tween=gs.fromTo(target,from,{...to,onComplete:()=>tweens.delete(tween)});tweens.add(tween);
  }
  function enter(element){
    if(seen.has(element))return;seen.add(element);
    animate(element.querySelectorAll('.line-mask > span'),{yPercent:110,rotation:2},{yPercent:0,rotation:0,duration:.9,ease:'power3.out',stagger:.09,clearProps:'transform'});
  }
  function measure(){
    start=scene.getBoundingClientRect().top+scrollY;
    distance=Math.max(1,scene.offsetHeight-sticky.offsetHeight);
    if(shortViewport.matches&&!staticScene()){
      const box=scene.querySelector('.study-figure').getBoundingClientRect();start=box.top+scrollY-innerHeight;distance=box.height+innerHeight;
    }
    scene.dataset.scrollStart=String(start);scene.dataset.scrollEnd=String(start+distance);
    schedule();
  }
  function render(){
    frame=0;
    if(staticScene())return;
    const p=clamp((scrollY-start)/distance);
    scene.dataset.progress=p.toFixed(4);scene.dataset.zoom=(1+p*.72).toFixed(3);
    image.style.transform=`translate3d(${p*-4}%,${p*10}%,0) scale(${1+p*.72})`;
    mat.style.transform=`rotate(${-3+3*p}deg)`;
    bar.style.transform=`scaleX(${p})`;
    if(shortViewport.matches)return;
    const next=Math.min(2,Math.floor(p*3));
    if(next!==current){
      current=next;
      steps.forEach((step,i)=>{step.classList.toggle('is-current',i===next);step.setAttribute('aria-hidden',String(i!==next));});
      buttons.forEach((button,i)=>button.setAttribute('aria-pressed',String(i===next)));
      scene.dataset.step=String(next+1);
    }
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(render);}
  function configure(){
    const simple=staticScene();scene.classList.toggle('is-static',simple);current=-1;
    scene.classList.toggle('is-mobile-motion',compact.matches&&!simple&&!shortViewport.matches);
    scene.classList.toggle('is-flow-motion',shortViewport.matches&&!simple);
    scene.dataset.motion=simple?'static':shortViewport.matches?'flow-scroll':compact.matches?'mobile-scroll':'desktop-scroll';
    if(simple||shortViewport.matches){
      image.style.transform='none';mat.style.transform='none';bar.style.transform='scaleX(1)';
      steps.forEach(step=>{step.classList.add('is-current');step.removeAttribute('aria-hidden');});
    }
    if(reduced()){
      tweens.forEach(t=>t.kill());tweens.clear();
      if(gs)gs.set(document.querySelectorAll('.line-mask > span'),{clearProps:'all'});
    }
    measure();
  }
  buttons.forEach((button,i)=>button.addEventListener('click',event=>{
    if(staticScene())return;
    scene.dataset.keyboard=String(event.detail===0);
    const p=[.05,.5,.95][i];
    scrollTo({top:start+distance*p,behavior:event.detail===0||reduced()?'instant':'smooth'});
  }));
  if('IntersectionObserver' in window){
    if(gs&&!reduced()){
      gs.set(document.querySelectorAll('.line-mask > span'),{yPercent:110,rotation:2});
    }
    observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){enter(entry.target);observer.unobserve(entry.target);}}),{threshold:.15});
    headings.forEach(element=>observer.observe(element));
  }
  // Observe the shared motion switch rather than maintaining a second preference.
  const preferenceObserver=new MutationObserver(configure);
  preferenceObserver.observe(root,{attributes:true,attributeFilter:['data-reduced']});
  compact.addEventListener('change',configure);shortViewport.addEventListener('change',configure);systemReduced.addEventListener('change',configure);
  addEventListener('scroll',schedule,{passive:true});addEventListener('resize',measure);
  addEventListener('wheel',()=>{if(scene.dataset.keyboard==='true')scene.dataset.keyboard='false';},{passive:true});
  const sizeObserver=new ResizeObserver(measure);sizeObserver.observe(scene);sizeObserver.observe(sticky);
  document.fonts.ready.then(measure);
  configure();
  addEventListener('pagehide',()=>{
    cancelAnimationFrame(frame);frame=0;tweens.forEach(t=>t.kill());tweens.clear();
    if(gs)gs.set(document.querySelectorAll('.line-mask > span'),{clearProps:'all'});
    headings.forEach(element=>seen.add(element));
  });
  addEventListener('pageshow',event=>{if(event.persisted)configure();});
})();
