/* LN-26/27 UI and one transactional timeline adapter. No render loop here. */
(() => {
  'use strict';
  const forms=[
    {id:'flower',name:'Цветок кобеи',type:'Цветок',latin:'Cobaea scandens',file:'cobaea',structure:'Десять лепестков',character:'Раскрытый жест',description:'Десять лепестков раскрываются вокруг одного центра. Свет переходит с изгиба на изгиб, меняя силуэт цветка.'},
    {id:'fern',name:'Побеги адиантума',type:'Завиток',latin:'Adiantum pedatum',file:'fern',structure:'Три спирали',character:'Собранный жест',description:'Три побега закручиваются внутрь. Линия становится спиралью и собирает движение в одной точке.'},
    {id:'poppy',name:'Коробочка мака',type:'Коробочка',latin:'Papaver orientale',file:'poppy',structure:'Двенадцать рёбер',character:'Радиальный ритм',description:'Плотная оболочка поднимается к зубчатой короне. Продольные рёбра удерживают ритм и делают маленькую форму монументальной.'}
  ];
  function create({section,g,t,Input,still,wake,layout}){
    const choices=[...section.querySelectorAll('[data-form-choice]')],copy=section.querySelector('.cabinet-copy'),fields=[...copy.querySelectorAll('.cabinet-copy-value')];
    const pause=section.querySelector('.cabinet-pause'),previous=section.querySelector('.cabinet-prev'),next=section.querySelector('.cabinet-next-form'),announcement=section.querySelector('.cabinet-announcement');
    const abort=new AbortController(),signal=abort.signal,pose={wipe:0,angle:0,rotation:0,reverse:0};let timeline,rotationPaused=false,disposed=false;
    const covers=fields.map(field=>{const cover=document.createElement('span');cover.className='cabinet-text-veil';cover.setAttribute('aria-hidden','true');field.parentElement.append(cover);return cover;});
    function cancel(){timeline?.kill();timeline=null;g?.killTweensOf([pose,...fields,...covers]);}
    function sync(index){
      const item=forms[index];
      section.querySelector('.cabinet-name .cabinet-copy-value').textContent=t(item.name);
      section.querySelector('.cabinet-number .cabinet-copy-value').textContent=t('{number} / 03 — {form}',{number:String(index+1).padStart(2,'0'),form:t(item.type)});
      section.querySelector('.cabinet-latin .cabinet-copy-value').textContent=item.latin;
      section.querySelector('.cabinet-description .cabinet-copy-value').textContent=t(item.description);
      section.querySelector('.cabinet-structure').textContent=t(item.structure);section.querySelector('.cabinet-character').textContent=t(item.character);
      section.querySelector('.cabinet-study').textContent=String(index+1).padStart(3,'0');
      choices.forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));
      section.dataset.currentForm=item.id;copy.dataset.form=item.id;
    }
    const controller=window.BotanicalSwitch.create({count:forms.length,initial:1,cancel,
      commit:index=>{sync(index);layout?.();},
      hide(direction,done){
        pose.reverse=direction===1?0:1;
        const duration=Math.max(.16,1-pose.wipe);
        timeline=g.timeline({onUpdate:wake,onComplete:done})
          .to(pose,{wipe:1,angle:-direction*Math.PI/4,duration,ease:'expo.in'},0)
          .to(fields,{yPercent:-25,opacity:0,duration:Math.min(.5,duration),stagger:.015,ease:'power2.in'},0);
      },
      show(direction,done){
        pose.reverse=direction===1?0:1;
        pose.angle=direction*Math.PI/4;pose.wipe=1;g.set(fields,{yPercent:25,opacity:0});g.set(covers,{scaleX:1});
        timeline=g.timeline({onUpdate:wake,onComplete:done})
          .to(pose,{wipe:0,angle:0,duration:1,ease:'expo.out'},0)
          .to(fields,{yPercent:0,opacity:1,duration:.5,stagger:.015,ease:'power2.out'},0)
          .to(covers,{scaleX:0,duration:.5,stagger:.015,ease:'power2.inOut'},.2);
      },
      instant(){pose.wipe=0;pose.angle=0;g?.set(fields,{clearProps:'transform,opacity'});g?.set(covers,{scaleX:0});wake();},
      change({current,desired,phase}){
        section.dataset.phase=phase;section.dataset.requestedForm=forms[desired].id;copy.setAttribute('aria-busy',String(phase!=='idle'));
        choices.forEach((button,i)=>{button.dataset.pending=String(phase!=='idle'&&desired!==current&&i===desired);});
        if(phase==='idle')announcement.textContent=t('Выбрана форма: {name}',{name:t(forms[current].name)});
        wake();
      }
    });
    function request(index,event,direction){
      controller.request(index,{instant:!g||still()||Input.keyboard(event),direction});
    }
    choices.forEach((button,i)=>{
      button.addEventListener('click',event=>request(i,event,i>=controller.current?1:-1),{signal});
      button.addEventListener('keydown',event=>{
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();
        const index=event.key==='Home'?0:event.key==='End'?2:(controller.desired+(event.key==='ArrowRight'?1:2))%3;
        choices[index].focus({preventScroll:true});controller.request(index,{instant:true});
      },{signal});
    });
    previous.addEventListener('click',event=>request(controller.desired-1,event,-1),{signal});next.addEventListener('click',event=>request(controller.desired+1,event,1),{signal});
    function pauseLabel(){pause.setAttribute('aria-label',t(rotationPaused?'Продолжить вращение скульптуры':'Остановить вращение скульптуры'));pause.setAttribute('aria-pressed',String(rotationPaused));pause.textContent=rotationPaused?'▷':'Ⅱ';}
    pause.addEventListener('click',()=>{rotationPaused=!rotationPaused;pauseLabel();wake();},{signal});
    const buttons=[...choices,previous,next,pause];buttons.forEach(button=>{button.disabled=true;});sync(1);section.dataset.requestedForm='fern';pauseLabel();
    return Object.freeze({pose,get current(){return controller.current;},get desired(){return controller.desired;},get phase(){return controller.phase;},
      update(dt,animate){if(animate&&!rotationPaused&&!still())pose.rotation+=dt*.12;},
      ready(){section.classList.add('is-enhanced');buttons.forEach(button=>{button.disabled=false;});section.querySelector('.cabinet-status').textContent='';},
      syncLanguage(){sync(controller.current);pauseLabel();if(controller.phase==='idle')announcement.textContent=t('Выбрана форма: {name}',{name:t(forms[controller.current].name)});},
      settle(){controller.settle();},dispose(){if(disposed)return;disposed=true;controller.dispose();abort.abort();},forms});
  }
  window.BotanicalCabinet=Object.freeze({create});
})();
