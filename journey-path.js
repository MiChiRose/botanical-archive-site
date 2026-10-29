/* LN-23: two cubic Bezier segments measured in local CSS pixels.
 * Each segment occupies half the progress, independently of arc length.
 * Original geometry: research app.pretty.js 63677–63897.
 */
((root)=>{
  'use strict';
  const clamp=p=>Math.max(0,Math.min(1,p));
  const lerp=(a,b,p)=>a+(b-a)*p;
  const cubic=(a,b,c,d,p)=>{
    const q=1-p;
    return {x:q*q*q*a.x+3*q*q*p*b.x+3*q*p*p*c.x+p*p*p*d.x,
      y:q*q*q*a.y+3*q*q*p*b.y+3*q*p*p*c.y+p*p*p*d.y};
  };
  function at(progress,anchors){
    const p=clamp(progress),[a,b,c]=anchors,dy1=b.y-a.y,dy2=c.y-b.y;
    const first=p<=.5,t=first?p*2:(p-.5)*2;
    const point=first?cubic(a,{x:a.x,y:a.y+.4*dy1},{x:b.x,y:b.y-.3*dy1},b,t)
      :cubic(b,{x:b.x,y:b.y+.3*dy2},{x:b.x+.6*(c.x-b.x),y:c.y-.2*dy2},c,t);
    const from=first?a:b,to=first?b:c;
    return {...point,width:lerp(from.width,to.width,t),progress:p};
  }
  const api=Object.freeze({at,clamp,lerp});
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.BotanicalPath=api;
})(typeof window==='object'?window:globalThis);
