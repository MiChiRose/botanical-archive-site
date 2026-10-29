/* Critical startup gate. Hidden content is prepared once; nothing loads on first scroll. */
(() => {
  'use strict';
  const root=document.documentElement;
  root.dataset.boot='loading';
  let resolveScene,finished=false,timer;
  const scene=new Promise(resolve=>{resolveScene=resolve;});
  function release(reason){
    if(finished)return;finished=true;clearTimeout(timer);
    root.dataset.boot='ready';root.dataset.bootReason=reason;
    document.querySelectorAll('[data-boot-inert]').forEach(element=>{element.inert=false;element.removeAttribute('data-boot-inert');});
    const screen=document.querySelector('.boot-screen');
    if(screen){screen.setAttribute('aria-hidden','true');screen.addEventListener('transitionend',()=>{screen.hidden=true;},{once:true});setTimeout(()=>{screen.hidden=true;},400);}
    performance.mark('botanical-ready');dispatchEvent(new Event('botanical:ready'));
  }
  window.BotanicalBoot=Object.freeze({sceneReady:mode=>resolveScene(mode),get ready(){return finished;}});
  // A slow or unsupported GPU must not trap a visitor behind a loader.
  timer=setTimeout(()=>release('timeout'),12000);
  document.addEventListener('DOMContentLoaded',()=>{
    if(!finished)document.querySelectorAll('main,.masthead,footer').forEach(element=>{element.inert=true;element.dataset.bootInert='';});
    Promise.all([scene,document.fonts?.ready,...[...document.querySelectorAll('.specimen img,.living-fallback')].map(image=>image.decode?.().catch(()=>{}))]).then(([mode])=>requestAnimationFrame(()=>release(mode)));
  },{once:true});
  addEventListener('pageshow',event=>{if(event.persisted)release('restored');});
})();
