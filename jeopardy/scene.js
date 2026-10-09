import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {cash} from './game.js';

function surface(width,height){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const texture=new THREE.CanvasTexture(canvas);texture.flipY=false;texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;
  return {canvas,ctx:canvas.getContext('2d'),texture};
}
function wrappedText(ctx,text,x,y,width,height,font,size,color='#fff'){
  let lines;
  do{
    ctx.font=`${size}px "${font}"`;lines=[''];
    for(const word of String(text).toUpperCase().split(/\s+/)){
      const last=lines.length-1,test=lines[last]?lines[last]+' '+word:word;
      if(ctx.measureText(test).width>width&&lines[last])lines.push(word);else lines[last]=test;
    }
    if(lines.length*size*1.18<=height&&lines.every(l=>ctx.measureText(l).width<=width))break;
    size-=2;
  }while(size>10);
  ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';
  lines.forEach((line,i)=>ctx.fillText(line,x,y+(i-(lines.length-1)/2)*size*1.18,width));
}
export class JeopardyStudio{
  constructor(canvas){
    this.canvas=canvas;this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#02030b');
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.1;
    this.camera=new THREE.PerspectiveCamera(50,1,5,5000);
    this.controls=new OrbitControls(this.camera,canvas);this.controls.enabled=false;this.controls.enableDamping=true;
    this.controls.minDistance=50;this.controls.maxDistance=2500;this.controls.target.set(-200,170,80);
    this.board=surface(1440,1040);this.podiums=surface(1024,512);this.auto=true;this.view='show';
    this.scene.add(new THREE.HemisphereLight(0xdde6ff,0x352b23,1.3));
    const key=new THREE.DirectionalLight(0xffebd9,2.2);key.position.set(-300,650,450);this.scene.add(key);
    const fill=new THREE.DirectionalLight(0xc5dcff,.9);fill.position.set(300,300,-200);this.scene.add(fill);
    // Preserve dark-map UV channels rather than substitute real-time shadows
    // for the retail light-linking system.
    window.addEventListener('resize',()=>{this.resize();if(this.data&&!this.controls.enabled)this.cut(this.view);});this.resize();
    this.lastFrame=performance.now();
    this.renderer.setAnimationLoop(()=>{
      const now=performance.now(),dt=Math.min((now-this.lastFrame)/1000,.1);this.lastFrame=now;
      if(!document.hidden&&!this.paused)this.animateCamera(dt);
      if(this.controls.enabled)this.controls.update();this.renderer.render(this.scene,this.camera);
    });
  }
  async load(onProgress){
    this.data=await fetch('assets/scene.json').then(r=>{if(!r.ok)throw Error('Scene metadata unavailable');return r.json();});
    this.animations=(await fetch('assets/camera-animations.json').then(r=>{if(!r.ok)throw Error('Camera tracks unavailable');return r.json();})).animations;
    const gltf=await new GLTFLoader().loadAsync('assets/stage5.glb',p=>onProgress(p.total?p.loaded/p.total:0));
    this.root=gltf.scene;this.meshes=[];this.boardMeshes=[];const processed=new Set();
    this.root.traverse(object=>{
      if(object.isLight){object.visible=false;return;}
      if(!object.isMesh)return;
      this.meshes.push(object);const materials=Array.isArray(object.material)?object.material:[object.material];
      if(/^tileboard_(?:frame_)?categoryShape[1-6]$/.test(object.name)){object.visible=false;return;}
      for(const material of materials){
        if(processed.has(material))continue;processed.add(material);
        const source=material.userData;
        if(source.nif_ambient_eligible&&source.nif_ambient_animation){
          const key=source.nif_ambient_animation.keys[0];material.color.multiply(new THREE.Color(key[1],key[2],key[3]));
        }
        if(material.transparent)material.depthWrite=false;
      }
      const source=materials[0].userData;
      if(source.nif_base_texture==='tileboard.tga'){
        object.material=new THREE.MeshBasicMaterial({map:this.board.texture,toneMapped:false});this.boardMeshes.push(object);
      }
      if(source.nif_base_texture==='podiums.tga')object.material=new THREE.MeshBasicMaterial({map:this.podiums.texture,toneMapped:false});
    });
    this.scene.add(this.root);
    const load=path=>new THREE.ImageLoader().loadAsync('assets/presentation/'+path);
    [this.logo,this.doubleLogo,this.finalLogo,this.podiumFinalLogo,this.tileArt]=await Promise.all([
      load('tileboard/tileboard_i4.png'),load('tileboard/tileboard_i7.png'),load('tileboard/tileboard_ic.png'),load('podiums/podiums_i17.png'),load('tileboard/tile-bevel.svg')]);
    this.update(null);this.cut('show');
    this.canvas.addEventListener('pointerdown',event=>{this.down={x:event.clientX,y:event.clientY};});
    const pick=event=>{
      const rect=this.canvas.getBoundingClientRect(),ray=new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),this.camera);
      const hit=ray.intersectObjects(this.boardMeshes,false)[0];if(!hit?.uv||!this.state||this.state.phase!=='board')return null;
      const column=Math.floor(hit.uv.x*6),row=Math.floor((hit.uv.y*1040-140)/180);
      return column>=0&&column<6&&row>=0&&row<5?{column,row}:null;
    };
    this.canvas.addEventListener('pointermove',event=>{
      if(this.controls.enabled)return;const cell=pick(event);
      this.canvas.style.cursor=cell&&!this.state.board[cell.column].played[cell.row]?'pointer':'default';
    });
    this.canvas.addEventListener('pointerup',event=>{
      if(!this.down||Math.hypot(event.clientX-this.down.x,event.clientY-this.down.y)>5||this.controls.enabled)return;
      const cell=pick(event);if(cell)this.onSelect?.(cell.column,cell.row);
    });
  }
  resize(){
    const rect=this.canvas.parentElement.getBoundingClientRect();this.renderer.setSize(rect.width,rect.height,false);
    this.camera.aspect=rect.width/rect.height;this.camera.updateProjectionMatrix();
  }
  cut(view){
    this.motion=null;
    this.view=view;this.controls.enabled=view==='orbit';if(view==='orbit')return;
    const name={show:'cam_animation_intro_to_clueboard',board:'cam_clue_board',players:'cam_podiums_all_players_answering'}[view]??view;
    const source=this.data.cameras.find(c=>c.name===name);if(!source)return;
    this.camera.position.fromArray(source.position);this.camera.up.fromArray(source.up);
    this.camera.lookAt(this.camera.position.clone().add(new THREE.Vector3().fromArray(source.forward)));
    this.camera.fov=source.fov;this.camera.near=source.near;this.camera.far=source.far;
    // Recovered cameras target a landscape frame; preserve width on phones.
    if(this.camera.aspect<16/9)this.camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(source.fov/2))*(16/9)/this.camera.aspect));
    this.camera.updateProjectionMatrix();this.cameraName=name;
    this.controls.target.copy(this.camera.position).addScaledVector(new THREE.Vector3().fromArray(source.forward),700);
  }
  play(name,then=null,loop=false){
    const track=this.animations.find(a=>a.name===name);if(!track){if(then)this.cut(then);return false;}
    this.cut(name);this.motion={track,time:0,then,loop};this.animateCamera(0);return true;
  }
  animateCamera(dt){
    const motion=this.motion;if(!motion)return;
    motion.time+=dt;const {track}=motion;
    const t=motion.loop?motion.time%track.duration:Math.min(motion.time,track.duration);
    const index=Math.min(track.frames.length-2,Math.floor(t/track.duration*(track.frames.length-1))),a=track.frames[index],b=track.frames[index+1];
    const u=Math.max(0,Math.min(1,(t-a.time)/(b.time-a.time)));
    this.camera.position.fromArray(a.position).lerp(new THREE.Vector3().fromArray(b.position),u);
    const orientation=sample=>{
      const matrix=new THREE.Matrix4().lookAt(new THREE.Vector3(),new THREE.Vector3().fromArray(sample.forward),new THREE.Vector3().fromArray(sample.up));
      return new THREE.Quaternion().setFromRotationMatrix(matrix);
    };
    this.camera.quaternion.copy(orientation(a).slerp(orientation(b),u));
    if(!motion.loop&&motion.time>=track.duration){this.motion=null;if(motion.then)this.cut(motion.then);}
  }
  follow(state,event='update'){
    if(!this.auto)return;
    if(event==='start'){this.play('cam_animation_intro_to_clueboard','board');return;}
    if(event==='round'){this.play('cam_animation_DJeop_intro_to_players','board');return;}
    if(event==='final'){this.play('cam_animation_intro_clueboard_FinalJeop','players');return;}
    if(event==='board'&&state.phase==='board'){this.play('cam_animation_clue_board_0','board');return;}
    if(['answer','final-answer','wager','final-wager'].includes(state.phase)){this.play('cam_podiums_all_players_answering');}
    else if(state.phase==='finished')this.cut('show');else this.cut('board');
  }
  update(state,remaining=null,total=null){
    this.state=state;const {ctx,texture}=this.board;
    if(remaining===null){
    ctx.fillStyle='#020315';ctx.fillRect(0,0,1440,1040);
    if(!state)ctx.drawImage(this.logo,0,140,1440,900);
    else if(state.round===3){
      ctx.drawImage(this.finalLogo,0,140,1440,720);
      wrappedText(ctx,state.final?.category.name??'FINAL JEOPARDY!',720,950,1350,150,'Jeopardy Category',65);
    }else{
      state.board.forEach((category,column)=>{
        ctx.fillStyle='#070b90';ctx.fillRect(column*240+4,0,232,114);
        wrappedText(ctx,category.name,column*240+120,57,185,95,'Jeopardy Category',35);
        for(let row=0;row<5;row++){
          const x=column*240+4,y=140+row*180;
          ctx.drawImage(this.tileArt,x,y,232,176);
          if(!category.played[row]){
            ctx.font='90px "Jeopardy Score"';ctx.fillStyle='#e8b14c';ctx.textAlign='center';ctx.textBaseline='middle';
            ctx.shadowColor='#000';ctx.shadowOffsetX=3;ctx.shadowOffsetY=5;ctx.fillText(cash((row+1)*200*state.round),x+116,y+88,198);ctx.shadowOffsetX=ctx.shadowOffsetY=0;
          }
          if(this.cursor&&this.cursor.column===column&&this.cursor.row===row){ctx.strokeStyle='#ffdf70';ctx.lineWidth=7;ctx.strokeRect(x+4,y+4,224,168);}
        }
      });
      if(state.phase==='wager')ctx.drawImage(this.doubleLogo,0,140,1440,900);
    }
    texture.needsUpdate=true;
    }
    const p=this.podiums.ctx;p.fillStyle='#030948';p.fillRect(0,0,1024,512);
    for(let slot=0;slot<3;slot++){
      const player=state?.players.find(player=>player.slot===slot),x=slot*341;
      p.fillStyle='#071090';p.fillRect(x,48,341,455);
      if(state?.round===3)p.drawImage(this.podiumFinalLogo,x+15,225,311,155);
      if(!player)continue;
      p.textAlign='center';p.textBaseline='middle';p.font='92px "Jeopardy Podium"';p.fillStyle=player.score<0?'#ff3535':'#fff';p.fillText(cash(player.score),x+170,102,320);
      p.font='60px "Jeopardy Name"';p.fillStyle='#fff';p.fillText(player.name,x+170,365,295);
      const selected=['answer','final-answer'].includes(state.phase)&&state.players[state.turn].slot===slot;
      if(selected){
        p.fillStyle='#f53622';p.fillRect(x+52,27,242,6);
        const count=remaining===null?5:Math.ceil(5*remaining/total);
        for(let i=0;i<count;i++){p.fillRect(x+i*37,4,33,9);p.fillRect(x+170+(4-i)*34,4,30,9);}
      }
    }
    this.podiums.texture.needsUpdate=true;
  }
}
