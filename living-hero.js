/* Living specimen — genuine 3D / GPU fluid compositing.
 * Research references: LN-11 background; LN-12 camera/scroll; LN-13 fluid;
 * LN-14 curved full reveal; LN-15 material sweep; LN-23 anchor flight.
 * Original code is not bundled.
 */
(() => {
  'use strict';
  const Input=window.BotanicalInput;
  const host=document.querySelector('.living-hero'), stage=host.querySelector('.living-stage');
  const canvas=host.querySelector('canvas'), status=host.querySelector('.living-status');
  const revealButton=host.querySelector('.living-reveal'), finishButton=host.querySelector('.living-finish'), pauseButton=host.querySelector('.living-pause');
  const bloomRange=host.querySelector('.bloom-range'), bloomValue=host.querySelector('.bloom-value'), bloomPlay=host.querySelector('.bloom-play');
  const bloomPanel=host.querySelector('.living-bloom'), touchSurface=host.querySelector('.living-touch-surface');
  const inputEvents=new AbortController();
  let fluidGesture, pendingInput=null, pointerEnded=false, inputSamples=0;
  const mobileGpu=matchMedia('(pointer:coarse)').matches||innerWidth<=768;
  const intro=host.querySelector('.living-intro'), after=host.querySelector('.living-after'), rule=host.querySelector('.living-rule>span');
  const heroInterface=[...host.querySelectorAll('.living-controls,.living-bloom,.living-scroll,.living-rule,.living-coordinate')];
  const journey=document.querySelector('.form-journey'), Path=window.BotanicalPath;
  const anchors=[...journey.querySelectorAll('[data-journey-anchor]')], meter=journey.querySelector('.journey-meter-line i'), percentage=journey.querySelector('.journey-percent');
  const T=window.THREE, g=window.gsap, systemReduced=matchMedia('(prefers-reduced-motion: reduce)');
  const reduced=()=>systemReduced.matches||document.documentElement.dataset.reduced==='true';
  const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
  let renderer, disposed=false, raf=0, inView=true, paused=false, locked=false, hovering=false, bronze=false;
  let width=1,height=1,scrollProgress=0,lastTime=0,clock=0,frames=0,statTime=0,lastInput=performance.now(),firstInput=false;
  let mobileCenterY=.43,mobileSize=1;
  let stageHeight=1,heroStageTop=0,heroNear=true,journeyNear=false;
  const travel={anchors:[],top:0,height:1,p:0,bridge:0,active:false,bottom:0};
  let lastPointer=null, idlePointer=null, resizeTimer;
  let simulation, modelTarget, environmentTarget, pmrem, photoTexture, compositor;
  const materials=new Set(), geometries=new Set(), targets=new Set();
  const state={reveal:0,finish:0,bloom:1}, pointer={x:0,y:0,easeX:0,easeY:0};
  let bloomTimeline=null;
  function fallback(message){
    host.dataset.renderer='fallback';host.dataset.ready='false';status.textContent=message;
    journey.classList.remove('is-enhanced');
    intro.style.opacity='1';intro.style.transform='none';after.style.opacity='0';
    heroInterface.forEach(element=>{element.style.opacity='1';element.inert=false;});
    host.querySelector('.living-fallback').removeAttribute('aria-hidden');canvas.setAttribute('aria-hidden','true');
    requestAnimationFrame(()=>window.ScrollTrigger?.refresh());
    canvas.style.display='none';revealButton.disabled=true;finishButton.disabled=true;pauseButton.disabled=true;bloomRange.disabled=true;bloomPlay.disabled=true;
  }
  if(!T){fallback('Фотографический режим: 3D-библиотека недоступна.');return;}
  try{
    renderer=new T.WebGLRenderer({canvas,alpha:true,premultipliedAlpha:false,antialias:false,powerPreference:'high-performance'});
    if(!renderer.extensions.has('EXT_color_buffer_float'))throw new Error('Float color targets unavailable');
    renderer.setClearColor(0x000000,0);renderer.autoClear=true;
    renderer.outputColorSpace=T.LinearSRGBColorSpace;
    renderer.toneMapping=T.NoToneMapping;
  }catch(error){fallback('Фотографический режим: этому браузеру недоступна 3D-сцена.');renderer?.dispose();return;}
  // One viewport canvas, shared by hero compositing and the DOM-anchored flight.
  // Text remains HTML above it; transparent pixels expose the next chapter.
  canvas.classList.add('is-world');canvas.setAttribute('aria-hidden','true');document.body.append(canvas);

  const ownMaterial=m=>(materials.add(m),m), ownGeometry=v=>(geometries.add(v),v);
  function target(w,h,{depth=false,filter=T.LinearFilter}={}){
    const rt=new T.WebGLRenderTarget(w,h,{type:T.HalfFloatType,format:T.RGBAFormat,minFilter:filter,magFilter:filter,depthBuffer:depth,stencilBuffer:false,generateMipmaps:false});
    targets.add(rt);return rt;
  }
  const vertex=`varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
  const screenGeometry=ownGeometry(new T.PlaneGeometry(2,2)), screenCamera=new T.Camera(), passScene=new T.Scene();
  const quad=new T.Mesh(screenGeometry);quad.frustumCulled=false;passScene.add(quad);
  function shader(fragment,uniforms={}){return ownMaterial(new T.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,uniforms,depthTest:false,depthWrite:false,toneMapped:false}));}
  function pass(material,destination){quad.material=material;renderer.setRenderTarget(destination);renderer.render(passScene,screenCamera);}
  function clear(rt){renderer.setRenderTarget(rt);renderer.clear();}

  // Incompressible velocity and advected dye, each in separate ping-pong FBOs.
  // Simulation velocities are cells/second; dt is seconds (unlike the source site's scaled delta).
  class Fluid{
    constructor(w,h){
      this.w=w;this.h=h;this.texel=new T.Vector2(1/w,1/h);
      const pair=()=>({read:target(w,h),write:target(w,h),swap(){[this.read,this.write]=[this.write,this.read];}});
      this.velocity=pair();this.dye=pair();this.pressure=pair();this.divergence=target(w,h);this.curl=target(w,h);
      this.all=[this.velocity.read,this.velocity.write,this.dye.read,this.dye.write,this.pressure.read,this.pressure.write,this.divergence,this.curl];this.all.forEach(clear);
      this.advection=shader(`varying vec2 vUv;uniform sampler2D source,velocity;uniform vec2 texel;uniform float dt,decay;
        void main(){vec2 vel=texture2D(velocity,vUv).xy;vec2 p=vUv-dt*vel*texel;gl_FragColor=texture2D(source,clamp(p,texel,1.-texel))*decay;}`,{source:{value:null},velocity:{value:null},texel:{value:this.texel},dt:{value:.014},decay:{value:.99}});
      this.splat=shader(`varying vec2 vUv;uniform sampler2D source;uniform vec2 point;uniform vec3 force;uniform float aspect,radius;
        void main(){vec2 d=(vUv-point)*vec2(aspect,1.);float a=exp(-dot(d,d)/radius);vec3 old=texture2D(source,vUv).xyz;gl_FragColor=vec4(old+force*a,1.);}`,{source:{value:null},point:{value:new T.Vector2(.5,.5)},force:{value:new T.Vector3()},aspect:{value:1},radius:{value:.008}});
      this.curlPass=shader(`varying vec2 vUv;uniform sampler2D velocity;uniform vec2 texel;void main(){
        float L=texture2D(velocity,vUv-vec2(texel.x,0.)).y,R=texture2D(velocity,vUv+vec2(texel.x,0.)).y;
        float B=texture2D(velocity,vUv-vec2(0.,texel.y)).x,U=texture2D(velocity,vUv+vec2(0.,texel.y)).x;
        gl_FragColor=vec4(.5*(R-L-U+B),0.,0.,1.);}`,{velocity:{value:null},texel:{value:this.texel}});
      this.vorticity=shader(`varying vec2 vUv;uniform sampler2D velocity,curl;uniform vec2 texel;uniform float dt;
        void main(){float L=texture2D(curl,vUv-vec2(texel.x,0.)).x,R=texture2D(curl,vUv+vec2(texel.x,0.)).x;
        float B=texture2D(curl,vUv-vec2(0.,texel.y)).x,U=texture2D(curl,vUv+vec2(0.,texel.y)).x,C=texture2D(curl,vUv).x;
        vec2 f=.5*vec2(abs(U)-abs(B),abs(L)-abs(R));f/=length(f)+.0001;f*=16.*C;
        gl_FragColor=vec4(clamp(texture2D(velocity,vUv).xy+f*dt,-240.,240.),0.,1.);}`,{velocity:{value:null},curl:{value:this.curl.texture},texel:{value:this.texel},dt:{value:.014}});
      this.divergencePass=shader(`varying vec2 vUv;uniform sampler2D velocity;uniform vec2 texel;void main(){
        vec2 C=texture2D(velocity,vUv).xy;float L=texture2D(velocity,vUv-vec2(texel.x,0.)).x,R=texture2D(velocity,vUv+vec2(texel.x,0.)).x;
        float B=texture2D(velocity,vUv-vec2(0.,texel.y)).y,U=texture2D(velocity,vUv+vec2(0.,texel.y)).y;
        if(vUv.x<texel.x)L=-C.x;if(vUv.x>1.-texel.x)R=-C.x;if(vUv.y<texel.y)B=-C.y;if(vUv.y>1.-texel.y)U=-C.y;
        gl_FragColor=vec4(.5*(R-L+U-B),0.,0.,1.);}`,{velocity:{value:null},texel:{value:this.texel}});
      this.jacobi=shader(`varying vec2 vUv;uniform sampler2D pressure,divergence;uniform vec2 texel;void main(){
        float L=texture2D(pressure,vUv-vec2(texel.x,0.)).x,R=texture2D(pressure,vUv+vec2(texel.x,0.)).x;
        float B=texture2D(pressure,vUv-vec2(0.,texel.y)).x,U=texture2D(pressure,vUv+vec2(0.,texel.y)).x;
        gl_FragColor=vec4((L+R+B+U-texture2D(divergence,vUv).x)*.25,0.,0.,1.);}`,{pressure:{value:null},divergence:{value:this.divergence.texture},texel:{value:this.texel}});
      this.gradient=shader(`varying vec2 vUv;uniform sampler2D pressure,velocity;uniform vec2 texel;void main(){
        float L=texture2D(pressure,vUv-vec2(texel.x,0.)).x,R=texture2D(pressure,vUv+vec2(texel.x,0.)).x;
        float B=texture2D(pressure,vUv-vec2(0.,texel.y)).x,U=texture2D(pressure,vUv+vec2(0.,texel.y)).x;
        gl_FragColor=vec4(texture2D(velocity,vUv).xy-.5*vec2(R-L,U-B),0.,1.);}`,{pressure:{value:null},velocity:{value:null},texel:{value:this.texel}});
      this.shaders=[this.advection,this.splat,this.curlPass,this.vorticity,this.divergencePass,this.jacobi,this.gradient];
    }
    inject(x,y,dx,dy,strength=1){
      const u=this.splat.uniforms;u.point.value.set(x,y);u.aspect.value=width/height;
      u.radius.value=Math.pow(70/height,2);u.force.value.set(clamp(dx*1900,-180,180),clamp(dy*1900,-180,180),0);u.source.value=this.velocity.read.texture;
      pass(this.splat,this.velocity.write);this.velocity.swap();
      u.force.value.set(strength,0,0);u.source.value=this.dye.read.texture;pass(this.splat,this.dye.write);this.dye.swap();
    }
    step(dt){
      const a=this.advection.uniforms;a.dt.value=dt;a.velocity.value=this.velocity.read.texture;a.source.value=this.velocity.read.texture;a.decay.value=Math.pow(.988,dt*60);
      pass(this.advection,this.velocity.write);this.velocity.swap();
      this.curlPass.uniforms.velocity.value=this.velocity.read.texture;pass(this.curlPass,this.curl);
      this.vorticity.uniforms.velocity.value=this.velocity.read.texture;this.vorticity.uniforms.dt.value=dt;pass(this.vorticity,this.velocity.write);this.velocity.swap();
      this.divergencePass.uniforms.velocity.value=this.velocity.read.texture;pass(this.divergencePass,this.divergence);
      clear(this.pressure.read);
      for(let i=0;i<4;i++){this.jacobi.uniforms.pressure.value=this.pressure.read.texture;pass(this.jacobi,this.pressure.write);this.pressure.swap();}
      this.gradient.uniforms.pressure.value=this.pressure.read.texture;this.gradient.uniforms.velocity.value=this.velocity.read.texture;pass(this.gradient,this.velocity.write);this.velocity.swap();
      a.velocity.value=this.velocity.read.texture;a.source.value=this.dye.read.texture;a.decay.value=Math.pow(.96,dt*60);pass(this.advection,this.dye.write);this.dye.swap();
    }
    dispose(){this.all.forEach(rt=>{rt.dispose();targets.delete(rt);});this.shaders.forEach(m=>{m.dispose();materials.delete(m);});}
  }

  const world=new T.Scene(), camera=new T.PerspectiveCamera(32,1,.1,30);
  camera.position.set(0,0,6.8);camera.lookAt(0,0,0);
  const sculpture=new T.Group();world.add(sculpture);
  const metalUniform={value:0}, wireUniform={value:0}, timeUniform={value:0};
  const metal=ownMaterial(new T.MeshPhysicalMaterial({color:0xffffff,metalness:1,roughness:.17,clearcoat:mobileGpu?0:1,clearcoatRoughness:.12,side:T.DoubleSide,envMapIntensity:1.45}));
  metal.onBeforeCompile=shader=>{
    shader.uniforms.uFinish=metalUniform;
    shader.vertexShader='varying vec3 vSpecimen;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <morphtarget_vertex>','#include <morphtarget_vertex>\nvSpecimen=(modelMatrix*vec4(transformed,1.)).xyz;');
    shader.fragmentShader='uniform float uFinish; varying vec3 vSpecimen;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );',`vec4 diffuseColor = vec4( diffuse, opacity );
      float edge=uFinish*4.6-2.3;float boundary=vSpecimen.y+sin(vSpecimen.x*3.14159)*sin(uFinish*3.14159)*.1;
      float silver=smoothstep(edge-.16,edge+.16,boundary);diffuseColor.rgb*=mix(vec3(.82,.39,.12),vec3(.78,.91,.87),silver);`);
  };
  metal.customProgramCacheKey=()=> 'botanical-metal-sweep-morph-v2';
  const wireMaterial=ownMaterial(new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uTime:timeUniform,uAlpha:wireUniform},vertexShader:'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 vP;uniform float uTime,uAlpha;void main(){float scan=pow(fract(-vP.y*10.-uTime*.4),4.);gl_FragColor=vec4(.61,.94,.79,uAlpha*(.12+scan*.75));}'}));
  function petalPoint(u,v){
    const r=.10+1.42*u, w=Math.pow(Math.max(.0001,Math.sin(Math.PI*u)),.68)*.61;
    return new T.Vector3(r,v*w,.07+.45*Math.sin(Math.PI*u)-.18*u+.36*v*v*Math.sin(Math.PI*u)+.018*Math.sin(v*23+u*7)*Math.sin(Math.PI*u));
  }
  function petalGeometry(){
    const rows=mobileGpu?36:56,cols=mobileGpu?16:24,positions=[],closedPositions=[],indices=[],count=(rows+1)*(cols+1);
    for(let side=0;side<2;side++)for(let i=0;i<=rows;i++)for(let j=0;j<=cols;j++){
      const u=i/rows,v=j/cols*2-1,p=petalPoint(u,v),wave=Math.max(.0001,Math.sin(Math.PI*u));
      positions.push(p.x,p.y,p.z-side*.026);
      const radius=.10+Math.pow(wave,.85)*.36-u*.075;
      closedPositions.push(radius,v*radius*.74*Math.pow(wave,.5),.07+u*1.45-side*.026);
    }
    for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){
      const a=i*(cols+1)+j,b=a+cols+1;indices.push(a,b,a+1,b,b+1,a+1);
      indices.push(a+count,a+1+count,b+count,b+count,a+1+count,b+1+count);
    }
    const edge=(a,b)=>indices.push(a,a+count,b,b,a+count,b+count);
    for(let i=0;i<rows;i++){edge(i*(cols+1),(i+1)*(cols+1));edge((i+1)*(cols+1)+cols,i*(cols+1)+cols);}
    for(let j=0;j<cols;j++){edge(j+1,j);edge(rows*(cols+1)+j,rows*(cols+1)+j+1);}
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();
    const closed=ownGeometry(new T.BufferGeometry());closed.setAttribute('position',new T.Float32BufferAttribute(closedPositions,3));closed.setIndex(indices);closed.computeVertexNormals();
    geo.morphAttributes.position=[closed.attributes.position];geo.morphAttributes.normal=[closed.attributes.normal];
    return ownGeometry(geo);
  }
  const petalGeo=petalGeometry(), wireGeo=ownGeometry(new T.WireframeGeometry(petalGeo));
  const petals=[];
  for(let layer=0;layer<2;layer++)for(let i=0;i<5;i++){
    // Keep the local petal hinge independent of its radial orientation.
    const radial=new T.Group(), hinge=new T.Group();radial.rotation.z=(i/5)*Math.PI*2+Math.PI/2+layer*.57;
    radial.position.set(0,.25,layer*.18);radial.scale.setScalar(layer===0?1:.64);
    const mesh=new T.Mesh(petalGeo,metal),wire=new T.LineSegments(wireGeo,wireMaterial);
    hinge.add(mesh,wire);radial.add(hinge);sculpture.add(radial);petals.push({hinge,mesh,wire,layer,index:i});
  }
  const heart=new T.Group();heart.position.y=.25;sculpture.add(heart);
  const calyx=new T.Mesh(ownGeometry(new T.SphereGeometry(.15,24,16)),metal);calyx.position.set(0,.25,.02);calyx.scale.z=.85;sculpture.add(calyx);
  const core=new T.Mesh(ownGeometry(new T.SphereGeometry(.24,40,24)),metal);core.position.set(0,0,.25);core.scale.set(1,1,.65);heart.add(core);
  const beadGeo=ownGeometry(new T.SphereGeometry(.044,12,8));
  const beads=new T.InstancedMesh(beadGeo,metal,24), matrix=new T.Matrix4();
  for(let i=0;i<24;i++){
    const a=i/24*Math.PI*2,r=.20+(i%3)*.04, tip=new T.Vector3(Math.cos(a)*r,.25+Math.sin(a)*r,.55+(i%4)*.035);
    tip.y-=.25;matrix.makeTranslation(tip.x,tip.y,tip.z);beads.setMatrixAt(i,matrix);
    const curve=new T.QuadraticBezierCurve3(new T.Vector3(Math.cos(a)*.11,Math.sin(a)*.11,.27),new T.Vector3(tip.x*.7,tip.y*.7,.65),tip);
    heart.add(new T.Mesh(ownGeometry(new T.TubeGeometry(curve,12,.012,5,false)),metal));
  }heart.add(beads);
  const stemPath=new T.CatmullRomCurve3([new T.Vector3(0,.18,-.08),new T.Vector3(-.1,-.5,-.18),new T.Vector3(.1,-1.15,-.12),new T.Vector3(-.25,-1.85,-.03)]);
  sculpture.add(new T.Mesh(ownGeometry(new T.TubeGeometry(stemPath,70,.038,9,false)),metal));
  const leaf=new T.Mesh(petalGeo,metal);leaf.position.set(0,-1.05,-.15);leaf.rotation.set(.35,.35,-.2);leaf.scale.set(.52,.28,.5);sculpture.add(leaf);
  const key=new T.DirectionalLight(0xe7f8ed,4);key.position.set(-3,5,4);world.add(key);
  const rim=new T.DirectionalLight(0x99d8df,3);rim.position.set(4,1,-3);world.add(rim);
  world.add(new T.AmbientLight(0xbfcac3,.4));

  // Procedural studio lighting: PMREM is generated locally, no HDRI download.
  const studio=new T.Scene();studio.background=new T.Color(.065,.085,.09);
  function softbox(x,y,z,w,h,color,intensity){
    const m=ownMaterial(new T.MeshBasicMaterial({color:new T.Color(color).multiplyScalar(intensity),side:T.DoubleSide}));
    const plane=new T.Mesh(ownGeometry(new T.PlaneGeometry(w,h)),m);plane.position.set(x,y,z);plane.lookAt(0,0,0);studio.add(plane);
  }
  softbox(-5,3,3,4,9,0xeaf9ef,5);softbox(5,1,2,2,8,0xb0e2e8,7);softbox(0,6,-1,6,4,0xffe5ba,4);softbox(0,1,-6,3,8,0xc8dfd2,3);
  pmrem=new T.PMREMGenerator(renderer);environmentTarget=pmrem.fromScene(studio,.03,.1,30,{size:128});world.environment=environmentTarget.texture;

  const placeholder=new T.DataTexture(new Uint8Array([200,200,180,255]),1,1);placeholder.needsUpdate=true;photoTexture=placeholder;
  const uniforms={uModel:{value:null},uDye:{value:null},uPhoto:{value:photoTexture},uResolution:{value:new T.Vector2(1,1)},uCenter:{value:new T.Vector2(.66,.50)},uSize:{value:new T.Vector2(.6,.9)},uTime:{value:0},uReveal:{value:0},uScroll:{value:0},uFinish:{value:0},uPhotoReady:{value:0},uPointer:{value:new T.Vector2(.5,.5)},uHeroBounds:{value:new T.Vector2(0,1)},uTravel:{value:0},uTravelAlpha:{value:1}};
  compositor=shader(`
    varying vec2 vUv;uniform sampler2D uModel,uDye,uPhoto;uniform vec2 uResolution,uCenter,uSize,uPointer,uHeroBounds;uniform float uTime,uReveal,uScroll,uFinish,uPhotoReady,uTravel,uTravelAlpha;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
    float fbm(vec2 p){return noise(p)*.57+noise(p*2.03+8.)*.28+noise(p*4.01+17.)*.15;}
    vec3 film(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
    void main(){
      float aspect=uResolution.x/uResolution.y;vec2 uv=vUv,q=(uv-.5)*vec2(aspect,1.);
      float n=fbm(q*2.3+vec2(uTime*.035,uTime*.014)+fbm(q*1.7-uTime*.02)*.7);
      float contour=1.-smoothstep(.012,.04,abs(fract(n*6.)-.5));
      vec3 bg=mix(vec3(.020,.047,.055),vec3(.045,.078,.080),n);
      bg=mix(bg,bg*vec3(1.3,.91,.70),uFinish*.65);bg+=contour*.014;
      float halo=exp(-length((uv-uCenter)*vec2(aspect,1.))*3.5);bg+=vec3(.023,.044,.039)*halo;
      vec2 p=(uv-uCenter)/uSize+.5;float box=step(0.,p.x)*step(p.x,1.)*step(0.,p.y)*step(p.y,1.);
      vec2 photoUv=(p-.5)*vec2(1.05,.83)+.5;vec3 photograph=texture2D(uPhoto,photoUv).rgb;
      float luma=dot(photograph,vec3(.299,.587,.114));float silhouette=(1.-smoothstep(.43,.72,luma))*box*uPhotoReady;
      silhouette*=smoothstep(.01,.05,p.x)*smoothstep(.01,.05,p.y)*smoothstep(.01,.05,1.-p.x)*smoothstep(.01,.05,1.-p.y);
      vec3 ink=mix(vec3(.14,.22,.22),vec3(.66,.76,.65),clamp((.7-luma)*1.9,0.,1.));
      vec3 base=mix(bg,ink,silhouette*.92);
      vec4 model=texture2D(uModel,clamp(p,0.,1.));model.a*=box;
      vec3 objectColor=pow(film(max(vec3(0.),model.rgb)),vec3(1./2.2));
      vec3 sculpted=mix(bg,objectColor,model.a);
      float dye=texture2D(uDye,uv).r;float fluid=smoothstep(.09,.62,dye);
      float boundary=uv.y+sin(uv.x*3.14159)*sin(uReveal*3.14159)*.2;
      float wipe=1.-smoothstep(uReveal*1.4-.23,uReveal*1.4-.17,boundary);
      float reveal=max(fluid,max(wipe,smoothstep(.05,.42,uScroll)));
      vec3 color=mix(base,sculpted,reveal);
      float edge=smoothstep(.06,.18,dye)*(1.-smoothstep(.18,.5,dye))*(1.-wipe)*(1.-smoothstep(.03,.4,uScroll));
      color+=edge*vec3(.03,.11,.085);
      float vignette=1.-smoothstep(.2,1.3,length(q));color*=.73+.27*vignette;
      color+=(hash(gl_FragCoord.xy+floor(uTime*24.))-.5)*.006;
      float heroRegion=step(uHeroBounds.x,1.-uv.y)*step(1.-uv.y,uHeroBounds.y);
      if(uTravel>.5){
        float objectAlpha=model.a*uTravelAlpha;
        gl_FragColor=vec4(color,max(heroRegion,objectAlpha));
      }else gl_FragColor=vec4(color,heroRegion);
    }`,uniforms);

  function resize(){
    if(disposed)return;
    fluidGesture?.cancel();
    width=canvas.clientWidth;height=canvas.clientHeight;stageHeight=stage.clientHeight;
    // Reserve actual space for the heading and controls rather than placing
    // a fixed-size model underneath them on short/narrow screens.
    const safeTop=intro.offsetTop+intro.offsetHeight+14, safeBottom=bloomPanel.offsetTop-12;
    mobileCenterY=1-(safeTop+safeBottom)*.5/stageHeight;
    mobileSize=Math.min(width*1.18,Math.max(160,safeBottom-safeTop)/.92);
    touchSurface.style.top=`${safeTop}px`;touchSurface.style.height=`${Math.max(0,safeBottom-safeTop)}px`;
    host.dataset.modelSize=mobileSize.toFixed(1);
    const description=host.querySelector('.living-description');
    description.firstChild.textContent=width<=700?'Проведите пальцем по цветку.':'Проведите по цветку.';
    const mobile=width<=768, dpr=Math.min(devicePixelRatio||1,mobileGpu?1:1.5);
    renderer.setPixelRatio(dpr);renderer.setSize(width,height,false);uniforms.uResolution.value.set(width,height);
    const sw=Math.max(64,Math.round(Math.min(width*.1,192))),sh=Math.max(64,Math.round(sw*height/width));
    if(!simulation||simulation.w!==sw||simulation.h!==sh){simulation?.dispose();simulation=new Fluid(sw,sh);}
    const size=mobileGpu?512:1024;
    if(!modelTarget){modelTarget=target(size,size,{depth:true});}else modelTarget.setSize(size,size);
    uniforms.uModel.value=modelTarget.texture;uniforms.uDye.value=simulation.dye.read.texture;
    host.dataset.fluidGrid=`${sw}x${sh}`;host.dataset.pixelRatio=String(dpr);host.dataset.modelTarget=String(size);host.dataset.viewportHeight=String(height);
    measureJourney();measureScroll();drawOnce();
  }
  function measureJourney(){
    const rect=journey.getBoundingClientRect();travel.top=rect.top+scrollY;travel.height=journey.offsetHeight;
    travel.anchors=anchors.map(anchor=>{const box=anchor.getBoundingClientRect();return {x:box.left+box.width/2-rect.left,y:box.top+box.height/2-rect.top,width:box.width};});
    journey.dataset.pathStart=travel.top.toFixed(1);journey.dataset.pathEnd=(travel.top+travel.height-height).toFixed(1);
  }
  function measureScroll(){
    const rect=host.getBoundingClientRect(), stageRect=stage.getBoundingClientRect();heroStageTop=stageRect.top;
    const interfaceOpacity=1-clamp(-stageRect.top/(height*.45));
    heroInterface.forEach(element=>{element.style.opacity=String(interfaceOpacity);element.inert=interfaceOpacity===0;});
    scrollProgress=reduced()?0:clamp(-rect.top/Math.max(1,host.offsetHeight-stage.offsetHeight));
    const heroTop=Math.max(0,rect.top,stageRect.top)/height, heroBottom=Math.min(height,rect.bottom,stageRect.bottom)/height;
    uniforms.uHeroBounds.value.set(heroTop,Math.max(heroTop-.001,heroBottom));
    const localScroll=scrollY-travel.top;travel.bottom=travel.top+travel.height-scrollY;
    travel.p=clamp(localScroll/Math.max(1,travel.height-height));travel.bridge=clamp((localScroll+height)/height);
    travel.active=!!Path&&!reduced()&&localScroll>=-height&&travel.bottom>0;
    // Anchor jumps may leave the world before the next RAF / IO callback.
    // Hide the last framebuffer immediately so it cannot cover later sections.
    canvas.style.visibility=(heroBottom>heroTop||travel.active)?'visible':'hidden';
    if(travel.active)bloomTimeline?.pause();
    else if(!paused&&!reduced()&&inView&&!document.hidden)bloomTimeline?.resume();
    journey.dataset.progress=travel.p.toFixed(4);journey.dataset.bridge=travel.bridge.toFixed(4);
    meter.style.transform=`scaleX(${travel.p})`;percentage.textContent=`${Math.round(travel.p*100)}%`;
    canvas.dataset.scene=travel.active?'journey':'hero';
    host.dataset.scrollProgress=scrollProgress.toFixed(3);
    const p=scrollProgress, fade=1-clamp(p/.33);
    intro.style.opacity=String(fade);intro.style.transform=`translateY(${-p*120}px)`;
    const visible=clamp((p-.4)/.25);after.style.opacity=String(visible);after.style.transform=`translateY(${(1-visible)*30}px)`;after.setAttribute('aria-hidden',String(visible<.5));
    rule.style.transform=`scaleX(${p})`;
    touchSurface.hidden=width>700||reduced()||paused||travel.active||p>.35;
    if(touchSurface.hidden)fluidGesture?.cancel();
    if(paused||reduced())drawOnce();
  }
  function setReveal(){
    const value=locked||hovering?1:0;
    if(g&&!reduced()&&!paused)g.to(state,{reveal:value,duration:value?1.5:1,ease:'expo.inOut',overwrite:'auto',onUpdate:drawOnce});
    else{state.reveal=value;drawOnce();}
    revealButton.setAttribute('aria-pressed',String(locked));host.querySelector('.living-reveal-label').textContent=locked?'Вернуть фотографию':'Проявить цветок';
  }
  function syncBloom(){
    const value=Math.round(clamp(state.bloom)*100);
    bloomRange.value=String(value);bloomValue.textContent=`${value}%`;
    bloomRange.setAttribute('aria-valuetext',value===0?'Закрытый бутон':value===100?'Цветок раскрыт полностью':`Раскрытие цветка ${value}%`);
    bloomRange.style.setProperty('--bloom-fill',`${value}%`);host.dataset.bloom=state.bloom.toFixed(3);
    drawOnce();
  }
  function stopBloom(){
    bloomTimeline?.kill();bloomTimeline=null;g?.killTweensOf(state,'bloom');
    bloomPlay.removeAttribute('aria-busy');bloomPlay.querySelector('span').textContent='↻';
  }
  function showSculpture(immediate=false){
    if(locked&&!immediate)return;locked=true;hovering=false;setReveal();
    g?.killTweensOf(state,'reveal');
    if(immediate||!g||reduced()||paused){state.reveal=1;drawOnce();}
    else g.to(state,{reveal:1,duration:.35,ease:'power2.out',overwrite:'auto',onUpdate:drawOnce});
  }
  // A native slider remains interruptible at every point of the choreography.
  bloomRange.addEventListener('input',()=>{if(disposed)return;stopBloom();state.bloom=Number(bloomRange.value)/100;showSculpture(true);syncBloom();});
  bloomPlay.addEventListener('click',event=>{
    if(disposed)return;stopBloom();showSculpture(Input.keyboard(event));
    if(!g||reduced()||paused||Input.keyboard(event)){state.bloom=1;syncBloom();return;}
    bloomPlay.setAttribute('aria-busy','true');bloomPlay.querySelector('span').textContent='✳';
    bloomTimeline=g.timeline({onUpdate:syncBloom,onComplete:stopBloom});
    bloomTimeline.to(state,{bloom:0,duration:.9,ease:'power2.inOut'})
      .to(state,{bloom:1,duration:2.6,ease:'sine.inOut'},'+=.18');
  });
  function inputPoint(clientX,clientY,kind){
    if(disposed||reduced()||paused||travel.active)return;
    const rect=canvas.getBoundingClientRect(),x=clamp((clientX-rect.left)/width),y=clamp(1-(clientY-rect.top)/height);
    pointer.x=x*2-1;pointer.y=y*2-1;
    pendingInput={x,y,kind};lastInput=performance.now();firstInput=true;idlePointer=null;
  }
  // Touch Events are delivered directly on iOS. They do not rely on the
  // compatibility mouse stream or transfer of implicit pointer capture.
  const fluidCallbacks={
    onStart:({x,y,kind})=>{lastPointer=null;pointerEnded=false;host.dataset.touchActive='true';inputPoint(x,y,kind);},
    onMove:({x,y,kind})=>inputPoint(x,y,kind),
    onEnd:()=>{pointerEnded=true;host.dataset.touchActive='false';}
  };
  const fluidGestures=[
    Input.bindDrag(touchSurface,{...fluidCallbacks,axis:'both',enabled:()=>!touchSurface.hidden&&!paused&&!reduced()}),
    // In a wide/landscape layout, horizontal strokes stir the flower and
    // vertical gestures continue scrolling. Buttons/range never join a drag.
    Input.bindDrag(stage,{...fluidCallbacks,axis:'x',enabled:event=>event.type==='touchstart'&&width>700&&scrollProgress<.35&&!paused&&!reduced()&&!event.target.closest('.living-controls,.living-bloom,a,button')})
  ];
  fluidGesture={cancel:()=>fluidGestures.forEach(gesture=>gesture.cancel()),destroy:()=>fluidGestures.forEach(gesture=>gesture.destroy())};
  stage.addEventListener('pointermove',event=>{
    if(event.pointerType==='touch'||event.target.closest('.living-touch-surface,.living-controls,.living-bloom,a,button'))return;
    inputPoint(event.clientX,event.clientY,'pointer');
  },{passive:true,signal:inputEvents.signal});
  stage.addEventListener('pointerleave',()=>{lastPointer=null;},{signal:inputEvents.signal});
  revealButton.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse'){hovering=true;setReveal();}});
  revealButton.addEventListener('pointerleave',()=>{hovering=false;setReveal();});
  revealButton.addEventListener('click',event=>{locked=!locked;hovering=false;if(Input.keyboard(event)&&g){g.killTweensOf(state,'reveal');state.reveal=locked?1:0;}setReveal();});
  finishButton.addEventListener('click',event=>{
    bronze=!bronze;finishButton.setAttribute('aria-pressed',String(bronze));
    if(g&&!reduced()&&!paused&&!Input.keyboard(event))g.to(state,{finish:bronze?1:0,duration:2,ease:'expo.inOut',overwrite:'auto',onUpdate:drawOnce});
    else{state.finish=bronze?1:0;drawOnce();}
  });
  pauseButton.addEventListener('click',()=>{
    paused=!paused;touchSurface.hidden=paused||width>700||reduced()||travel.active||scrollProgress>.35;if(paused)fluidGesture.cancel();pauseButton.setAttribute('aria-pressed',String(paused));pauseButton.setAttribute('aria-label',paused?'Продолжить движение цветка':'Остановить движение цветка');pauseButton.textContent=paused?'▷':'Ⅱ';
    if(paused){cancelAnimationFrame(raf);raf=0;stopBloom();g?.killTweensOf(state);state.reveal=locked?1:0;state.finish=bronze?1:0;syncBloom();drawOnce();}else{lastTime=0;start();}
  });
  function updateScene(dt,animate){
    // Splat at most once per rendered frame. A fast finger must not issue GPU
    // passes from every 120Hz input callback and starve control activation.
    if(pendingInput&&animate){
      const {x,y,kind}=pendingInput;pendingInput=null;
      simulation.inject(x,y,lastPointer?x-lastPointer.x:0,lastPointer?y-lastPointer.y:0,1.5);
      lastPointer=pointerEnded?null:{x,y};pointerEnded=false;
      host.dataset.input=kind;host.dataset.inputSamples=String(++inputSamples);
    }
    const p=scrollProgress,mobile=width<=700;
    const centerX=mobile?.54:.68,centerY=mobile?mobileCenterY:.52;
    const heroX=T.MathUtils.lerp(centerX,mobile?.61:.68,p)*width;
    const heroY=heroStageTop+(1-T.MathUtils.lerp(centerY,.5,p))*stageHeight;
    uniforms.uCenter.value.set(heroX/width,1-heroY/height);
    let size=(mobile?mobileSize:Math.min(stageHeight*.94,width*.72))*(1-p*.32);
    uniforms.uSize.value.set(size/width,size/height);
    const follow=animate?1-Math.exp(-dt*1.519):1;
    pointer.easeX+=(pointer.x-pointer.easeX)*follow;pointer.easeY+=(pointer.y-pointer.easeY)*follow;
    let bloom=state.bloom,finish=state.finish;
    let rx=.12-(1-bloom)*.84+(width<=768?0:-pointer.easeY*.075)*(1-p)+p*.25;
    let ry=(1-bloom)*.25+(width<=768?0:pointer.easeX*.15)+p*Math.PI*1.35;
    let rz=-.12+Math.sin(clock*.35)*.025;
    if(travel.active&&travel.anchors.length===3){
      const t=travel.p,b=travel.bridge*travel.bridge*(3-2*travel.bridge),a=travel.anchors[0];
      const pose=Path.at(t,travel.anchors);
      let x=pose.x,y=travel.top+pose.y-scrollY;
      if(scrollY<travel.top){
        x=Path.lerp((mobile?.61:.68)*width,a.x,b);y=Path.lerp(stageHeight*.5,a.y,b);
        const heroEnd=(mobile?mobileSize:Math.min(stageHeight*.94,width*.72))*.68;
        size=Path.lerp(heroEnd,a.width,b);
      }else size=pose.width;
      uniforms.uCenter.value.set(x/width,1-y/height);uniforms.uSize.value.set(size/width,size/height);
      const unfold=clamp((t-.08)/.68),warm=clamp((t-.55)/.4);
      bloom=scrollY<travel.top?Path.lerp(state.bloom,0,b):unfold*unfold*(3-2*unfold);
      finish=scrollY<travel.top?Path.lerp(state.finish,0,b):warm*warm*(3-2*warm);
      const turn=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
      const tilt=t<=.5?Path.lerp(Math.PI/12,-Math.PI/10,Math.pow(t*2,2)):Path.lerp(-Math.PI/10,Math.PI/20,1-Math.pow(1-(t-.5)*2,2));
      rx=Path.lerp(rx,tilt-(1-bloom)*.84,b);ry=Path.lerp(ry,Path.lerp(Math.PI/2.2-1.15,Math.PI*4,turn),b);rz=Path.lerp(rz,0,b);
      journey.dataset.modelX=x.toFixed(1);journey.dataset.modelY=y.toFixed(1);journey.dataset.modelSize=size.toFixed(1);journey.dataset.bloom=bloom.toFixed(3);journey.dataset.finish=finish.toFixed(3);
    }
    sculpture.rotation.set(rx,ry,rz);
    sculpture.position.y=Math.sin(clock*.5)*.025;
    petals.forEach(({hinge,mesh,wire,layer,index})=>{
      const progress=clamp((bloom-layer*.14-index*.018)/(1-layer*.14-index*.018));
      const open=progress*progress*(3-2*progress);
      const breath=(layer===0?1:-1)*.035*Math.sin(clock*.45+(layer*5+index)*.35)*open;
      mesh.morphTargetInfluences[0]=1-open;wire.visible=!mobileGpu&&open>.99;
      hinge.rotation.y=breath;
      hinge.rotation.x=(1-open)*.11*Math.sin(index*2.4);
    });
    heart.scale.setScalar(.5+.5*clamp((bloom-.18)/.82));
    metalUniform.value=finish;timeUniform.value=clock;wireUniform.value=(!travel.active&&!reduced()&&p<.45&&!locked)?.035:0;
    uniforms.uReveal.value=reduced()?1:state.reveal;uniforms.uScroll.value=p;uniforms.uFinish.value=finish;uniforms.uTime.value=clock;
    uniforms.uTravel.value=travel.active?1:0;uniforms.uTravelAlpha.value=clamp(travel.bottom/(height*.18));
    uniforms.uPointer.value.set(pointer.easeX*.5+.5,pointer.easeY*.5+.5);
    if(animate){
      const now=performance.now(),timeout=firstInput?2000:2500;
      if(!travel.active&&now-lastInput>timeout&&!locked&&!hovering&&p<.35){
        const t=((now-lastInput-timeout)/1000)%9.5;
        const progress=t<2.5?t/2.5:t<4?1:t<6.5?1-(t-4)/2.5:0;
        const x=uniforms.uCenter.value.x-Math.cos(progress*4*Math.PI)*uniforms.uSize.value.x*.27;
        const y=uniforms.uCenter.value.y+Math.cos(progress*Math.PI)*uniforms.uSize.value.y*.24;
        if(t<2.5||(t>=4&&t<6.5)){
          simulation.inject(x,y,idlePointer?(x-idlePointer.x):0,idlePointer?(y-idlePointer.y):0,.65);idlePointer={x,y};host.dataset.input='idle';
        }
      }
      if(!travel.active&&!locked&&state.reveal<.999&&p<.45)simulation.step(dt);
    }
    uniforms.uDye.value=simulation.dye.read.texture;
  }
  function render(animate,dt=.014){
    if(disposed||!simulation||!modelTarget)return;
    updateScene(dt,animate);renderer.setRenderTarget(modelTarget);renderer.clear();renderer.render(world,camera);pass(compositor,null);
    frames++;
    if(performance.now()-statTime>1000){host.dataset.frames=String(frames);host.dataset.reveal=state.reveal.toFixed(2);host.dataset.finish=state.finish.toFixed(2);statTime=performance.now();}
  }
  function drawOnce(){if(!disposed&&inView&&!document.hidden&&(paused||reduced()||!raf))render(false);}
  function tick(time){
    raf=0;if(disposed||paused||reduced()||!inView||document.hidden)return;
    if(mobileGpu&&lastTime&&time-lastTime<1000/30-.5){raf=requestAnimationFrame(tick);return;}
    if(document.body.classList.contains('modal-open')){lastTime=0;raf=requestAnimationFrame(tick);return;}
    const dt=lastTime?Math.min((time-lastTime)/1000,1/20):.014;lastTime=time;clock+=dt;
    render(true,dt);raf=requestAnimationFrame(tick);
  }
  function start(){if(!raf&&!disposed&&!paused&&!reduced()&&inView&&!document.hidden){if(!travel.active)bloomTimeline?.resume();lastTime=0;raf=requestAnimationFrame(tick);}}
  function preference(){
    journey.classList.toggle('is-enhanced',!!Path&&!reduced());
    if(reduced()){cancelAnimationFrame(raf);raf=0;stopBloom();g?.killTweensOf(state);state.finish=bronze?1:0;revealButton.disabled=true;pauseButton.disabled=true;}
    else{revealButton.disabled=false;pauseButton.disabled=false;setReveal();}
    syncBloom();resize();start();
  }
  const visibility=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{if(entry.target===host)heroNear=entry.isIntersecting;else journeyNear=entry.isIntersecting;});
    inView=heroNear||journeyNear;host.dataset.visible=String(heroNear);journey.dataset.visible=String(journeyNear);
    if(inView){drawOnce();start();}else{cancelAnimationFrame(raf);raf=0;bloomTimeline?.pause();}
  },{rootMargin:'150px 0px'});visibility.observe(host);visibility.observe(journey);
  const preferences=new MutationObserver(preference);preferences.observe(document.documentElement,{attributes:true,attributeFilter:['data-reduced']});
  systemReduced.addEventListener('change',preference);
  let scrollFrame=0;
  const onScroll=()=>{if(!scrollFrame)scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;measureScroll();});};
  const onResize=()=>{
    if(canvas.clientWidth===width&&canvas.clientHeight===height&&stage.clientHeight===stageHeight)return;
    clearTimeout(resizeTimer);resizeTimer=setTimeout(resize,120);
  };
  addEventListener('scroll',onScroll,{passive:true});addEventListener('resize',onResize);
  const onVisibility=()=>{if(document.hidden){fluidGesture.cancel();pendingInput=null;cancelAnimationFrame(raf);raf=0;bloomTimeline?.pause();}else start();};document.addEventListener('visibilitychange',onVisibility);
  function dispose(){
    if(disposed)return;fluidGesture?.destroy();inputEvents.abort();cancelAnimationFrame(scrollFrame);disposed=true;cancelAnimationFrame(raf);clearTimeout(resizeTimer);stopBloom();g?.killTweensOf(state);
    visibility.disconnect();preferences.disconnect();systemReduced.removeEventListener('change',preference);
    removeEventListener('scroll',onScroll);removeEventListener('resize',onResize);document.removeEventListener('visibilitychange',onVisibility);
    targets.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());geometries.forEach(geo=>geo.dispose());photoTexture.dispose();environmentTarget.dispose();pmrem.dispose();renderer.dispose();
  }
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();cancelAnimationFrame(raf);raf=0;fallback('3D-контекст остановлен. Фотографическая версия остаётся доступной.');dispose();});
  canvas.addEventListener('webglcontextrestored',()=>{status.textContent='Обновите страницу, чтобы снова открыть 3D-форму.';});
  addEventListener('pagehide',event=>{if(event.persisted){cancelAnimationFrame(raf);raf=0;bloomTimeline?.pause();}else dispose();});
  addEventListener('pageshow',event=>{if(event.persisted){resize();start();}});
  try{
    resize();host.dataset.renderer='webgl2';host.dataset.fluid='gpu-pressure';host.dataset.ready='true';host.querySelector('.living-fallback').setAttribute('aria-hidden','true');status.textContent='';
    new T.TextureLoader().load('assets/cobaea.jpg',loaded=>{if(disposed){loaded.dispose();return;}photoTexture.dispose();photoTexture=loaded;loaded.colorSpace=T.NoColorSpace;uniforms.uPhoto.value=loaded;uniforms.uPhotoReady.value=1;drawOnce();},undefined,()=>{state.reveal=1;locked=true;setReveal();});
    document.fonts?.ready.then(()=>{if(!disposed)resize();});
    preference();start();
  }catch(error){fallback('Фотографический режим: 3D-сцену не удалось запустить.');dispose();}
})();
