/* Original procedural botanical studies. Shared metal, camera and renderer. */
(() => {
  'use strict';
  function create({T,metal,ownGeometry,mobile}){
    const geometry=ownGeometry,fern=new T.Group(),poppy=new T.Group();
    const fronds=[{x:-.65,y:.42,r:.46,base:-.42},{x:.02,y:.98,r:.59,base:0},{x:.62,y:.37,r:.40,base:.36}];
    const bead=geometry(new T.SphereGeometry(1,mobile?7:9,mobile?5:7)),matrix=new T.Matrix4(),quaternion=new T.Quaternion();
    fronds.forEach((frond,index)=>{
      const {x,y,r,base}=frond,points=[new T.Vector3(base,-1.65,-.09),new T.Vector3(base*.8,-1.1,-.02),new T.Vector3(x+r*.85,y-.65,.03),new T.Vector3(x+r,y-.25,.03)];
      const turns=Math.PI*2.2,steps=mobile?56:84;
      for(let j=0;j<=steps;j++){
        const theta=j/steps*turns,radius=r*(1-.91*j/steps);
        points.push(new T.Vector3(x+Math.cos(theta)*radius,y+Math.sin(theta)*radius,.035+Math.sin(theta*.8+index)*.07));
      }
      const curve=new T.CatmullRomCurve3(points),tube=geometry(new T.TubeGeometry(curve,mobile?100:144,.044,mobile?6:8,false));
      fern.add(new T.Mesh(tube,metal));
      const n=mobile?24:36,scales=new T.InstancedMesh(bead,metal,n);
      for(let j=0;j<n;j++){
        const theta=j/Math.max(1,n-1)*turns,radius=r*(1-.91*j/Math.max(1,n-1));
        const position=new T.Vector3(x+Math.cos(theta)*(radius+.036),y+Math.sin(theta)*(radius+.036),.075+Math.sin(theta*.8+index)*.07);
        quaternion.setFromAxisAngle(new T.Vector3(0,0,1),theta-Math.PI*.5);
        matrix.compose(position,quaternion,new T.Vector3(.035,.072,.033));scales.setMatrixAt(j,matrix);
      }
      fern.add(scales);
    });
    const foot=new T.CatmullRomCurve3([new T.Vector3(-.24,-1.8,-.1),new T.Vector3(-.02,-1.45,-.12),new T.Vector3(.13,-1.12,-.14)]);
    fern.add(new T.Mesh(geometry(new T.TubeGeometry(foot,20,.075,7,false)),metal));

    const profile=[new T.Vector2(.055,-.25),new T.Vector2(.23,-.17),new T.Vector2(.46,.04),new T.Vector2(.60,.31),new T.Vector2(.64,.53),new T.Vector2(.59,.74),new T.Vector2(.48,.91),new T.Vector2(.40,1.00),new T.Vector2(.42,1.055)];
    poppy.add(new T.Mesh(geometry(new T.LatheGeometry(profile,mobile?36:56)),metal));
    const segments=mobile?72:120,rings=8,positions=[],uv=[],indices=[];
    for(let row=0;row<=rings;row++)for(let col=0;col<=segments;col++){
      const u=row/rings,a=col/segments*Math.PI*2,edge=.55+.045*Math.cos(a*12),radius=u*edge;
      positions.push(radius*Math.cos(a),1.065+.07*(1-u*u)+.014*Math.cos(a*12)*u*u,radius*Math.sin(a));uv.push(col/segments,u);
      if(row<rings&&col<segments){const i=row*(segments+1)+col,n=i+segments+1;indices.push(i,n,i+1,n,n+1,i+1);}
    }
    const disk=new T.BufferGeometry();disk.setAttribute('position',new T.Float32BufferAttribute(positions,3));disk.setAttribute('uv',new T.Float32BufferAttribute(uv,2));disk.setIndex(indices);disk.computeVertexNormals();
    poppy.add(new T.Mesh(geometry(disk),metal));
    const ribCurve=new T.CatmullRomCurve3(profile.slice(1).map(p=>new T.Vector3(p.x+.007,p.y,0)));
    const ribs=new T.InstancedMesh(geometry(new T.TubeGeometry(ribCurve,mobile?16:24,.015,5,false)),metal,12);
    const rayCurve=new T.CatmullRomCurve3([new T.Vector3(.07,1.133,0),new T.Vector3(.28,1.121,0),new T.Vector3(.54,1.079,0)]);
    const rays=new T.InstancedMesh(geometry(new T.TubeGeometry(rayCurve,12,.017,5,false)),metal,12);
    for(let i=0;i<12;i++){matrix.makeRotationY(i/12*Math.PI*2);ribs.setMatrixAt(i,matrix);rays.setMatrixAt(i,matrix);}poppy.add(ribs,rays);
    const stem=new T.CatmullRomCurve3([new T.Vector3(-.20,-1.78,.02),new T.Vector3(.09,-1.11,-.08),new T.Vector3(-.03,-.59,-.02),new T.Vector3(0,-.22,0)]);
    poppy.add(new T.Mesh(geometry(new T.TubeGeometry(stem,36,.046,8,false)),metal));
    for(const group of [fern,poppy]){
      group.updateMatrixWorld(true);const box=new T.Box3().setFromObject(group),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3()),scale=3.35/Math.max(size.x,size.y,size.z);
      group.scale.setScalar(scale);group.position.copy(center).multiplyScalar(-scale);group.updateMatrixWorld(true);
    }
    return {fern,poppy};
  }
  window.BotanicalModels=Object.freeze({create});
})();
