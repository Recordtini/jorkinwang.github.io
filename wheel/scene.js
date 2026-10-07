import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {Reflector} from 'three/addons/objects/Reflector.js';
import {boardTransition,materialAlpha,tileRevealed,nativeCameraForView,nativeDepthState,noticeFrame,wheelLandingAngle,stageCullMatches,categoryFrame,floorOverlayOrder,stageMovieSurface} from './presentation.js?v=20261006-center-screen';
import {PodiumDisplay} from './podiums.js?v=20261006-podiums';
import {sampleScalar,clipTime,animationCategory,animationClamped,textureMatrix} from './animations.js?v=20261006-presentation';

const SCALE = .01;
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
    this.podiumCanvas = canvasTexture(1024,512);
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
    if(this.movieAspect&&this.moviePlane)this.moviePlane.scale.set(Math.min(1,this.movieAspect/this.camera.aspect),Math.min(1,this.camera.aspect/this.movieAspect),1);
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
    const model=url.split('/').at(-1).replace('.glb','');
    const nativeTextures=[];
    root.traverse(object=>{
      if(object.isLight) {object.visible=false;return;}
      if (!object.isMesh) return;
      // The rig is already baked into the source atlas. A second sun shadow
      // from it creates unrelated stripes on the backdrop and black floors.
      object.castShadow=/^(podium|wheel_|bonus_|letterboard|puzzleboard)/i.test(object.name)&&!/swf|glow|flare/i.test(object.name);
      object.receiveShadow=!/background|backdrop|ceiling|truss|light_/i.test(object.name);
      object.material=object.material.clone();
      const source=this.cameraCatalog?.materials[(model==='wof_base'?'':model+'/')+object.name];
      const native=this.materialData?.[model+'/'+object.name];
      const bakedBlade=/screen_blurry/.test(native?.material??'');
      if(bakedBlade){const old=object.material;object.material=new THREE.MeshBasicMaterial({name:old.name,map:old.map,side:old.side,color:0xffffff,opacity:native.alpha,toneMapped:false});}
      if(source){
        const alpha=materialAlpha(source),m=object.material;
        m.transparent=alpha.blend;m.opacity=native?.alpha??m.opacity;
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
      if(native){
        const m=object.material;
        const depth=nativeDepthState(native);
        m.depthTest=depth.test;m.depthWrite=depth.write;m.side=depth.side;m.forceSinglePass=true;
        m.depthFunc=[THREE.AlwaysDepth,THREE.LessDepth,THREE.EqualDepth,THREE.LessEqualDepth,THREE.GreaterDepth,THREE.NotEqualDepth,THREE.GreaterEqualDepth,THREE.NeverDepth][depth.func];
        // Blending does not disable native depth writes. Otherwise the floor's
        // transparent overlay can paint over nearer backdrop panels.
        if(native.textures.dark)object.receiveShadow=false;
        // The old GLB's AO is a grayscale approximation. Use the original RGB
        // dark map and its compact TexDesc UV index, not a guessed UV channel.
        if(native.textures.dark?.url)nativeTextures.push(this.nativeTexture(native.textures.dark).then(texture=>{
          m.aoMap=texture;m.aoMapIntensity=0;
          const previous=m.onBeforeCompile,cacheKey=m.customProgramCacheKey.bind(m);
          m.onBeforeCompile=shader=>{previous(shader);shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n#ifdef USE_AOMAP\n diffuseColor.rgb *= texture2D(aoMap, vAoMapUv).rgb;\n#endif');};
          const nativeKey=cacheKey();m.customProgramCacheKey=()=>`nif-rgb-dark-${nativeKey}`;m.needsUpdate=true;
        }));
        if(!bakedBlade&&native.textures.glow?.url)nativeTextures.push(this.nativeTexture(native.textures.glow,true).then(texture=>{m.emissiveMap=texture;m.emissive.setRGB(1,1,1);m.needsUpdate=true;}));
        else if(m.emissive){m.emissiveMap=null;m.emissive.fromArray(native.emissive);}
        // Gloss-only blades must not become light emitters or shiny PBR plastic.
        if(/screen_blurry/.test(native.material)){m.roughnessMap=null;m.roughness=1;m.metalness=0;}
      }
      object.material.roughness=Math.min(object.material.roughness??.7,.78);
      object.material.metalness=Math.min(object.material.metalness??0,.25);
      if(/reflect.*floor|floor.*reflect/i.test(object.name))object.material.aoMapIntensity=.25;
      if(object.material.map) object.material.map.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());
      // Emissive geometry is still solid geometry: the opaque glowtube columns
      // must occlude the floor and rear panel frames using their native depth.
      if(/glow|flare/i.test(object.name))object.castShadow=false;
    });
    await Promise.all(nativeTextures);
    return root;
  }
  nativeTexture(entry,srgb=false){
    this.nativeTextures??=new Map();
    if(!this.nativeTextures.has(entry.url))this.nativeTextures.set(entry.url,new THREE.TextureLoader().loadAsync(entry.url+'?v=20261006-atlases'));
    return this.nativeTextures.get(entry.url).then(source=>{const texture=source.clone();texture.flipY=false;texture.channel=entry.uvSet;texture.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.needsUpdate=true;return texture;});
  }
  async initialize(manifest) {
    this.manifest=manifest;
    this.cameraCatalog=await fetch('assets/presentation/cameras.json').then(r=>{if(!r.ok)throw new Error('Original camera data could not load');return r.json();});
    this.cameraCatalog.materials=Object.fromEntries(Object.entries(this.cameraCatalog.materials).map(([key,value])=>{const at=key.lastIndexOf('/');return [key.slice(0,at+1)+key.slice(at+1).replace(/[\[\].: /]/g,''),value];}));
    const response=await fetch('assets/presentation/presentation.json');
    if(!response.ok)throw new Error('The recovered Flash presentation could not load');
    this.presentation=await response.json();
    this.animationData=await fetch('assets/presentation/animations.json').then(r=>r.json());
    const runtimeName=name=>name.replace(/[\[\].: /]/g,'');
    for(const [actor,nodes] of Object.entries(this.animationData.bindings))this.animationData.bindings[actor]=Object.fromEntries(Object.entries(nodes).map(([name,node])=>[runtimeName(name),node]));
    for(const clips of Object.values(this.animationData.clips))for(const clip of Object.values(clips))for(const track of clip.tracks)track.node=runtimeName(track.node);
    this.materialData=await fetch('assets/presentation/materials.json?v=20261006-atlases').then(r=>r.json());
    this.noticeData=await fetch('assets/presentation/notices.json?v=20261006-presentation').then(r=>r.json());
    this.collectibleData=await fetch('assets/presentation/collectibles/collectibles.json').then(r=>r.json());
    this.sceneData=await fetch('assets/scenes.json?v=20261006-letter-audio').then(r=>r.json());
    const picture=async url=>{const image=new Image();image.src=url;await image.decode();return image;};
    this.noticeImages={};for(const [name,entry] of Object.entries(this.noticeData))this.noticeImages[name]=await picture(entry.url+'?v=20261006-presentation');
    [this.wheelImages,this.tileImage,this.categoryImage]=await Promise.all([
      Promise.all(this.presentation.wheels.map(picture)),picture(this.presentation.tile.url),picture(this.presentation.category.url)
    ]);
    this.collectibleImages={};for(const [kind,entry] of Object.entries(this.collectibleData))this.collectibleImages[kind]=await picture(entry.url);
    this.mysteryClearedImage=await picture('assets/presentation/wheel-mystery-cleared.png');
    this.game.collectibleSectors=Object.fromEntries(Object.entries(this.collectibleData).map(([k,v])=>[k,v.sector]));
    await Promise.all(Object.entries(this.presentation.fonts).map(async([name,url])=>{
      const face=new FontFace(name==='board'?'Retail Board':'Retail Category',`url("${url}")`);await face.load();document.fonts.add(face);
    }));
    const podiumResponse=await fetch('assets/presentation/podiums/podiums.json');
    if(!podiumResponse.ok)throw new Error('The recovered podium movie could not load');
    const podiumData=await podiumResponse.json(),podiumImages={body:await picture(podiumData.body)};
    for(const name of ['backgrounds','turn','lose','bankrupt','glyphs'])podiumImages[name]=await picture(podiumData[name].url);
    await document.fonts.load('24px "Retail Podium"');
    this.podiums=new PodiumDisplay(this.podiumCanvas.context,podiumData,podiumImages);
    this.drawScreens(null);
    this.drawWheel();
    this.screenPoster=await new THREE.TextureLoader().loadAsync('assets/presentation/screens/game_logo.png');
    this.screenPoster.colorSpace=THREE.SRGBColorSpace;this.screenPoster.flipY=false;
    this.screenVideos=new Map();
    this.videoData=await fetch('assets/presentation/screens/videos.json?v=20261006-presentation').then(r=>r.json());
    this.movieScene=new THREE.Scene();this.movieCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    this.moviePlane=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({transparent:true,depthTest:false,depthWrite:false,toneMapped:false}));
    const movieUV=this.moviePlane.geometry.getAttribute('uv');
    for(let i=0;i<movieUV.count;i++)movieUV.setY(i,1-movieUV.getY(i));
    this.moviePlane.visible=false;this.movieScene.add(this.moviePlane);
    this.screenMaterials=[];
    this.base=await this.load('assets/models/mesh/wof_base.glb');
    this.scene.add(this.base);this.base.updateMatrixWorld(true);
    this.actorRoots=new Map();this.actorTimelines=new Map();this.animationBindings=[];
    for(const actor of Object.keys(this.animationData.clips)){
      const root=await this.load(`assets/models/animation/${actor}/${actor}.glb`);
      root.traverse(mesh=>{
        if(!mesh.isMesh)return;
        const existing=this.base.getObjectByName(mesh.name);if(existing?.isMesh)existing.visible=false;
        const slots=this.animationData.bindings[actor]?.[mesh.name]?.textures??{};
        for(const [slot,desc] of Object.entries(slots)){
          const key=slot==='0'?'map':'emissiveMap',texture=mesh.material[key];if(!texture)continue;
          mesh.material[key]=texture.clone();mesh.material[key].matrixAutoUpdate=false;
          mesh.material[key].channel=desc.uvSet;
          mesh.material[key].matrix.set(...textureMatrix(desc));
          mesh.material[key].wrapS=desc.clamp===2||desc.clamp===3?THREE.RepeatWrapping:THREE.ClampToEdgeWrapping;
          mesh.material[key].wrapT=desc.clamp===1||desc.clamp===3?THREE.RepeatWrapping:THREE.ClampToEdgeWrapping;
          this.animationBindings.push({actor,node:mesh.name,slot,texture:mesh.material[key],desc});
        }
      });
      this.scene.add(root);this.actorRoots.set(actor,root);
    }
    this.playSetCategory('idle');
    this.bindDynamicSurfaces();
    this.bonusRoot=this.actorRoots.get('wheel_bonus_rig');
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
    // Circle UVs need bottom-up texture sampling; the board/podium canvases do not.
    this.wheelCanvas.texture.flipY=true;this.wheelCanvas.texture.needsUpdate=true;
    face.rotation.x=-Math.PI/2;face.position.y=.0015;this.wheelGroup.add(face);
    const bind=object=>{
      if (!object.isMesh) return;
      if (/^screen_.*swfShape$/.test(object.name)){
        // Keep native small-screen art; big/centre monitors play the original Bink movies.
        object.material=new THREE.MeshBasicMaterial({map:/big|center/.test(object.name)?this.screenPoster:object.material.map,side:THREE.FrontSide,toneMapped:false});
        if(/big|center/.test(object.name))this.screenMaterials.push(object.material);
      }
      if (object.name==='podiums_swfShape') this.bindPodiums(object);
    };
    this.base.traverse(bind);for(const root of this.actorRoots.values())root.traverse(bind);
  }
  bindPodiums(mesh){
    // Original UVs address cash panels above the three colored body images.
    // Reprojecting them as a 3x2 score/name grid corrupts both native surfaces.
    mesh.material=new THREE.MeshBasicMaterial({map:this.podiumCanvas.texture,side:THREE.DoubleSide,toneMapped:false});
  }
  async setStage(id) {
    const generation=(this.stageGeneration??0)+1;this.stageGeneration=generation;
    const entry=this.manifest.stages.find(s=>s.id===id);if(!entry) return;
    let environment=null;
    if(id!=='base') environment=await this.load(entry.url);
    if(generation!==this.stageGeneration) return;
    const oldScreens=new Set(this.stageScreenMaterials??[]);
    this.screenMaterials=this.screenMaterials.filter(material=>!oldScreens.has(material));
    oldScreens.forEach(material=>material.dispose());
    if(this.environment)this.scene.remove(this.environment);
    this.environment=environment;if(environment)this.scene.add(environment);
    this.applyStageCulls(id);
    this.bindStageScreens(entry.url?.split('/').at(-1).replace('.glb',''));
    this.bindFloor();
    this.stage=id;
  }
  bindStageScreens(model){
    this.stageScreenMaterials=[];
    const surfaces=[];
    this.environment?.traverse(mesh=>{
      if(mesh.isMesh&&stageMovieSurface(model,mesh.name,this.materialData[model+'/'+mesh.name]))surfaces.push(mesh);
    });
    for(const source of surfaces){
      // The SCX culls the static logo placeholder. Our movie uses its authored
      // surface, not the imported base monitor that this set also culls.
      const screen=source.clone(false);
      screen.name='retail-movie-surface';screen.visible=true;screen.castShadow=false;screen.receiveShadow=false;
      screen.material=new THREE.MeshBasicMaterial({map:this.screenPoster,side:THREE.FrontSide,toneMapped:false});
      source.visible=false;source.parent.add(screen);
      this.stageScreenMaterials.push(screen.material);this.screenMaterials.push(screen.material);
    }
    const movie=this.screenVideos.get(this.screenMovie);
    if(movie?.video.readyState>=2&&['game_logo','fireworks'].includes(this.screenMovie))this.bindMovie(this.screenMovie,movie.texture);
  }
  applyStageCulls(id){
    for(const [object,visible] of this.stageCulled??[])object.visible=visible;
    this.stageCulled=new Map();
    const culls=this.sceneData[id]?.culls??[];
    const hide=object=>{if(!this.stageCulled.has(object))this.stageCulled.set(object,object.visible);object.visible=false;};
    for(const [name,root] of this.actorRoots)if(culls.some(target=>stageCullMatches(name,target)))hide(root);
    for(const root of [this.base,this.environment,...this.actorRoots.values()].filter(Boolean)){
      root.traverse(object=>{if(culls.some(target=>stageCullMatches(object.name,target)))hide(object);});
    }
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
    // A zero-alpha decal still writes native depth. Draw the tile overlay first
    // so that rectangle cannot mask it and expose the untinted reflection.
    this.floor.renderOrder=1;
    this.environment.traverse(mesh=>{
      if(mesh.isMesh&&mesh!==this.floor&&mesh.material.transparent)mesh.renderOrder=floorOverlayOrder(new THREE.Box3().setFromObject(mesh),bounds,true);
    });
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
    const source=nativeCameraForView(view,slot,endpoint);
    if(source&&(view!=='show'||this.game?.state)&&this.setSourceCamera(source,endpoint&&view==='wheel'))return;
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
    const state=this.game?.state,round=Math.min(4,state?.round??1);
    const stamp=JSON.stringify([round,state?.rules?.collectibles,state?.availableCollectibles,state?.mysteryTaken]);if(this.wheelStamp===stamp)return;
    const {context:c,texture}=this.wheelCanvas;
    c.clearRect(0,0,1024,1024);c.save();c.beginPath();c.arc(512,512,510,0,Math.PI*2);c.clip();
    c.drawImage(round===3&&state?.mysteryTaken?this.mysteryClearedImage:this.wheelImages[round-1],0,0,1024,1024);
    if(state?.rules?.collectibles)for(const [kind,entry] of Object.entries(this.collectibleImages))if(state.availableCollectibles[kind]&&(kind!=='Million'||round<=3))c.drawImage(entry,0,0,1024,1024);
    c.restore();texture.needsUpdate=true;this.wheelRound=round;this.wheelStamp=stamp;
  }
  drawBoard(state,time=performance.now()) {
    const {context:c,texture}=this.boardCanvas,w=128,h=128;
    const sequence=this.boardSequence,elapsed=sequence?time-sequence.start:Infinity;
    const used=sequence?.used??state.used;
    c.fillStyle='#020a07';c.fillRect(0,0,1792,512);
    state.puzzle.rows.forEach((row,r)=>[...row].forEach((letter,col)=>{
      const x=col*w,y=r*h,active=letter!==' ';
      let revealed=active&&(!/[A-Z]/i.test(letter)||tileRevealed({...state,used},r*14+col,letter));
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
    canvas.hidden=false;
    const i=categoryFrame(atlas,elapsed);
    if(clip.lastFrame===i)return;
    clip.lastFrame=i;c.clearRect(0,0,640,100);
    c.drawImage(this.categoryImage,(i%atlas.columns)*640,Math.floor(i/atlas.columns)*100,640,100,0,0,640,100);
    const key=atlas.text[i];c.save();c.translate(336,44);c.scale(key.scale,1);c.globalAlpha=key.alpha;
    c.textAlign='center';c.textBaseline='middle';c.font='20px "Retail Category"';c.fillStyle='#fff';c.shadowColor='#1e4351';c.shadowBlur=3;
    c.fillText(clip.text,0,0,460);c.restore();
  }
  restScreen(){
    this.screenVideos?.forEach(entry=>entry.video.pause());this.screenMovie=null;
    this.screenMaterials?.forEach(m=>{m.map=this.screenPoster;m.onBeforeCompile=()=>{};m.customProgramCacheKey=()=> 'movie-poster';m.needsUpdate=true;});
    if(this.moviePlane)this.moviePlane.visible=false;
  }
  playScreen(name='game_logo'){
    if(this.screenMovie===name)return;
    this.restScreen();
    this.screenVideos.forEach(entry=>entry.video.pause());this.screenMovie=name;
    if(!this.screenVideos.has(name)){
      const video=document.createElement('video');video.src=this.videoData[name]?.url??`assets/presentation/screens/${name}.mp4`;video.muted=true;video.playsInline=true;video.preload='auto';
      const texture=new THREE.VideoTexture(video);texture.colorSpace=THREE.SRGBColorSpace;texture.flipY=false;
      video.onloadeddata=()=>{if(this.screenMovie===name)this.bindMovie(name,texture);};
      video.onerror=()=>{if(this.screenMovie===name)this.restScreen();};
      video.onended=()=>{if(this.screenMovie===name)this.restScreen();};this.screenVideos.set(name,{video,texture});
    }
    const {video,texture}=this.screenVideos.get(name);video.loop=false;video.currentTime=0;
    if(video.readyState>=2)this.bindMovie(name,texture);
    video.play().catch(()=>{if(this.screenMovie===name)this.restScreen();});
  }
  bindMovie(name,texture){
    const onScreen=['game_logo','fireworks'].includes(name),alpha=this.videoData[name]?.alpha===true;
    const entry=this.videoData[name];this.movieAspect=entry?entry.width/entry.height:16/9;
    this.moviePlane.scale.set(Math.min(1,this.movieAspect/this.camera.aspect),Math.min(1,this.camera.aspect/this.movieAspect),1);
    this.moviePlane.visible=!onScreen;
    // Packed RGB + original Bink alpha is portable even where WebM alpha decoding is absent.
    for(const material of onScreen?this.screenMaterials:[this.moviePlane.material]){
      material.map=texture;material.transparent=!onScreen&&alpha;
      material.onBeforeCompile=shader=>{
        if(!alpha)return;
        shader.uniforms.moviePoster={value:this.screenPoster};
        shader.fragmentShader='uniform sampler2D moviePoster;\n'+shader.fragmentShader;
        const map=THREE.ShaderChunk.map_fragment.replace('vMapUv','vec2(vMapUv.x*0.5,vMapUv.y)');
        shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',map+'\nfloat movieAlpha=texture2D(map,vec2(0.5+vMapUv.x*0.5,vMapUv.y)).r;\n'+(onScreen?'diffuseColor.rgb=mix(sRGBTransferEOTF(texture2D(moviePoster,vMapUv)).rgb,diffuseColor.rgb,movieAlpha);':'diffuseColor.a*=movieAlpha;'));
      };
      material.customProgramCacheKey=()=>`movie-${onScreen}-${alpha}`;material.needsUpdate=true;
    }
  }
  setSolveDraft(entries,cursor=null){this.solveDraft=entries;this.solveCursor=cursor;if(this.boardState)this.drawBoard(this.boardState);}
  drawScreens(state,event='restore') {
    const duration=this.podiums?.update(state,event,performance.now())??0;
    this.podiumCanvas.texture.needsUpdate=true;
    return duration;
  }
  setBonusVisible(visible){
    if(this.bonusRoot)this.bonusRoot.visible=visible;
    if(this.actorRoots?.has('wheel_bonus_platform'))this.actorRoots.get('wheel_bonus_platform').visible=visible;
    this.base?.traverse(object=>{if(/^(bonus_baseShape|bonuswheel_handrestShape|bonus_flipperShape)/.test(object.name))object.visible=visible;});
  }
  update(state,event) {
    const previous=this.boardSnapshot,transition=boardTransition(previous,state,event,this.presentation.timing);
    this.boardSequence={...transition,start:performance.now()};
    this.boardSnapshot={id:state.puzzle.id,used:transition.used};
    this.boardState={...state,used:transition.used};
    if(transition.opening)this.categorySequence={start:performance.now()-(event==='restore'?2800:0),text:state.puzzle.category};
    if(event==='start')this.playScreen();
    if(event==='restore')this.restScreen();
    if(event==='round'){
      if(['tossup','tiebreaker'].includes(state.stageType)&&state.tossupNumber)this.playScreen(`${state.tossupNumber*1000}tossup`);
      else if(state.round===2||state.round===3)this.playScreen(state.round===2?'jackpot_intro':'mystery_intro');
      else this.restScreen();
    }
    if(event==='start'&&state.stageType==='tossup')this.playScreen('1000tossup');
    if(event==='win')this.playScreen(state.round===5&&state.phase==='finished'?`bonus_${state.bonusPrize}`:'fireworks');
    if(event==='tossup-win')this.playScreen('fireworks');
    const category=animationCategory(state,event);if(category)this.playSetCategory(category);
    this.setBonusVisible(state.round===5);this.drawBoard(this.boardState);const podiumDuration=this.drawScreens(state,event);this.drawWheel();
    const movieMs=this.screenMovie&&!['game_logo','fireworks'].includes(this.screenMovie)&&['round','win'].includes(event)?this.videoData[this.screenMovie]?.durationMs??0:0;
    return Math.max(transition.duration,transition.opening&&event!=='restore'?2800:0,podiumDuration,movieMs);
  }
  cancelPresentation(){
    this.podiums?.reset();
    this.boardSequence=null;this.boardSnapshot=null;this.categorySequence=null;document.querySelector('#category-reveal').hidden=true;
    for(const name of ['spinTween','bonusTween']){this[name]?.resolve();this[name]=null;}
    this.restScreen();
    this.playSetCategory('idle');
    this.showNotice(null);
    this.noticePuzzle=null;this.noticeSeen=new Set();
  }
  showNotice(name,puzzle){
    const canvas=document.querySelector('#letter-notice');
    if(this.noticePuzzle!==puzzle){this.noticePuzzle=puzzle;this.noticeSeen=new Set();}
    if(!name){canvas.hidden=true;this.notice=null;return;}
    if(this.noticeSeen.has(name))return;
    this.noticeSeen.add(name);this.notice={name,start:performance.now()};
    canvas.setAttribute('aria-label',name==='mcNoMoreVowels'?'No more vowels':'Only vowels remain');
    const entry=this.noticeData[name];
    canvas.width=entry.width;canvas.height=entry.height;
    canvas.hidden=false;
  }
  drawNotice(time){
    if(!this.notice)return;
    const {name,start}=this.notice,entry=this.noticeData[name],i=noticeFrame(entry,time-start),canvas=document.querySelector('#letter-notice'),c=canvas.getContext('2d');
    if(i===null){canvas.hidden=true;this.notice=null;return;}
    c.clearRect(0,0,canvas.width,canvas.height);c.drawImage(this.noticeImages[name],i%entry.columns*entry.width,Math.floor(i/entry.columns)*entry.height,entry.width,entry.height,0,0,entry.width,entry.height);
  }
  pause(){if(this.pausedAt)return;this.pausedAt=performance.now();this.screenVideos?.forEach(e=>e.video.pause());}
  resume(){
    if(!this.pausedAt)return;const delta=performance.now()-this.pausedAt;
    for(const clip of [this.boardSequence,this.categorySequence,this.spinTween,this.bonusTween,this.notice,...this.actorTimelines.values(),...this.podiums.transitions.filter(Boolean),this.podiums.effect])if(clip)clip.start+=delta;
    this.pausedAt=null;this.screenVideos.get(this.screenMovie)?.video.play().catch(()=>{});
  }
  playSetCategory(category){
    if(!this.actorTimelines)return;
    this.setCategory=category;
    for(const entry of this.animationData.categories[category]??[]){
      const clip=this.animationData.clips[entry.actor]?.[entry.clip];
      if(clip)this.actorTimelines.set(entry.actor,{clip,start:performance.now(),clamp:animationClamped(category,entry)});
    }
  }
  animateSet(time){
    if(!this.actorTimelines)return;
    for(const [actor,timeline] of this.actorTimelines){
      const t=clipTime(timeline.clip,(time-timeline.start)/1000,timeline.clamp);
      for(const binding of this.animationBindings.filter(b=>b.actor===actor)){
        const desc={...binding.desc,translation:[...binding.desc.translation],scale:[...binding.desc.scale]};
        for(const track of timeline.clip.tracks.filter(k=>k.node===binding.node&&k.controller==='NiTextureTransformController'&&k.variable.startsWith(`0-${binding.slot}-`))){
          const v=sampleScalar(track.scalar,t,track.constant),op=track.variable.split('TT_')[1];
          if(op==='TRANSLATE_U')desc.translation[0]=v;
          if(op==='TRANSLATE_V')desc.translation[1]=v;
          if(op==='SCALE_U')desc.scale[0]=v;
          if(op==='SCALE_V')desc.scale[1]=v;
          if(op==='ROTATE')desc.rotation=v;
        }
        binding.texture.matrix.set(...textureMatrix(desc));
      }
      for(const track of timeline.clip.tracks.filter(k=>k.controller==='NiAlphaController')){
        const mesh=this.actorRoots.get(actor).getObjectByName(track.node);
        if(mesh?.isMesh){mesh.material.opacity=sampleScalar(track.scalar,t,track.constant);mesh.material.transparent=true;mesh.material.depthWrite=false;}
      }
    }
  }
  spin(index,wedges,onTick) {
    this.drawWheel();
    // Stop at the selected wedge under the first original flipper.
    const flippers=[[6.755,-1.713],[7.18,-1.153],[7.214,-.427]];
    const [px,pz]=flippers[this.game.player.slot];
    const pointer=Math.atan2(pz-this.wheelGroup.position.z,px-this.wheelGroup.position.x);
    const target=wheelLandingAngle(index,pointer,this.game.state.landingThird??0)%(Math.PI*2);
    const current=((this.wheelAngle%(Math.PI*2))+Math.PI*2)%(Math.PI*2);
    const delta=((target-current)%(Math.PI*2)+Math.PI*2)%(Math.PI*2);
    const source=this.sceneData[this.stage]?.spin?.MinTime?this.sceneData[this.stage].spin:this.sceneData.base.spin;
    const power=(this.game.state.spinPower??55)/100;
    const duration=(Number(source.MinTime)+(Number(source.MaxTime)-Number(source.MinTime))*power)*1000;
    const turns=3+Math.round(power*4);
    return new Promise(resolve=>{this.spinTween={start:performance.now(),duration,from:this.wheelAngle,to:this.wheelAngle+Math.PI*2*turns+delta,resolve,onTick,lastIndex:-1};});
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
    if(this.pausedAt){this.renderScene();return;}
    this.onFrame?.(time);this.drawNotice(time);
    this.animateSet(time);
    if(this.podiums?.draw(time))this.podiumCanvas.texture.needsUpdate=true;
    if(this.boardSequence&&!this.boardSequence.done&&time-(this.boardDrawTime??0)>30){const seq=this.boardSequence;for(const tile of seq.tiles)if(tile.kind==='letter'&&!tile.sounded&&time-seq.start>=tile.at){tile.sounded=true;if(seq.duration>300)this.onLetterRevealed?.(tile.index);}this.drawBoard(this.boardState,time);this.boardDrawTime=time;this.boardSequence.done=time-this.boardSequence.start>=this.boardSequence.duration;}
    if(this.categorySequence)this.drawCategory(time);
    if(this.spinTween){const spin=this.spinTween;const t=Math.min(1,(time-spin.start)/spin.duration);this.wheelAngle=THREE.MathUtils.lerp(spin.from,spin.to,1-Math.pow(1-t,4));this.wheelGroup.rotation.y=this.wheelAngle;const index=Math.floor(this.wheelAngle/(Math.PI*2/72));if(index!==spin.lastIndex){spin.onTick?.();spin.lastIndex=index;}if(t===1){this.spinTween=null;spin.resolve();}}
    if(this.bonusTween){const spin=this.bonusTween,t=Math.min(1,(time-spin.start)/4200);this.bonusRoot.rotation.y=THREE.MathUtils.lerp(spin.from,spin.to,1-Math.pow(1-t,4));const index=Math.floor(this.bonusRoot.rotation.y/.3);if(index!==spin.lastIndex){spin.onTick?.();spin.lastIndex=index;}if(t===1){this.bonusTween=null;spin.resolve();}}
    if(this.controls.enabled)this.controls.update();this.renderScene();this.frameCount++;
  }
  renderScene(){
    this.renderer.render(this.scene,this.camera);
    if(this.moviePlane?.visible){this.renderer.autoClear=false;this.renderer.clearDepth();this.renderer.render(this.movieScene,this.movieCamera);this.renderer.autoClear=true;}
  }
  diagnostics(){return {stage:this.stage,view:this.view,frames:this.frameCount,drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,boardBounds:this.boardBounds,retailFont:document.fonts.check('96px "Retail Board"'),wheelRound:this.wheelRound,reflectiveFloor:!!this.floorReflection?.visible};}
}
