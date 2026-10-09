import * as THREE from 'three';
import {Reflector} from 'three/addons/objects/Reflector.js';

export class StudioReflections{
  constructor(studio){
    this.studio=studio;this.planes=[];this.shiny=[];this.enabled=true;
    this.black=new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1);this.black.needsUpdate=true;
    studio.root.updateMatrixWorld(true);
    for(const mesh of studio.meshes.filter(m=>/^floor_(top|mid|bottom)Shape$/.test(m.name)))this.addFloor(mesh);
    this.captureEnvironment();
  }
  addFloor(mesh){
    const bounds=new THREE.Box3().setFromObject(mesh),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    const resolution=innerWidth<800?384:768;
    const reflector=new Reflector(new THREE.PlaneGeometry(size.x,size.z),{textureWidth:resolution,textureHeight:resolution,clipBias:.00005,multisample:0});
    reflector.name=mesh.name+'_planar_capture';reflector.rotation.x=-Math.PI/2;reflector.position.set(center.x,center.y,center.z);
    // The capture plane never draws a rectangle over the authored floor outline.
    reflector.material.colorWrite=false;reflector.material.depthWrite=false;reflector.renderOrder=-20;
    this.studio.scene.add(reflector);
    const strength={floor_topShape:.5,floor_midShape:.65,floor_bottomShape:.8}[mesh.name];
    const uniforms={studioReflectionMap:{value:reflector.getRenderTarget().texture},studioReflectionMatrix:{value:new THREE.Matrix4()},studioReflectionStrength:{value:strength}};
    const material=mesh.material.clone();mesh.material=material;
    material.userData.planarReflection={height:center.y,strength,sourceGloss:material.userData.nif_gloss_texture};
    material.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,uniforms);
      shader.vertexShader='uniform mat4 studioReflectionMatrix;\nvarying vec4 vStudioReflection;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nvStudioReflection = studioReflectionMatrix * modelMatrix * vec4(transformed, 1.0);');
      shader.fragmentShader='uniform sampler2D studioReflectionMap;\nuniform float studioReflectionStrength;\nvarying vec4 vStudioReflection;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
        vec3 reflectedStudio = texture2DProj(studioReflectionMap, vStudioReflection).rgb;
        float grazing = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 5.0);
        float floorGloss = 0.35 + 0.65 * (1.0 - roughnessFactor);
        float reflectedAmount = studioReflectionStrength * floorGloss * (0.75 + 0.25 * grazing);
        outgoingLight = mix(outgoingLight, reflectedStudio * (0.8 + 0.2 * diffuseColor.rgb), reflectedAmount);
        #include <opaque_fragment>
      `);
    };
    material.customProgramCacheKey=()=> 'jeopardy-authored-floor-reflection-v1';
    const entry={mesh,reflector,uniforms,strength,lastCapture:-Infinity};this.planes.push(entry);
    const capture=reflector.onBeforeRender;
    reflector.onBeforeRender=(renderer,scene,camera)=>{
      const now=performance.now();if(!this.enabled||now-entry.lastCapture<65)return;
      this.withoutReflections(()=>capture.call(reflector,renderer,scene,camera),reflector);
      uniforms.studioReflectionMatrix.value.copy(reflector.material.uniforms.textureMatrix.value).multiply(reflector.matrixWorld.clone().invert());
      entry.lastCapture=now;
    };
  }
  withoutReflections(callback,current=null){
    const visible=this.planes.map(p=>p.reflector.visible);
    for(const p of this.planes){
      if(p.reflector!==current)p.reflector.visible=false;
      // Prevent both recursive captures and sampling the texture being rendered.
      p.uniforms.studioReflectionMap.value=this.black;p.uniforms.studioReflectionStrength.value=0;
    }
    try{return callback();}finally{
      this.planes.forEach((p,i)=>{p.reflector.visible=visible[i];p.uniforms.studioReflectionMap.value=p.reflector.getRenderTarget().texture;p.uniforms.studioReflectionStrength.value=this.enabled?p.strength:0;});
    }
  }
  captureEnvironment(){
    const target=new THREE.WebGLCubeRenderTarget(256,{type:THREE.HalfFloatType});
    const camera=new THREE.CubeCamera(5,5000,target);camera.position.set(-100,150,80);
    this.withoutReflections(()=>camera.update(this.studio.renderer,this.studio.scene));
    const pmrem=new THREE.PMREMGenerator(this.studio.renderer);this.environment=pmrem.fromCubemap(target.texture);pmrem.dispose();target.dispose();
    const processed=new Set();
    for(const mesh of this.studio.meshes){
      const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
      for(const material of materials){
        if(processed.has(material))continue;processed.add(material);
        const source=material.userData,gloss=source.nif_gloss_texture??'',base=source.nif_base_texture??'';
        if(!material.isMeshStandardMaterial||source.planarReflection||!gloss||/black\.tga|_em\./i.test(gloss)||/screen|floor|tileboard|podiums/i.test(base))continue;
        const original={roughness:material.roughness,metalness:material.metalness,envMap:material.envMap,envMapIntensity:material.envMapIntensity};
        const metallic=/gold|silver|copper|metal|plate/i.test(base);
        this.shiny.push({material,original,roughness:metallic?.45:.6,metalness:metallic?.6:0});
      }
    }
    this.setEnabled(true);
  }
  setEnabled(enabled){
    this.enabled=enabled;
    for(const p of this.planes){p.reflector.visible=enabled;p.uniforms.studioReflectionStrength.value=enabled?p.strength:0;p.lastCapture=-Infinity;}
    for(const s of this.shiny){
      if(enabled){s.material.envMap=this.environment.texture;s.material.envMapIntensity=.85;s.material.roughness=s.roughness;s.material.metalness=s.metalness;}
      else Object.assign(s.material,s.original);
      s.material.needsUpdate=true;
    }
  }
}
