/* Interruptible, duration-controlled chapter travel; document scrolling stays native. */
(() => {
  'use strict';
  const root=document.documentElement,reduce=matchMedia('(prefers-reduced-motion:reduce)');
  let frame=0,flight=null;
  const immediate=()=>reduce.matches||root.dataset.reduced==='true';
  function cancel(){cancelAnimationFrame(frame);frame=0;flight=null;delete root.dataset.scrollFlight;}
  const ease=p=>p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2;
  function to(top,{instant=false,complete}={}){
    cancel();const start=scrollY,end=Math.max(0,Math.min(top,document.documentElement.scrollHeight-innerHeight)),distance=end-start;
    if(instant||immediate()||Math.abs(distance)<2){scrollTo({top:end,behavior:'instant'});complete?.();return;}
    const duration=Math.min(1700,Math.max(750,Math.abs(distance)*.55));
    flight={start,end,duration,time:performance.now()};root.dataset.scrollFlight='running';
    const tick=now=>{
      if(!flight)return;
      const p=Math.min(1,(now-flight.time)/flight.duration);
      scrollTo({top:flight.start+(flight.end-flight.start)*ease(p),behavior:'instant'});
      if(p<1)frame=requestAnimationFrame(tick);else{cancel();complete?.();}
    };
    frame=requestAnimationFrame(tick);
  }
  window.BotanicalScroll=Object.freeze({to,cancel});
  document.addEventListener('click',event=>{
    const link=event.target.closest('a[href^="#"]');
    if(!link||event.defaultPrevented||event.button>0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||link.hasAttribute('download'))return;
    const hash=link.getAttribute('href'),target=hash==='#'?document.body:document.getElementById(hash.slice(1));
    if(!target)return;event.preventDefault();
    to(target.getBoundingClientRect().top+scrollY,{instant:window.BotanicalInput.keyboard(event),complete:()=>{
      if(location.hash!==hash)history.pushState(null,'',hash);
      if(target!==document.body){const original=target.getAttribute('tabindex');if(original===null)target.setAttribute('tabindex','-1');target.focus({preventScroll:true});if(original===null)target.addEventListener('blur',()=>target.removeAttribute('tabindex'),{once:true});}
    }});
  });
  for(const type of ['wheel','touchstart','pointerdown','keydown','popstate','pagehide'])addEventListener(type,cancel,{passive:true});
  let measuredWidth=innerWidth,measuredHeight=window.BotanicalInput.viewportHeight();
  addEventListener('resize',()=>{const height=window.BotanicalInput.viewportHeight();if(measuredWidth!==innerWidth||measuredHeight!==height){measuredWidth=innerWidth;measuredHeight=height;cancel();}},{passive:true});
  new MutationObserver(()=>{if(immediate())cancel();}).observe(root,{attributes:true,attributeFilter:['data-reduced']});
})();
