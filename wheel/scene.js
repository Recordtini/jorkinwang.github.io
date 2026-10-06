import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {Reflector} from 'three/addons/objects/Reflector.js';
import {money} from './game.js?v=20261006-cuts';
import {boardTransition,materialAlpha} from './presentation.js?v=20261006-cuts';

const SCALE = .01;
const colors = ['#e87555','#f4c94e','#65a1ef'];
function canvasTexture(width, height) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  return {canvas, context: canvas.getContext('2d'), texture};
}
function meshIslands(geometry){
  const count=geometry.getAttribute('position').count;
  const parents=Array.from({length:count},(_,i)=>i);
  const find=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
  const index=geometry.index?.array??Array.from({length:count},(_,i)=>i);
  for(let i=0;i<index.length;i+=3){const root=find(index[i]);parents[find(index[i+1])]=root;parents[find(index[i+2])]=root;}
  const groups=new Map();for(let i=0;i<count;i++){const root=find(i);if(!groups.has(root))groups.set(root,[]);groups.get(root).push(i);}
  return [...groups.values()];
}

export class Studio {
  constructor(canvas, onProgress) {
    this.canvas = canvas;
    this.onProgress = onProgress;
    this.renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: false});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#071323');
    this.scene.fog = new THREE.Fog('#071323', 38, 105);
    this.camera = new THREE.PerspectiveCamera(48, 1, .05, 180);
    this.camera.position.set(13, 5.4, 20);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(-1, 1.7, -1); this.controls.enabled = false;
    this.controls.enableDamping = true; this.controls.minDistance = 1.5; this.controls.maxDistance = 50;
    this.controls.maxPolarAngle = Math.PI * .49;
    this.loader = new GLTFLoader();
    this.models = new Map(); this.environment = null;
    this.scene.add(new THREE.HemisphereLight(0xc8dcff, 0x666454, 2.0));
    const key = new THREE.DirectionalLight(0xffeedb, 2.8); key.position.set(3,12,10);
    key.castShadow = true; key.shadow.mapSize.set(2048,2048);
    Object.assign(key.shadow.camera,{left:-18,right:18,top:18,bottom:-18,near:.1,far:40});
    key.shadow.bias = -.00025; key.shadow.normalBias = .035;
    this.scene.add(key); this.scene.add(key.target);
    const fill = new THREE.DirectionalLight(0x779bff,.9); fill.position.set(-8,6,2); this.scene.add(fill);
    this.boardCanvas = canvasTexture(1792, 512);
    this.wheelCanvas = canvasTexture(1024,1024);
    // The generated circle uses conventional UVs, unlike the source Flash meshes.
    this.wheelCanvas.texture.flipY = true;
    this.podiumCanvas = canvasTexture(1536,512);
    this.wheelGroup = new THREE.Group(); this.wheelGroup.position.set(6.012678, .97072, -.713909);
    this.scene.add(this.wheelGroup);
    this.wheelAngle = 0; this.view = 'show'; this.cameraTween = null; this.spinTween = null;
    this.lastTime = performance.now(); this.frameCount = 0;
    new ResizeObserver(()=>this.resize()).observe(canvas);
    this.resize();
    this.renderer.setAnimationLoop(time=>this.animate(time));
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();this.onProgress('Graphics paused. Reload the page to reopen the studio.',0);});
  }
  resize() {
    const width=this.canvas.clientWidth,height=this.canvas.clientHeight;
    this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();
    if(this.view==='source')this.setSourceCamera(this.sourceCamera);
    else if(this.boardBounds&&this.view!=='orbit')this.setView(this.view,true);
  }
  async load(url) {
    if (!this.models.has(url)) {
      const request = this.loader.loadAsync(url, event=>{
        if (event.total) this.onProgress('Loading original 3D models...',Math.round(event.loaded/event.total*90));
      });
      this.models.set(url,request);
      request.catch(()=>this.models.delete(url));
    }
    const gltf=await this.models.get(url);
    const root=gltf.scene.clone(true);root.scale.setScalar(SCALE);
    root.traverse(object=>{
      if(object.isLight) {object.visible=false;return;}
      if (!object.isMesh) return;
      // The rig is already baked into the source atlas. A second sun shadow
      // from it creates unrelated stripes on the backdrop and black floors.
      object.castShadow=/^(podium|wheel_|bonus_|letterboard|puzzleboard)/i.test(object.name)&&!/swf|glow|flare/i.test(object.name);
      object.receiveShadow=!/background|backdrop|ceiling|truss|light_/i.test(object.name);
      object.material=object.material.clone();
      const model=url.split('/').at(-1).replace('.glb','');
      const source=this.cameraCatalog?.materials[(model==='wof_base'?'':model+'/')+object.name];
      if(source){
        const alpha=materialAlpha(source),m=object.material;
        m.transparent=alpha.blend;m.depthWrite=!alpha.blend;m.opacity=1;
        m.alphaTest=0;
        if(alpha.blend){
          const factors=[THREE.OneFactor,THREE.ZeroFactor,THREE.SrcColorFactor,THREE.OneMinusSrcColorFactor,THREE.DstColorFactor,THREE.OneMinusDstColorFactor,THREE.SrcAlphaFactor,THREE.OneMinusSrcAlphaFactor,THREE.DstAlphaFactor,THREE.OneMinusDstAlphaFactor,THREE.SrcAlphaSaturateFactor];
          m.blending=THREE.CustomBlending;m.blendSrc=factors[alpha.src]??THREE.OneFactor;m.blendDst=factors[alpha.dst]??THREE.OneFactor;
        }
        if(alpha.test){
          const comparisons=['false','diffuseColor.a >= T','abs(diffuseColor.a-T) > 0.001','diffuseColor.a > T','diffuseColor.a <= T','abs(diffuseColor.a-T) < 0.001','diffuseColor.a < T','true'];
          m.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',`if (${comparisons[alpha.func].replaceAll('T',alpha.threshold.toFixed(6))}) discard;`);};
          m.customProgramCacheKey=()=>`nif-alpha-${alpha.func}-${alpha.threshold}`;
        }
      }
      object.material.roughness=Math.min(object.material.roughness??.7,.78);
      object.material.metalness=Math.min(object.material.metalness??0,.25);
      if(/reflect.*floor|floor.*reflect/i.test(object.name))object.material.aoMapIntensity=.25;
      if(object.material.map) object.material.map.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());
      if(/glow|flare/i.test(object.name)) {object.material.depthWrite=false;object.castShadow=false;}
    });
    return root;
  }
  async initialize(manifest) {
    this.manifest=manifest;
    this.cameraCatalog=await fetch('assets/presentation/cameras.json').then(r=>{if(!r.ok)throw new Error('Original camera data could not load');return r.json();});
    const response=await fetch('assets/presentation/presentation.json');
    if(!response.ok)throw new Error('The recovered Flash presentation could not load');
    this.presentation=await response.json();
    const picture=async url=>{const image=new Image();image.src=url;await image.decode();return image;};
    [this.wheelImages,this.tileImage,this.categoryImage]=await Promise.all([
      Promise.all(this.presentation.wheels.map(picture)),picture(this.presentation.tile.url),picture(this.presentation.category.url)
    ]);
    await Promise.all(Object.entries(this.presentation.fonts).map(async([name,url])=>{
      const face=new FontFace(name==='board'?'Retail Board':'Retail Category',`url("${url}")`);await face.load();document.fonts.add(face);
    }));
    this.drawWheel();
    this.screenPoster=await new THREE.TextureLoader().loadAsync('assets/presentation/screens/game_logo.png');
    this.screenPoster.colorSpace=THREE.SRGBColorSpace;this.screenPoster.flipY=false;
    this.screenVideos=new Map();
    this.screenMaterials=[];
    this.base=await this.load('assets/models/mesh/wof_base.glb');
    this.scene.add(this.base);this.base.updateMatrixWorld(true);
    this.bindDynamicSurfaces();
    this.bonusRoot=await this.load('assets/models/animation/wheel_bonus_rig/wheel_bonus_rig.glb');
    this.scene.add(this.bonusRoot);
    this.setBonusVisible(false);
    await this.setStage('base');
    this.setView('show',true);
  }
  bindDynamicSurfaces() {
    this.board=this.base.getObjectByName('puzzleboard_swfShape');
    if (!this.board) throw new Error('The original puzzle-board mesh is missing');
    this.boardBounds=new THREE.Box3().setFromObject(this.board);
    const boardNormal=this.board.geometry.getAttribute('normal');
    this.boardNormal=new THREE.Vector3().fromBufferAttribute(boardNormal,0).transformDirection(this.board.matrixWorld);
    // Reproject the planar Flash surface onto the live 14 x 4 display. Its
    // authored UVs reference the old Flash render-target margins, not our canvas.
    this.board.geometry=this.board.geometry.clone();
    const position=this.board.geometry.getAttribute('position');
    const horizontal=new THREE.Vector3(this.boardNormal.z,0,-this.boardNormal.x).normalize();
    let left=Infinity,right=-Infinity,bottom=Infinity,top=-Infinity;
    const coordinates=[];
    for(let i=0;i<position.count;i++){
      const p=new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(this.board.matrixWorld);
      const x=p.dot(horizontal);coordinates.push([x,p.y]);
      left=Math.min(left,x);right=Math.max(right,x);bottom=Math.min(bottom,p.y);top=Math.max(top,p.y);
    }
    const uv=new Float32Array(position.count*2);
    const panels=meshIslands(this.board.geometry).map(vertices=>{
      const xs=vertices.map(i=>coordinates[i][0]),ys=vertices.map(i=>coordinates[i][1]);
      return {vertices,left:Math.min(...xs),right:Math.max(...xs),bottom:Math.min(...ys),top:Math.max(...ys),x:xs.reduce((a,b)=>a+b)/xs.length,y:ys.reduce((a,b)=>a+b)/ys.length};
    });
    const middleRow=panels.filter(panel=>Math.abs(panel.y-(bottom+(top-bottom)*.375))<(top-bottom)*.1).sort((a,b)=>a.x-b.x);
    for(const panel of panels){
      const row=Math.round(3.5-4*(panel.y-bottom)/(top-bottom));
      const column=middleRow.reduce((best,p,i)=>Math.abs(p.x-panel.x)<Math.abs(middleRow[best].x-panel.x)?i:best,0);
      for(const i of panel.vertices){const [x,y]=coordinates[i];uv[i*2]=(column+(x-panel.left)/(panel.right-panel.left))/14;uv[i*2+1]=(row+1-(y-panel.bottom)/(panel.top-panel.bottom))/4;}
    }
    this.board.geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
    this.boardWidth=right-left;
    this.board.material=new THREE.MeshBasicMaterial({map:this.boardCanvas.texture,side:THREE.DoubleSide,toneMapped:false});
    // The wheel meshes were flattened by the exporter. Reparent in world space
    // around the actual contestant-area hub so rotation preserves its placement.
    const spinning=[];
    this.base.traverse(object=>{if(object.isMesh && /^(wheel_rimShape|wheel_swfShape)$/.test(object.name))spinning.push(object);});
    for(const mesh of spinning){this.wheelGroup.attach(mesh);if(mesh.name==='wheel_swfShape')mesh.visible=false;}
    const face=new THREE.Mesh(new THREE.CircleGeometry(1.166,96),new THREE.MeshBasicMaterial({map:this.wheelCanvas.texture,side:THREE.DoubleSide,toneMapped:false}));
    face.rotation.x=-Math.PI/2;face.position.y=.0015;this.wheelGroup.add(face);
    this.base.traverse(object=>{
      if (!object.isMesh) return;
      if (/^screen_.*swfShape$/.test(object.name)){
        // Keep native small-screen art; big/centre monitors play the original Bink movies.
        object.material=new THREE.MeshBasicMaterial({map:/big|center/.test(object.name)?this.screenPoster:object.material.map,side:THREE.FrontSide,toneMapped:false});
        if(/big|center/.test(object.name))this.screenMaterials.push(object.material);
      }
      if (object.name==='podiums_swfShape') this.bindPodiums(object);
    });
  }
  bindPodiums(mesh){
    mesh.geometry=mesh.geometry.clone();
    const positions=mesh.geometry.getAttribute('position'),normals=mesh.geometry.getAttribute('normal');
    const islands=meshIslands(mesh.geometry).map(vertices=>{
      const points=vertices.map(i=>new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld));
      const bounds=new THREE.Box3().setFromPoints(points);
      return {vertices,points,bounds,center:bounds.getCenter(new THREE.Vector3())};
    });
    const displays=islands.filter(i=>i.bounds.max.y-i.bounds.min.y>.15&&i.bounds.max.z-i.bounds.min.z>.3);
    const centers=displays.filter(i=>i.center.y>1).map(i=>i.center.z).sort((a,b)=>a-b);
    const uv=new Float32Array(positions.count*2);uv.fill(.004);
    for(const island of displays){
      const player=centers.reduce((best,z,i)=>Math.abs(z-island.center.z)<Math.abs(centers[best]-island.center.z)?i:best,0);
      const row=island.center.y>1?0:1;
      const normal=new THREE.Vector3().fromBufferAttribute(normals,island.vertices[0]).transformDirection(mesh.matrixWorld);
      const horizontal=new THREE.Vector3(normal.z,0,-normal.x).normalize();
      const xs=island.points.map(p=>p.dot(horizontal));const left=Math.min(...xs),right=Math.max(...xs);
      island.vertices.forEach((vertex,j)=>{uv[vertex*2]=(player+(xs[j]-left)/(right-left))/3;uv[vertex*2+1]=(row+1-(island.points[j].y-island.bounds.min.y)/(island.bounds.max.y-island.bounds.min.y))/2;});
    }
    mesh.geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
    mesh.material=new THREE.MeshBasicMaterial({map:this.podiumCanvas.texture,side:THREE.DoubleSide,toneMapped:false});
  }
  async setStage(id) {
    const generation=(this.stageGeneration??0)+1;this.stageGeneration=generation;
    const entry=this.manifest.stages.find(s=>s.id===id);if(!entry) return;
    let environment=null;
    if(id!=='base') environment=await this.load(entry.url);
    if(generation!==this.stageGeneration) return;
    if(this.environment)this.scene.remove(this.environment);
    this.environment=environment;if(environment)this.scene.add(environment);
    this.bindFloor();
    this.stage=id;
    document.querySelector('#studio-name').textContent=entry.name.toUpperCase();
  }
  bindFloor(){
    if(this.floorReflection){this.scene.remove(this.floorReflection);this.floorReflection.dispose();this.floorReflection.geometry.dispose();this.floorReflection=null;}
    this.floor=null;
    this.environment?.updateMatrixWorld(true);
    this.environment?.traverse(mesh=>{if(mesh.isMesh&&/reflect.*floor|floor.*reflect/i.test(mesh.name))this.floor=mesh;});
    if(!this.floor)return;
    const bounds=new THREE.Box3().setFromObject(this.floor),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    this.floorReflection=new Reflector(new THREE.PlaneGeometry(size.x,size.z),{color:0x81909b,textureWidth:768,textureHeight:768,clipBias:.003,multisample:0});
    this.floorReflection.rotation.x=-Math.PI/2;this.floorReflection.position.set(center.x,bounds.min.y-.002,center.z);
    this.scene.add(this.floorReflection);
    // Retain the authored tile image, UVs and contact shading over the planar
    // reflection instead of replacing a near-black specular floor with grey.
    this.floor.material.transparent=true;this.floor.material.opacity=.72;
    if(this.lowQuality)this.floorReflection.getRenderTarget().setSize(256,256);
  }
  setSourceCamera(name,endpoint=false){
    const source=this.cameraCatalog.cameras.find(c=>c.name===name);if(!source)return false;
    this.sourceCamera=name;this.cameraTween=null;this.controls.enabled=false;
    this.camera.position.fromArray(source.position);
    if(endpoint&&source.tracks[0]){
      const keys=source.tracks[0].translation.keys;
      if(keys.length)this.camera.position.add(new THREE.Vector3().fromArray(keys.at(-1).value).sub(new THREE.Vector3().fromArray(keys[0].value)).multiplyScalar(SCALE));
    }
    this.camera.up.fromArray(source.up);
    this.camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(source.fov/2))*Math.max(1,source.aspect/this.camera.aspect)));
    this.camera.near=.03;this.camera.updateProjectionMatrix();
    this.controls.target.copy(this.camera.position).addScaledVector(new THREE.Vector3().fromArray(source.forward),10);
    // Explore's polar limits must not clamp the original fixed camera poses.
    this.camera.lookAt(this.controls.target);
    return true;
  }
  setView(view,instant=false,endpoint=false) {
    this.view=view;this.controls.enabled=view==='orbit';
    if(view!=='orbit'&&this.preview){this.scene.remove(this.preview);this.preview=null;}
    if(view==='orbit'){this.cameraTween=null;this.camera.up.set(0,1,0);this.controls.update();return;}
    this.camera.up.set(0,1,0);this.camera.fov=48;this.sourceCamera=null;
    const slot=this.game?.state?this.game.player.slot:0;
    if(view==='wheel'&&this.setSourceCamera(`cam5_wheel_detail_player${slot}_animation_push`,endpoint))return;
    if(view==='bonus'&&this.setSourceCamera('cam6_bonus_wheel_front'))return;
    if(view==='show'&&this.game?.state&&this.setSourceCamera('cam2_all_players_zoomed_out'))return;
    let position,target;
    if(view==='board'){
      const source=this.cameraCatalog.cameras.find(c=>c.name==='cam4_puzzleboard');
      if(source)this.camera.fov=source.fov;
      target=this.boardBounds.getCenter(new THREE.Vector3());
      const height=this.canvas.clientHeight;
      const hud=document.querySelector('#scoreboard').getBoundingClientRect();
      const top=this.camera.aspect<1?175:155,bottom=Math.max(top+100,Math.min(height*.69,hud.height?hud.top-18:height*.69));
      const tangent=Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2));
      const distance=Math.max(7.8,this.boardWidth/(2*tangent*this.camera.aspect)*1.14,(this.boardBounds.max.y-this.boardBounds.min.y)/(2*tangent*(bottom-top)/height)*1.18);
      position=target.clone().addScaledVector(this.boardNormal,distance);
      target.y-=distance*tangent*(1-(top+bottom)/height);
    }else if(view==='bonus'){
      position=new THREE.Vector3(2.4,3.5,4.0);target=new THREE.Vector3(0,.9,0);
    }else if(view==='wheel'){
      position=new THREE.Vector3(5.7,4.7,3.7);target=new THREE.Vector3(6.01,.97,-.71);
    }else{
      position=new THREE.Vector3(this.camera.aspect<1?16:12, this.camera.aspect<1?6.5:5.1, this.camera.aspect<1?29:18);
      target=new THREE.Vector3(-1.4,this.camera.aspect<1?2.5:1.5,-1.1);
    }
    this.cameraTween=null;this.camera.position.copy(position);this.controls.target.copy(target);this.camera.updateProjectionMatrix();this.camera.lookAt(target);
  }
  drawWheel() {
    if(!this.wheelImages)return;
    const round=Math.min(4,this.game?.state?.round??1);if(this.wheelRound===round)return;
    const {context:c,texture}=this.wheelCanvas;
    c.clearRect(0,0,1024,1024);c.save();c.beginPath();c.arc(512,512,510,0,Math.PI*2);c.clip();
    c.drawImage(this.wheelImages[round-1],0,0,1024,1024);c.restore();
    texture.needsUpdate=true;this.wheelRound=round;
  }
  drawBoard(state,time=performance.now()) {
    const {context:c,texture}=this.boardCanvas,w=128,h=128;
    const sequence=this.boardSequence,elapsed=sequence?time-sequence.start:Infinity;
    const used=sequence?.used??state.used;
    c.fillStyle='#020a07';c.fillRect(0,0,1792,512);
    state.puzzle.rows.forEach((row,r)=>[...row].forEach((letter,col)=>{
      const x=col*w,y=r*h,active=letter!==' ';
      let revealed=active&&(!/[A-Z]/i.test(letter)||used.includes(letter.toUpperCase()));
      let frame=active?revealed?38:14:3;
      const tile=sequence?.tiles.find(t=>t.index===r*14+col);
      if(tile&&elapsed<sequence.duration){
        if(tile.kind==='open'){
          frame=elapsed<tile.at?3:Math.min(14,8+Math.floor((elapsed-tile.at)*30/1000));
          if(elapsed<tile.at+200)revealed=false;
        }else if(elapsed<tile.at){frame=31;revealed=false;}
        else frame=Math.min(38,37+Math.floor((elapsed-tile.at)*30/1000));
      }
      const atlas=this.presentation.tile,index=atlas.frames.indexOf(frame);
      c.drawImage(this.tileImage,(index%atlas.columns)*atlas.width,Math.floor(index/atlas.columns)*atlas.height,atlas.width,atlas.height,x+2,y+2,w-4,h-4);
      const entry=this.solveDraft?.[r*14+col];
      if(this.solveDraft&&active&&!revealed){c.fillStyle=r*14+col===this.solveCursor?'#ffdf80':'#e0edff';c.fillRect(x+8,y+8,w-16,h-16);}
      if(revealed||entry){c.fillStyle=revealed?'#000':'#215795';c.font='96px "Retail Board"';c.textAlign='center';c.textBaseline='middle';c.fillText(revealed?letter.toUpperCase():entry,x+w/2,y+h/2+3);}
    }));texture.needsUpdate=true;
  }
  drawCategory(time){
    const canvas=document.querySelector('#category-reveal'),c=canvas.getContext('2d'),clip=this.categorySequence;
    if(!clip)return;
    const elapsed=Math.max(0,time-clip.start),atlas=this.presentation.category;
    if(elapsed>2800){canvas.hidden=true;this.categorySequence=null;return;}
    canvas.hidden=false;c.clearRect(0,0,640,100);
    const i=Math.min(atlas.frames.length-1,Math.floor(elapsed*atlas.fps/1000));
    c.drawImage(this.categoryImage,(i%atlas.columns)*640,Math.floor(i/atlas.columns)*100,640,100,0,0,640,100);
    const key=atlas.text[i];c.save();c.translate(336,44);c.scale(key.scale,1);c.globalAlpha=key.alpha;
    c.textAlign='center';c.textBaseline='middle';c.font='20px "Retail Category"';c.fillStyle='#fff';c.shadowColor='#1e4351';c.shadowBlur=3;
    c.fillText(clip.text,0,0,460);c.restore();
  }
  playScreen(name='game_logo',loop=true){
    if(this.screenMovie===name)return;
    this.screenVideos.forEach(entry=>entry.video.pause());this.screenMovie=name;
    if(!this.screenVideos.has(name)){
      const video=document.createElement('video');video.src=`assets/presentation/screens/${name}.mp4`;video.muted=true;video.playsInline=true;video.preload='auto';
      const texture=new THREE.VideoTexture(video);texture.colorSpace=THREE.SRGBColorSpace;texture.flipY=false;
      video.onloadeddata=()=>{if(this.screenMovie===name)this.screenMaterials.forEach(m=>{m.map=texture;m.needsUpdate=true;});};
      video.onended=()=>{if(this.screenMovie===name&&!video.loop)this.playScreen('game_logo');};this.screenVideos.set(name,{video,texture});
    }
    const {video,texture}=this.screenVideos.get(name);video.loop=loop;video.currentTime=0;
    if(video.readyState>=2)this.screenMaterials.forEach(m=>{m.map=texture;m.needsUpdate=true;});
    video.play().catch(()=>{this.screenMaterials.forEach(m=>{m.map=this.screenPoster;m.needsUpdate=true;});});
  }
  setSolveDraft(entries,cursor=null){this.solveDraft=entries;this.solveCursor=cursor;if(this.boardState)this.drawBoard(this.boardState);}
  drawScreens(state) {
    const {context:p,texture:pt}=this.podiumCanvas;p.fillStyle='#111f49';p.fillRect(0,0,1536,512);
    for(let slot=0;slot<3;slot++){
      const player=state?.players.find(p=>p.slot===slot),active=player&&player===state.players[state.turn],x=slot*512;
      p.fillStyle=active?'#1742a1':'#040914';p.fillRect(x,0,512,512);p.fillStyle=active?colors[slot]:'#34404c';
      p.fillRect(x+10,8,492,10);p.fillRect(x+10,264,492,10);p.fillStyle=active?'#fff':'#637080';p.textAlign='center';p.textBaseline='middle';
      p.font='bold 72px "Retail Board"';p.fillText(player?money(player.cash):'',x+256,132,465);p.font='bold 54px "Retail Board"';p.fillText(player?.name??'',x+256,385,465);
      if(active){p.fillStyle='#ffe198';p.font='20px Verdana';p.fillText('YOUR TURN',x+256,220);}
    }pt.needsUpdate=true;
  }
  setBonusVisible(visible){
    if(this.bonusRoot)this.bonusRoot.visible=visible;
    this.base?.traverse(object=>{if(/^(bonus_baseShape|bonuswheel_handrestShape|bonus_flipperShape)/.test(object.name))object.visible=visible;});
  }
  update(state,event) {
    const previous=this.boardSnapshot,transition=boardTransition(previous,state,event,this.presentation.timing);
    this.boardSequence={...transition,start:performance.now()};
    this.boardSnapshot={id:state.puzzle.id,used:transition.used};
    this.boardState={puzzle:state.puzzle,used:transition.used};
    if(transition.opening&&event!=='restore')this.categorySequence={start:performance.now(),text:state.puzzle.category};
    if(event==='start'||event==='restore')this.playScreen();
    if(event==='round')this.playScreen(state.round===2?'jackpot_intro':state.round===3?'mystery_intro':'game_logo',state.round!==2&&state.round!==3);
    if(event==='win')this.playScreen('fireworks',false);
    this.setBonusVisible(state.round===5);this.drawBoard(this.boardState);this.drawScreens(state);this.drawWheel();
    return Math.max(transition.duration,transition.opening&&event!=='restore'?2800:0);
  }
  cancelPresentation(){
    this.boardSequence=null;this.boardSnapshot=null;this.categorySequence=null;document.querySelector('#category-reveal').hidden=true;
    for(const name of ['spinTween','bonusTween']){this[name]?.resolve();this[name]=null;}
    this.screenVideos?.forEach(entry=>entry.video.pause());this.screenMovie=null;
    this.screenMaterials?.forEach(m=>{m.map=this.screenPoster;m.needsUpdate=true;});
  }
  spin(index,wedges,onTick) {
    this.drawWheel();
    // Stop at the selected wedge under the first original flipper.
    const flippers=[[6.755,-1.713],[7.18,-1.153],[7.214,-.427]];
    const [px,pz]=flippers[this.game.player.slot];
    const pointer=Math.atan2(pz-this.wheelGroup.position.z,px-this.wheelGroup.position.x);
    const target=(index*Math.PI*2/24-Math.PI/2-pointer)%(Math.PI*2);
    const current=((this.wheelAngle%(Math.PI*2))+Math.PI*2)%(Math.PI*2);
    const delta=((target-current)%(Math.PI*2)+Math.PI*2)%(Math.PI*2);
    return new Promise(resolve=>{this.spinTween={start:performance.now(),duration:4800,from:this.wheelAngle,to:this.wheelAngle+Math.PI*2*5+delta,resolve,onTick,lastIndex:-1};});
  }
  spinBonus(onTick){
    return new Promise(resolve=>{this.bonusTween={start:performance.now(),from:this.bonusRoot.rotation.y,to:this.bonusRoot.rotation.y+Math.PI*2*(4+Math.random()),resolve,onTick,lastIndex:-1};});
  }
  async previewPart(entry) {
    if(this.preview)this.scene.remove(this.preview);
    const root=await this.load(entry.url);const bounds=new THREE.Box3().setFromObject(root);
    const center=bounds.getCenter(new THREE.Vector3());
    root.position.set(-center.x,-bounds.min.y,-center.z);
    const holder=new THREE.Group();holder.add(root);holder.position.set(0,0,4);this.scene.add(holder);this.preview=holder;
    this.controls.enabled=true;this.camera.position.set(0,2.4,9);this.controls.target.set(0,1,4);this.controls.update();
  }
  quality(value){this.lowQuality=value==='low';this.renderer.setPixelRatio(this.lowQuality?1:Math.min(devicePixelRatio,1.5));this.renderer.shadowMap.enabled=!this.lowQuality;if(this.floorReflection)this.floorReflection.getRenderTarget().setSize(this.lowQuality?256:768,this.lowQuality?256:768);this.resize();}
  animate(time) {
    if(this.boardSequence&&!this.boardSequence.done&&time-(this.boardDrawTime??0)>30){this.drawBoard(this.boardState,time);this.boardDrawTime=time;this.boardSequence.done=time-this.boardSequence.start>=this.boardSequence.duration;}
    if(this.categorySequence)this.drawCategory(time);
    if(this.spinTween){const spin=this.spinTween;const t=Math.min(1,(time-spin.start)/spin.duration);this.wheelAngle=THREE.MathUtils.lerp(spin.from,spin.to,1-Math.pow(1-t,4));this.wheelGroup.rotation.y=this.wheelAngle;const index=Math.floor(this.wheelAngle/(Math.PI*2/24));if(index!==spin.lastIndex){spin.onTick?.();spin.lastIndex=index;}if(t===1){this.spinTween=null;spin.resolve();}}
    if(this.bonusTween){const spin=this.bonusTween,t=Math.min(1,(time-spin.start)/4200);this.bonusRoot.rotation.y=THREE.MathUtils.lerp(spin.from,spin.to,1-Math.pow(1-t,4));const index=Math.floor(this.bonusRoot.rotation.y/.3);if(index!==spin.lastIndex){spin.onTick?.();spin.lastIndex=index;}if(t===1){this.bonusTween=null;spin.resolve();}}
    if(this.controls.enabled)this.controls.update();this.renderer.render(this.scene,this.camera);this.frameCount++;
  }
  diagnostics(){return {stage:this.stage,view:this.view,frames:this.frameCount,drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,boardBounds:this.boardBounds,retailFont:document.fonts.check('96px "Retail Board"'),wheelRound:this.wheelRound,reflectiveFloor:!!this.floorReflection?.visible};}
}
