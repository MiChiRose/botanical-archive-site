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
  function bindDrag(element,{axis='x',enabled=()=>true,onPress=()=>{},onStart=()=>{},onMove=()=>{},onEnd=()=>{}}){
    let drag=null;
    const controller=new environment.AbortController(),signal=controller.signal;
    const point=(p,kind)=>({x:p.clientX,y:p.clientY,kind});
    function begin(id,p,kind,event){
      if(drag||!enabled(event))return;
      drag={id,kind,x:p.clientX,y:p.clientY,dx:0,dy:0,elapsed:0,at:now(),locked:axis==='both'};
      onPress(point(p,kind));if(drag.locked)onStart(point(p,kind));
    }
    function update(id,p,event){
      if(!drag||id!==drag.id)return;
      drag.dx=p.clientX-drag.x;drag.dy=p.clientY-drag.y;drag.elapsed=now()-drag.at;
      if(!drag.locked){
        if(Math.abs(drag.dy)>10&&Math.abs(drag.dy)>Math.abs(drag.dx)){finish(true);return;}
        if(Math.abs(drag.dx)<10||Math.abs(drag.dx)<Math.abs(drag.dy)*1.2)return;
        drag.locked=true;onStart(point(p,drag.kind));
        if(drag.kind==='pointer')element.setPointerCapture(id);
      }
      if(event.cancelable)event.preventDefault();
      onMove({...point(p,drag.kind),dx:drag.dx,dy:drag.dy});
    }
    function finish(cancelled=false){
      if(!drag)return;
      const previous=drag;drag=null;
      if(previous.kind==='pointer'&&element.hasPointerCapture(previous.id))element.releasePointerCapture(previous.id);
      if(previous.locked){
        suppress(element,previous.x+previous.dx,previous.y+previous.dy);
        onEnd({...previous,elapsed:now()-previous.at,cancelled});
      }
    }
    element.addEventListener('pointerdown',event=>{
      if(event.pointerType==='touch'&&touchCapable())return;
      if(event.button!==0||event.isPrimary===false)return;
      begin(event.pointerId,event,'pointer',event);
      if(drag?.locked){element.setPointerCapture(event.pointerId);if(event.cancelable)event.preventDefault();}
    },{signal});
    element.addEventListener('pointermove',event=>{if(drag?.kind==='pointer')update(event.pointerId,event,event);},{signal});
    element.addEventListener('pointerup',event=>{if(drag?.kind==='pointer'&&event.pointerId===drag.id)finish();},{signal});
    element.addEventListener('pointercancel',event=>{if(drag?.kind==='pointer'&&event.pointerId===drag.id)finish(true);},{signal});
    element.addEventListener('lostpointercapture',event=>{
      // Implicit touch capture may be transferred from a child to this root.
      // A child's bubbling lost-capture event is not loss of OUR capture.
      if(event.target===element&&drag?.kind==='pointer'&&event.pointerId===drag.id)finish(true);
    },{signal});
    element.addEventListener('touchstart',event=>{
      if(event.touches.length!==1){finish(true);return;}
      const p=event.touches[0];begin(p.identifier,p,'touch',event);
    },{passive:true,signal});
    element.addEventListener('touchmove',event=>{
      if(event.touches.length!==1){finish(true);return;}
      const p=event.touches[0];if(drag?.kind==='touch')update(p.identifier,p,event);
    },{passive:false,signal});
    element.addEventListener('touchend',event=>{
      if(drag?.kind==='touch'&&[...event.changedTouches].some(p=>p.identifier===drag.id))finish(event.touches.length!==0);
    },{passive:true,signal});
    element.addEventListener('touchcancel',()=>finish(true),{passive:true,signal});
    const cancel=()=>finish(true);
    environment.addEventListener('blur',cancel,{signal});environment.addEventListener('pagehide',cancel,{signal});
    return {cancel,destroy(){finish(true);controller.abort();}};
  }
  return {install,bindDrag,keyboard,keyboardMode:()=>modality==='keyboard',viewportHeight};
});
