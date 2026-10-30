/* LN-03 / LN-04, adapted to a single botanical archive.
 * One reversible GSAP timeline, native dialog focus isolation, native scroll.
 * Original references, deliberate deviations and QA: ARCHIVE-NAVIGATION.md.
 */
(() => {
  'use strict';
  const root=document.documentElement,Input=window.BotanicalInput,g=window.gsap,I18n=window.BotanicalI18n;
  const header=document.querySelector('.masthead'),brand=header.querySelector('.brand'),opener=header.querySelector('.menu-toggle'),menu=document.querySelector('.archive-menu');
  const closer=menu.querySelector('.menu-close'),links=[...menu.querySelectorAll('.menu-link')],photos=[...menu.querySelectorAll('.menu-photo')],columns=[...menu.querySelectorAll('.menu-column-drift')];
  const strokes=[...menu.querySelectorAll('.menu-branch path')],shade=menu.querySelector('.menu-shade'),about=menu.querySelector('[data-menu-about]');
  const reduceQuery=matchMedia('(prefers-reduced-motion:reduce)'),wide=matchMedia('(min-width:992px)'),fine=matchMedia('(hover:hover) and (pointer:fine)');
  const reduced=()=>root.dataset.reduced==='true'||reduceQuery.matches;
  const abort=new AbortController(),signal=abort.signal;
  let timeline,desired=false,lockedY=null,afterClose=null,returnFocus=opener,scrollFrame=0,resizeTimer=0,bounds=[],current='',closingInternally=false;
  let measuredWidth=innerWidth,measuredHeight=Input.viewportHeight();
  root.classList.add('has-archive-nav');

  function measure(){
    if(menu.open)return;
    bounds=[...document.querySelectorAll('[data-nav-tone]')].map(element=>({element,top:element.getBoundingClientRect().top+scrollY,tone:element.dataset.navTone})).sort((a,b)=>a.top-b.top);
    updateHeader();
  }
  function updateHeader(){
    scrollFrame=0;if(menu.open||document.body.classList.contains('modal-open'))return;
    const height=Input.viewportHeight(),p=Math.max(0,Math.min(1,scrollY/(height*.1)));
    // power2.out scrub of the original groups, without another scroll engine.
    const scale=wide.matches&&!reduced()?1+.2*Math.pow(1-p,3):1;
    brand.style.transform=`scale(${scale})`;header.dataset.navScale=scale.toFixed(4);
    header.dataset.scrolled=String(scrollY>(wide.matches?1:10));
    const edge=scrollY+header.offsetHeight*.5;
    let active=bounds[0];for(const box of bounds){if(box.top<=edge)active=box;else break;}
    header.dataset.navTheme=active?.tone||'dark';
    const chapter=active?.element.id||'living-form',section=chapter.startsWith('form-')?'form-journey':chapter;
    if(section!==current){current=section;links.forEach(link=>{if(link.hash===`#${section}`)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');});}
  }
  const schedule=()=>{if(!scrollFrame)scrollFrame=requestAnimationFrame(updateHeader);};
  function labels(){
    opener.setAttribute('aria-expanded',String(desired));opener.setAttribute('aria-label',I18n.t(desired?'Закрыть меню разделов':'Открыть меню разделов'));
    closer.setAttribute('aria-expanded',String(desired));
    closer.setAttribute('aria-label',I18n.t(desired?'Закрыть меню разделов':'Открыть меню разделов'));
  }
  function lock(){
    if(lockedY!==null)return;
    window.BotanicalScroll.cancel();lockedY=scrollY;document.body.style.top=`${-lockedY}px`;document.body.classList.add('modal-open');
  }
  function unlock(){
    if(lockedY===null)return;
    const y=lockedY;lockedY=null;document.body.classList.remove('modal-open');document.body.style.top='';scrollTo({top:y,behavior:'instant'});
    dispatchEvent(new Event('botanical:layout'));window.ScrollTrigger?.refresh();measure();
  }
  function finishClose(){
    if(desired)return;
    timeline?.pause(0,true);g?.killTweensOf([...photos,...columns]);g?.set(columns,{y:0});
    if(menu.open){closingInternally=true;menu.close();closingInternally=false;}
    menu.dataset.state='closed';unlock();labels();
    const action=afterClose;afterClose=null;
    if(action)action();else if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});
  }
  function buildTimeline(){
    if(!g)return;
    timeline?.kill();g.killTweensOf([...photos,...columns]);
    const masks=links.map(link=>link.querySelector('.menu-link-mask'));
    g.set(menu,{clipPath:'ellipse(120% 0% at 50% 0%)'});g.set(photos,{y:25,clipPath:'ellipse(120% 0% at 50% 0%)',opacity:.62});
    g.set(masks,{y:20,clipPath:'ellipse(30% 0% at 50% 0%)'});g.set(columns,{y:0});g.set(shade,{opacity:0});
    strokes.forEach(path=>{const length=path.getTotalLength();g.set(path,{strokeDasharray:length,strokeDashoffset:length});});
    timeline=g.timeline({paused:true,onComplete:()=>{if(desired)menu.dataset.state='open';},onReverseComplete:finishClose});
    timeline.to(menu,{clipPath:'ellipse(120% 100% at 50% 20%)',duration:.8,ease:'power3.out'},0)
      .to(photos,{y:0,clipPath:'ellipse(120% 100% at 50% 20%)',duration:.8,stagger:.06,ease:'power3.out'},.15)
      .to(masks,{y:0,clipPath:'ellipse(120% 100% at 50% 20%)',duration:.6,stagger:.08,ease:'back.out(1.2)'},.35)
      .to(strokes,{strokeDashoffset:0,duration:.6,stagger:.05,ease:'power2.inOut'},.4)
      .to(shade,{opacity:.12,duration:.6,ease:'none'},.6);
  }
  function setOpen(open,{instant=false,trigger=opener,complete=null}={}){
    if(open&&document.querySelector('dialog[open]')&&!menu.open)return;
    desired=open;afterClose=complete;labels();
    if(open){
      if(!menu.open){returnFocus=trigger;lock();menu.showModal();menu.scrollTop=0;menu.querySelector('.menu-body').scrollTop=0;closer.focus({preventScroll:true});}
      menu.dataset.state=instant||reduced()||!timeline?'open':'opening';
      if(!timeline||instant||reduced()){
        timeline?.progress(1,true).pause();
        if(!timeline){menu.style.clipPath='none';links.forEach(link=>{link.querySelector('.menu-link-mask').style.clipPath='none';});}
      }else timeline.timeScale(1).play();
    }else{
      menu.dataset.state='closing';
      if(!menu.open||instant||reduced()||!timeline||timeline.time()===0)finishClose();
      else timeline.timeScale(1.5).reverse();
    }
  }
  function toggle(event){setOpen(!desired,{instant:Input.keyboard(event),trigger:event.currentTarget});}
  opener.addEventListener('click',toggle,{signal});closer.addEventListener('click',toggle,{signal});
  menu.addEventListener('keydown',event=>{if(event.key==='Tab'&&desired&&menu.dataset.state==='opening'){timeline?.progress(1,true).pause();menu.dataset.state='open';}},{signal});
  menu.addEventListener('cancel',event=>{event.preventDefault();setOpen(false,{instant:true});},{signal});
  menu.addEventListener('close',()=>{
    // Native close events are queued after close(); only handle a still-locked menu.
    if(!closingInternally&&lockedY!==null&&!menu.open){desired=false;finishClose();}
  },{signal});
  menu.querySelectorAll('a[href^="#"]').forEach(link=>link.addEventListener('click',event=>{
    if(event.button>0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();event.stopPropagation();
    const target=document.querySelector(link.getAttribute('href'));if(!target)return;
    const instant=Input.keyboard(event);
    setOpen(false,{instant,complete:()=>{
      const y=target.getBoundingClientRect().top+scrollY-(target.id==='living-form'?0:header.offsetHeight+14);
      window.BotanicalScroll.to(y,{instant,complete:()=>{
        if(location.hash!==link.hash)history.pushState(null,'',link.getAttribute('href'));
        const old=target.getAttribute('tabindex');if(old===null)target.setAttribute('tabindex','-1');target.focus({preventScroll:true});if(old===null)target.addEventListener('blur',()=>target.removeAttribute('tabindex'),{once:true});
      }});
    }});
  },{signal}));
  about.addEventListener('click',event=>setOpen(false,{instant:Input.keyboard(event),complete:()=>document.querySelector('[data-about]').click()}),{signal});
  menu.querySelectorAll('a[href="https://michirose.github.io"]').forEach(link=>link.addEventListener('click',event=>{if(event.button>0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;desired=false;afterClose=null;finishClose();},{signal}));
  const canFollow=()=>menu.open&&desired&&wide.matches&&fine.matches&&!reduced();
  menu.addEventListener('pointermove',event=>{
    if(event.pointerType!=='mouse'||!canFollow())return;
    const n=2*(event.clientY/innerHeight-.5),rem=parseFloat(getComputedStyle(root).fontSize);
    g?.to(columns,{y:i=>(i?1:-1)*6*n*rem,duration:2,ease:'power2.out',overwrite:'auto'});
  },{passive:true,signal});
  function photoFocus(photo,instant=false){
    if(!menu.open||!wide.matches||!fine.matches||reduced())return;
    photos.forEach(item=>g?.to(item,{opacity:photo?(item.dataset.menuImage===photo?1:.16):.62,duration:instant?0:item.dataset.menuImage===photo?.2:.3,overwrite:'auto'}));
  }
  links.forEach(link=>{
    link.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse')photoFocus(link.dataset.menuPhoto);},{signal});
    link.addEventListener('pointerleave',()=>photoFocus(null),{signal});
    link.addEventListener('focus',()=>{if(Input.keyboardMode())photoFocus(link.dataset.menuPhoto,true);},{signal});
    link.addEventListener('blur',()=>photoFocus(null,true),{signal});
  });
  function preference(){
    if(menu.open){timeline?.progress(desired?1:0,true).pause();if(desired)menu.dataset.state='open';else finishClose();}
    if(reduced()||!wide.matches){g?.killTweensOf(columns);g?.set(columns,{y:0});}schedule();
  }
  const preferences=new MutationObserver(preference);preferences.observe(root,{attributes:true,attributeFilter:['data-reduced']});
  reduceQuery.addEventListener('change',preference);wide.addEventListener('change',preference);fine.addEventListener('change',preference);
  addEventListener('scroll',schedule,{passive:true,signal});
  addEventListener('resize',()=>{
    const height=Input.viewportHeight();if(measuredWidth===innerWidth&&measuredHeight===height)return;
    measuredWidth=innerWidth;measuredHeight=height;clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{preference();measure();},160);
  },{signal});
  addEventListener('botanical:layout',measure,{signal});addEventListener('botanical:ready',measure,{signal});
  addEventListener('botanical:languagechange',()=>{labels();if(!menu.open)measure();},{signal});
  window.ScrollTrigger?.addEventListener('refresh',measure);
  document.fonts.ready.then(measure);buildTimeline();measure();labels();
  addEventListener('pagehide',event=>{
    desired=false;afterClose=null;finishClose();cancelAnimationFrame(scrollFrame);clearTimeout(resizeTimer);
    if(!event.persisted){timeline?.kill();g?.killTweensOf([...photos,...columns]);abort.abort();window.ScrollTrigger?.removeEventListener('refresh',measure);preferences.disconnect();reduceQuery.removeEventListener('change',preference);wide.removeEventListener('change',preference);fine.removeEventListener('change',preference);}
  });
  addEventListener('pageshow',event=>{if(event.persisted)measure();});
})();
