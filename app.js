/* LN-22 reconstruction: two-phase entrance and interruptible neighbour fan.
 * GSAP 3.13.0 and the photographic assets are local; no build step.
 */
(() => {
  'use strict';
  const t=window.BotanicalI18n.t;
  const Input=window.BotanicalInput;
  const data = [
    {name:'Хвощ',latin:'Equisetum hiemale',file:'horsetail',plate:'01',id:'225669-equisetum-hiemale',text:'Прямые рёбра, повторяющийся шаг, округлая вершина. Стебель выглядит как архитектурная деталь — и остаётся живой формой.'},
    {name:'Кобея',latin:'Cobaea scandens',file:'cobaea',plate:'74',text:'Лепестки складываются в объёмную чашу. Свет проявляет тонкие прожилки, а край цветка кажется почти вырезанным из бумаги.'},
    {name:'Акант',latin:'Acanthus mollis',file:'acanthus',plate:'92',text:'Один элемент повторяется вдоль стебля, но каждый раз чуть иначе. В этой небольшой разнице рождается ритм.'},
    {name:'Адиантум',latin:'Adiantum pedatum',file:'fern',plate:'55',id:'225723-adiantum-pedatum',text:'Шесть завитков, шесть разных жестов. Ещё не раскрывшиеся побеги напоминают свитки — каждый со своим характером.'},
    {name:'Костенец',latin:'Scolopendrium vulgare',file:'leaves',plate:'36',text:'Два листа повёрнуты по-разному. Складки собирают свет и тень, превращая плоскость в скульптуру.'},
    {name:'Гравилат',latin:'Geum rivale',file:'geum',plate:'12',text:'Тонкие стенки изгибаются, оставляя просветы. Продольные линии и арки превращают небольшую форму в почти архитектурный объём.'},
    {name:'Мак',latin:'Papaver orientale',file:'poppy',plate:'80',text:'Бутон ещё закрыт. Плотная оболочка, тонкие волоски и выступающие края делают его поверхность удивительно сложной.'}
  ];
  const cards=[...document.querySelectorAll('.specimen')], stage=document.querySelector('.fan-stage'), rail=stage.querySelector('.fan');
  const replay=document.querySelector('.replay-button'), motionButton=document.querySelector('.motion-toggle');
  const name=document.querySelector('.selection-name'), latin=document.querySelector('.selection-latin');
  const viewer=document.querySelector('.viewer'), about=document.querySelector('.about');
  const reduceMedia=matchMedia('(prefers-reduced-motion: reduce)'), hoverMedia=matchMedia('(hover:hover) and (pointer:fine)');
  const g=window.gsap;
  let ready=false, selected=null, mobileIndex=3, manualReduce=false, entrance=null, leaveTimer=null, resizeFrame=null, lastTrigger=null, activeViewer=3;
  let lastAnnounced=null, railFrame=0, railTimer=0, railTarget=null;
  const baseX=[-30,-22,-11,0,11,22,30];
  const baseY=[7.3,4,1.3,0,1.3,4,7.3], scales=[.7756,.8498,.9346,1,.9346,.8498,.7756], rotations=[-21,-14,-7,0,7,14,21], layers=[1,2,3,10,3,2,1];
  const reduced=()=>reduceMedia.matches||manualReduce;
  const compact=()=>innerWidth<=700;
  function geometry(){
    const unit=Math.max(7,Math.min(14,(stage.clientWidth-60)/90));
    return cards.map((_,i)=>({x:baseX[i]*unit,y:baseY[i]*unit,scale:scales[i],rotation:rotations[i],unit}));
  }
  function setTransform(card,props){
    if(g)g.set(card,props);
    else card.style.transform=`translate(${props.x||0}px,${props.y||0}px) rotate(${props.rotation||0}deg) scale(${props.scale??1})`;
  }
  function announce(index){
    if(lastAnnounced===index)return;
    lastAnnounced=index;
    name.textContent=index===null?t('Смотрите внимательнее'):t(data[index].name);
    latin.textContent=index===null?t('В каждой форме — целый мир'):data[index].latin;
    if(index!==null){mobileIndex=index;document.querySelector('.picker-position').textContent=`${index+1} / 7`;}
  }
  function targets(index){
    const positions=geometry();
    return positions.map((base,i)=>{
      const p={...base};delete p.unit;
      if(index===null)return p;
      const distance=Math.abs(i-index), weight=1-Math.abs((i-3)/3), coefficient=1+.2*Math.max(0,3-distance);
      if(i===index){p.y-=2.5*base.unit;p.scale*=1.08;}
      else{
        const spread=8*weight*coefficient*base.unit;
        p.x+=i<index?-spread:(i===6?0:spread);
        p.rotation+=Math.sign(i-index)*3/(distance+1);
        if(i>index&&i===6)p.y-=base.unit;
      }
      return p;
    });
  }
  function arrange(index,{instant=false,move=true}={}){
    clearTimeout(leaveTimer);
    if(compact()){
      index=index??mobileIndex;selected=index;announce(index);stage.dataset.layout='rail';
      if(g&&cards.some(card=>card.style.transform)){g.killTweensOf(cards);g.set(cards,{clearProps:'transform'});}
      cards.forEach((card,i)=>{card.classList.toggle('is-active',i===index);card.style.zIndex='';});
      if(move){
        railTarget=index;
        const left=cards[index].offsetLeft-(rail.clientWidth-cards[index].offsetWidth)/2;
        rail.scrollTo({left,behavior:instant||reduced()?'auto':'smooth'});
        if(instant||reduced()||Math.abs(rail.scrollLeft-left)<2)railTarget=null;
      }
      return;
    }
    stage.dataset.layout='fan';selected=index;announce(index);
    const poses=targets(index);
    cards.forEach((card,i)=>{
      card.classList.toggle('is-active',i===index);
      card.style.zIndex=String(i===index?20:layers[i]);
      if(g)g.killTweensOf(card);
      const props=poses[i];
      if(instant||reduced()||!g)setTransform(card,props);
      else g.to(card,{...props,duration:.5,ease:'elastic.out(1,0.75)',delay:index===null?i*.02:Math.abs(i-index)*.02,overwrite:'auto'});
    });
  }
  function finishEntrance(){
    if(entrance){entrance.kill();entrance=null;}
    ready=true;stage.dataset.state='ready';arrange(compact()?mobileIndex:selected,{instant:true});
  }
  function reveal(repeat=false){
    clearTimeout(leaveTimer);
    if(compact()){
      entrance?.kill();entrance=null;ready=true;stage.dataset.state='ready';
      replay.querySelector('span').textContent=t('В начало ленты');
      arrange(0,{instant:!repeat});return;
    }
    replay.querySelector('span').textContent=t('Разложить ещё раз');
    if(entrance)entrance.kill();
    if(g)g.killTweensOf(cards);
    ready=false;selected=null;mobileIndex=3;document.querySelector('.picker-position').textContent='4 / 7';announce(null);stage.dataset.state='entering';
    const poses=geometry();
    cards.forEach((card,i)=>{card.classList.remove('is-active');card.style.zIndex=String(layers[i]);});
    if(reduced()||!g){finishEntrance();return;}
    entrance=g.timeline({onComplete:()=>{entrance=null;ready=true;stage.dataset.state='ready';if(compact())arrange(mobileIndex);}});
    if(repeat)entrance.to(cards,{x:0,y:poses[0].unit*10,rotation:0,scale:1,duration:.38,ease:'power3.inOut',stagger:{amount:.1,from:'center'}});
    else g.set(cards,{x:0,y:poses[0].unit*10,rotation:0,scale:1});
    entrance.to(cards,{y:0,duration:.8,ease:'power2.out',stagger:{amount:.5,from:'end'}})
      .to(cards,{x:i=>poses[i].x,y:i=>poses[i].y,rotation:i=>poses[i].rotation,scale:i=>poses[i].scale,duration:1.2,ease:'elastic.out(1,0.75)',stagger:{amount:.2,from:'center'}},'-=.4');
  }
  function select(index,instant=false){if(!ready)finishEntrance();arrange((index+7)%7,{instant});}
  cards.forEach((card,i)=>{
    card.addEventListener('pointerenter',event=>{clearTimeout(leaveTimer);if(ready&&!compact()&&hoverMedia.matches&&event.pointerType!=='touch')arrange(i);});
    card.addEventListener('pointerleave',()=>{if(ready&&!compact()&&hoverMedia.matches)leaveTimer=setTimeout(()=>{if(ready&&!viewer.open&&!about.open)arrange(null);},50);});
    card.addEventListener('focus',()=>{if(Input.keyboardMode()&&card.matches(':focus-visible'))select(i,true);});
    card.addEventListener('click',event=>{
      select(i,Input.keyboard(event));
      openViewer(i,card,Input.keyboard(event));
    });
    card.addEventListener('keydown',event=>{
      let next=null;
      if(event.key==='ArrowRight')next=(i+1)%7;
      if(event.key==='ArrowLeft')next=(i+6)%7;
      if(event.key==='Home')next=0;
      if(event.key==='End')next=6;
      if(next!==null){event.preventDefault();cards[next].focus({preventScroll:true});select(next,true);}
    });
  });
  stage.addEventListener('pointerleave',()=>{
    if(!ready||viewer.open||compact())return;
    if(cards.includes(document.activeElement)&&document.activeElement.matches(':focus-visible'))return;
    arrange(null);
  });
  stage.addEventListener('focusout',event=>{
    if(!compact()&&!stage.contains(event.relatedTarget)&&!viewer.open&&ready)arrange(null,{instant:true});
  });
  function syncRail(){
    railFrame=0;if(!compact())return;
    if(railTarget!==null){
      const target=cards[railTarget],left=target.offsetLeft-(rail.clientWidth-target.offsetWidth)/2;
      if(Math.abs(rail.scrollLeft-left)>2)return;
      railTarget=null;
    }
    const center=rail.scrollLeft+rail.clientWidth/2;
    let index=0,distance=Infinity;
    cards.forEach((card,i)=>{const delta=Math.abs(card.offsetLeft+card.offsetWidth/2-center);if(delta<distance){index=i;distance=delta;}});
    if(index!==selected)arrange(index,{move:false});
  }
  rail.addEventListener('scroll',()=>{
    if(!compact())return;
    if(!railFrame)railFrame=requestAnimationFrame(syncRail);
    clearTimeout(railTimer);railTimer=setTimeout(()=>{railTarget=null;syncRail();},160);
  },{passive:true});
  // Let the browser own panning and inertia; touching the rail only cancels a
  // pending arrow destination. No preventDefault, capture, or one-card drag.
  const touchRail=()=>{railTarget=null;};
  rail.addEventListener('pointerdown',touchRail,{passive:true});
  rail.addEventListener('touchstart',touchRail,{passive:true});
  replay.addEventListener('click',()=>reveal(true));
  function setMotion(){
    document.documentElement.dataset.reduced=String(reduced());
    motionButton.setAttribute('aria-pressed',String(reduced()));
    motionButton.disabled=reduceMedia.matches;
    motionButton.title=reduceMedia.matches?t('Включено в настройках вашей системы'):t('Показывать состояния без движения');
    if(entrance){entrance.kill();entrance=null;}
    ready=true;stage.dataset.state='ready';arrange(selected,{instant:true});
    for(const dialog of [viewer,about])if(dialog.dataset.closing==='true')closeDialog(dialog,true);
    if(g&&reduced()){const parts=[viewer,about,viewer.querySelector('.viewer-image img'),viewer.querySelector('.viewer-info')];g.killTweensOf(parts);g.set(parts,{clearProps:'opacity,transform'});}
  }
  motionButton.addEventListener('click',()=>{manualReduce=!manualReduce;setMotion();});
  reduceMedia.addEventListener('change',setMotion);
  function updateViewer(i,animate=false,direction=1){
    activeViewer=(i+7)%7;const item=data[activeViewer];
    const image=viewer.querySelector('img');image.src=`assets/${item.file}.jpg`;image.alt=cards[activeViewer].querySelector('img').alt;
    viewer.querySelector('h2').textContent=t(item.name);
    viewer.querySelector('.viewer-latin').textContent=item.latin;
    viewer.querySelector('.viewer-description').textContent=t(item.text);
    viewer.querySelector('.viewer-number').textContent=t('Лист {number} / 07 · Таблица {plate}',{number:String(activeViewer+1).padStart(2,'0'),plate:item.plate});
    viewer.querySelector('.viewer-position').textContent=`${activeViewer+1} / 7`;
    viewer.querySelector('.source-link').href=item.id?`https://www.nga.gov/artworks/${item.id}`:'https://www.nga.gov/artists/30239-karl-blossfeldt/artworks';
    select(activeViewer,true);
    const parts=[image,viewer.querySelector('.viewer-info')];
    if(g){g.killTweensOf(parts);g.set(parts,{clearProps:'transform,opacity'});if(animate&&!reduced())g.fromTo(parts,{opacity:0,x:direction*12},{opacity:1,x:0,duration:.24,ease:'power3.out',stagger:.035,clearProps:'transform,opacity'});}
  }
  let modalScroll=null;
  function lockPage(){
    if(modalScroll!==null)return;
    modalScroll=scrollY;document.body.style.top=`${-modalScroll}px`;
    document.body.classList.add('modal-open');
  }
  function unlockPage(){
    if(viewer.open||about.open||modalScroll===null)return;
    const y=modalScroll;modalScroll=null;
    document.body.classList.remove('modal-open');document.body.style.top='';
    scrollTo({top:y,behavior:'auto'});
  }
  function showDialog(dialog,instant){
    if(dialog.open)return;
    dialog.dataset.closing='false';lockPage();dialog.showModal();
    if(g){g.killTweensOf(dialog);g.set(dialog,{clearProps:'opacity,transform'});if(!instant&&!reduced())g.fromTo(dialog,{opacity:0,scale:.975,y:14},{opacity:1,scale:1,y:0,duration:.28,ease:'power3.out',clearProps:'opacity,transform'});}
  }
  function closeDialog(dialog,instant=false){
    if(!dialog.open)return;
    if(g)g.killTweensOf(dialog);
    if(instant||reduced()||!g){dialog.close();return;}
    dialog.dataset.closing='true';g.to(dialog,{opacity:0,scale:.985,y:8,duration:.18,ease:'power2.out',onComplete:()=>dialog.close()});
  }
  function openViewer(i,trigger,instant=false){lastTrigger=trigger;updateViewer(i);showDialog(viewer,instant);}
  document.querySelectorAll('[data-open-specimen]').forEach(button=>button.addEventListener('click',event=>openViewer(Number(button.dataset.openSpecimen),button,Input.keyboard(event))));
  viewer.querySelector('.close-button').addEventListener('click',event=>closeDialog(viewer,Input.keyboard(event)));
  viewer.querySelector('.viewer-prev').addEventListener('click',event=>updateViewer(activeViewer-1,!Input.keyboard(event),-1));
  viewer.querySelector('.viewer-next').addEventListener('click',event=>updateViewer(activeViewer+1,!Input.keyboard(event),1));
  viewer.addEventListener('keydown',event=>{
    if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();updateViewer(activeViewer+(event.key==='ArrowRight'?1:-1));}
  });
  viewer.addEventListener('close',()=>{unlockPage();if(lastTrigger?.isConnected)lastTrigger.focus({preventScroll:true});});
  document.querySelector('[data-about]').addEventListener('click',event=>showDialog(about,Input.keyboard(event)));
  about.querySelector('.close-about').addEventListener('click',event=>closeDialog(about,Input.keyboard(event)));
  about.addEventListener('close',unlockPage);
  for(const dialog of [viewer,about]){
    dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog(dialog,true);});
    dialog.addEventListener('close',()=>{dialog.dataset.closing='false';if(g){g.killTweensOf(dialog);g.set(dialog,{clearProps:'opacity,transform'});}});
    dialog.addEventListener('click',event=>{
    if(event.target!==dialog)return;const rect=dialog.getBoundingClientRect();
    if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeDialog(dialog);
    });
  }
  document.querySelector('.picker-prev').addEventListener('click',event=>select(mobileIndex-1,Input.keyboard(event)));
  document.querySelector('.picker-next').addEventListener('click',event=>select(mobileIndex+1,Input.keyboard(event)));
  document.querySelector('.picker-open').addEventListener('click',event=>openViewer(mobileIndex,event.currentTarget,Input.keyboard(event)));
  addEventListener('botanical:languagechange',()=>{
    lastAnnounced=undefined;announce(selected);
    replay.querySelector('span').textContent=t(compact()?'В начало ленты':'Разложить ещё раз');
    motionButton.title=t(reduceMedia.matches?'Включено в настройках вашей системы':'Показывать состояния без движения');
    if(viewer.open)updateViewer(activeViewer);
  });
  let lastWidth=innerWidth;
  addEventListener('resize',()=>{
    if(innerWidth===lastWidth)return;lastWidth=innerWidth;railTarget=null;
    cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{replay.querySelector('span').textContent=compact()?t('В начало ленты'):t('Разложить ещё раз');finishEntrance();arrange(compact()?mobileIndex:selected,{instant:true});});
  });
  document.documentElement.dataset.reduced=String(reduced());
  motionButton.setAttribute('aria-pressed',String(reduced()));motionButton.disabled=reduceMedia.matches;
  if(!g){finishEntrance();return;}
  // The fallback CSS is already readable. Only enhance once script is ready.
  if(compact())reveal();else g.set(cards,{x:0,y:geometry()[0].unit*10,rotation:0,scale:1});
  const observer=new IntersectionObserver(entries=>{
    if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();reveal();}
  },{threshold:.15});
  if(!compact())observer.observe(stage);
  addEventListener('pagehide',()=>{clearTimeout(railTimer);cancelAnimationFrame(railFrame);observer.disconnect();clearTimeout(leaveTimer);cancelAnimationFrame(resizeFrame);entrance?.kill();g.killTweensOf(cards);});
  addEventListener('pageshow',event=>{if(event.persisted)finishEntrance();});
})();
