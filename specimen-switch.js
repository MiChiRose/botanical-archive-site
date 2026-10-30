/* Transactional hide → commit → show. Coalesces requests while hiding and
 * retargets an interrupted entrance. Model and copy share the commit point. */
((root,factory)=>{
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.BotanicalSwitch=api;
})(typeof window==='object'?window:globalThis,()=>{
  'use strict';
  function create({count,initial=0,hide,show,commit,cancel=()=>{},instant=()=>{},change=()=>{}}){
    let current=initial,desired=initial,phase='idle',epoch=0,direction=1,disposed=false;
    const notify=()=>change({current,desired,phase});
    function begin(){
      const token=++epoch;cancel();phase='hiding';notify();
      hide(direction,()=>{
        if(disposed||token!==epoch||phase!=='hiding')return;
        current=desired;phase='showing';commit(current,direction);notify();
        show(direction,()=>{
          if(disposed||token!==epoch||phase!=='showing')return;
          phase='idle';notify();if(desired!==current)begin();
        });
      });
    }
    function request(index,options={}){
      if(disposed||!Number.isInteger(index))return;
      desired=((index%count)+count)%count;direction=options.direction??(desired>=current?1:-1);
      if(options.instant){++epoch;cancel();current=desired;phase='idle';commit(current,direction);instant();notify();return;}
      if(phase==='hiding'){notify();return;}
      if(phase==='idle'&&desired===current){notify();return;}
      begin();
    }
    return Object.freeze({request,get current(){return current;},get desired(){return desired;},get phase(){return phase;},
      settle(){request(desired,{instant:true,direction});},dispose(){disposed=true;++epoch;cancel();}});
  }
  return Object.freeze({create});
});
