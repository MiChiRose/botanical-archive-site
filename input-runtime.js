/* Input shared by mouse, iOS Touch Events and keyboard. No UA sniffing. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root&&root.document){root.BotanicalInput=api;api.install(root);}
})(typeof window==='undefined'?null:window,()=>{
  'use strict';
  let environment,modality='keyboard',tap=null,suppressed=null,activating=false;
  const now=()=>environment.performance.now();
  const touchCapable=()=>('ontouchstart' in environment)&&environment.navigator.maxTouchPoints>0;
  const keyboard=event=>event.detail===0&&modality==='keyboard';
  const viewportHeight=()=>Math.round(environment.document.querySelector('.viewport-probe')?.clientHeight||environment.innerHeight);
  function suppress(root,x,y){suppressed={root,x,y,until:now()+650};}
  function install(win){
    environment=win;const doc=win.document;
    const reset=kind=>{modality=kind;suppressed=null;};
    const press=(event,point)=>{
      reset('touch');
      const button=event.target.closest?.('button');
      tap=button&&!button.disabled&&!button.closest('[inert]')?{button,x:point.clientX,y:point.clientY,moved:false}:null;
    };
    const move=point=>{if(tap&&Math.hypot(point.clientX-tap.x,point.clientY-tap.y)>12)tap.moved=true;};
    const lift=(event,point)=>{
      const previous=tap;tap=null;
      if(!previous||previous.moved||previous.button.disabled||!previous.button.isConnected||previous.button.closest('[inert]'))return;
      if(suppressed&&now()<suppressed.until&&suppressed.root.contains(previous.button))return;
      if(Math.hypot(point.clientX-previous.x,point.clientY-previous.y)>12)return;
      // Safari can omit a compatibility click when a moving hit target changes.
      // Activate once at touchend, then swallow only the duplicate native click.
      if(event.cancelable)event.preventDefault();
      suppress(previous.button,point.clientX,point.clientY);
      activating=true;
      try{previous.button.focus({preventScroll:true});previous.button.click();}
      finally{activating=false;}
    };
    doc.addEventListener('keydown',event=>{if(!event.metaKey&&!event.ctrlKey&&!event.altKey){reset('keyboard');tap=null;}},true);
    doc.addEventListener('pointerdown',event=>{
      if(event.pointerType==='touch'){
        if(!touchCapable()&&event.isPrimary)press(event,event);
      }else reset('pointer');
    },true);
    doc.addEventListener('pointermove',event=>{if(event.pointerType==='touch'&&!touchCapable())move(event);},{passive:true});
    doc.addEventListener('pointerup',event=>{if(event.pointerType==='touch'&&!touchCapable())lift(event,event);});
    doc.addEventListener('pointercancel',()=>{tap=null;},{passive:true});
    doc.addEventListener('touchstart',event=>{
      if(event.touches.length===1)press(event,event.touches[0]);else tap=null;
    },{passive:true,capture:true});
    doc.addEventListener('touchmove',event=>{if(event.touches.length===1)move(event.touches[0]);else tap=null;},{passive:true});
    doc.addEventListener('touchend',event=>{if(event.touches.length===0&&event.changedTouches.length===1)lift(event,event.changedTouches[0]);else tap=null;},{passive:false});
    doc.addEventListener('touchcancel',()=>{tap=null;},{passive:true});
    doc.addEventListener('click',event=>{
      if(activating||!suppressed||now()>suppressed.until)return;
      const close=Math.hypot(event.clientX-suppressed.x,event.clientY-suppressed.y)<32;
      if(suppressed.root.contains(event.target)||close){event.preventDefault();event.stopImmediatePropagation();suppressed=null;}
    },true);
    win.addEventListener('pagehide',()=>{tap=null;suppressed=null;});
  }
  return {install,keyboard,keyboardMode:()=>modality==='keyboard',viewportHeight};
});
