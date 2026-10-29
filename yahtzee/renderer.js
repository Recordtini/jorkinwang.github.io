// Browser GPU adapter; geometry/camera come from the source export, motion from Rust.
export async function createRenderer(canvas,engine){
  const response=await fetch('assets/classic.json');if(!response.ok)throw Error('Could not load original dice geometry');
  const data=await response.json();const gl=canvas.getContext('webgl',{alpha:true,antialias:false,preserveDrawingBuffer:true});
  if(!gl)throw Error('This browser needs WebGL to draw the original dice.');
  const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
  const program=gl.createProgram();
  gl.attachShader(program,shader(gl.VERTEX_SHADER,`
    attribute vec3 position;attribute vec2 uv;attribute float brightness;
    uniform mat4 model;uniform vec3 eye,right,up,forward;uniform vec2 windowSize;
    varying vec2 texcoord;varying float light;
    void main(){vec3 world=(model*vec4(position,1.)).xyz;vec3 p=world-eye;
      float z=dot(p,forward);gl_Position=vec4(-dot(p,right)/windowSize.x,dot(p,up)/windowSize.y,1.020202*z-2.020202,z);
      light=brightness;texcoord=uv;
    }`));
  gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`
    precision mediump float;uniform sampler2D image;uniform bool textured;uniform vec3 color;
    varying vec2 texcoord;varying float light;
    void main(){gl_FragColor=vec4((textured?texture2D(image,texcoord).rgb:color)*light,1.);}`));
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
  const u=Object.fromEntries(['model','eye','right','up','forward','windowSize','color','textured','image'].map(n=>[n,gl.getUniformLocation(program,n)]));
  const m=data.camera_matrix_q16.map(row=>row.map(v=>v/65536));
  for(const[n,r]of [['right',0],['up',1],['forward',2],['eye',3]])gl.uniform3fv(u[n],m[r]);
  gl.uniform2fv(u.windowSize,data.view_window);gl.uniform1i(u.image,0);
  const groups=[];
  for(const[owner,mesh]of [data,data.cup].entries())for(const triangle of mesh.triangles){
    const key=JSON.stringify([owner,triangle.texture,triangle.color,triangle.surface]);let g=groups.find(g=>g.key===key);
    if(!g){g={key,owner,...triangle,values:[],vertices:[]};groups.push(g);}
    for(const i of triangle.indices){const v=mesh.vertices[i];g.vertices.push(v);g.values.push(...v.position,...v.uv);}
  }
  for(const g of groups){
    g.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,g.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(g.values),gl.STATIC_DRAW);g.lightBuffer=gl.createBuffer();
    if(g.texture){
      const img=new Image();img.src='assets/'+g.texture;await img.decode();g.gpuTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,g.gpuTexture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,img);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);const wrap=(img.width&(img.width-1))===0&&(img.height&(img.height-1))===0?gl.REPEAT:gl.CLAMP_TO_EDGE;gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,wrap);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,wrap);
    }
  }
  const attributes=['position','uv','brightness'].map(n=>gl.getAttribLocation(program,n));attributes.forEach(a=>gl.enableVertexAttribArray(a));
  // RWX20 1002cee0/10047000 reject back faces for the cup's default material
  // mode. Browser front-facing CCW matches the original screen-space test.
  gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.frontFace(gl.CCW);gl.clearColor(0,0,0,0);const boxes=[];
  function project(p){const v=p.map((v,i)=>v-m[3][i]);const dot=r=>v.reduce((s,v,i)=>s+v*m[r][i],0);return[320*(1-dot(0)/dot(2)/data.view_window[0]),240*(1-dot(1)/dot(2)/data.view_window[1])];}
  function draw(){
    gl.viewport(0,0,640,480);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);boxes.length=0;
    for(let i=0;i<6;i++){
      if(i<5&&engine.game_cup(12)&&!engine.game_die(i,13))continue;
      const get=i===5?k=>engine.game_cup(k):k=>engine.game_die(i,k);
      const mesh=i===5?data.cup:data;
      const p=[0,1,2].map(get);const r=Array.from({length:9},(_,k)=>get(k+3));
      const model=[...r.slice(0,3),0,...r.slice(3,6),0,...r.slice(6,9),0,...p,1];gl.uniformMatrix4fv(u.model,false,model);
      const vertices=mesh.vertices.map(v=>project([0,1,2].map(k=>p[k]+v.position.reduce((s,v,j)=>s+v*r[j*3+k],0))));
      boxes.push({i,minX:Math.min(...vertices.map(v=>v[0])),maxX:Math.max(...vertices.map(v=>v[0])),minY:Math.min(...vertices.map(v=>v[1])),maxY:Math.max(...vertices.map(v=>v[1]))});
      for(const g of groups){
        if(g.owner!==(i===5?1:0))continue;
        gl.bindBuffer(gl.ARRAY_BUFFER,g.buffer);gl.vertexAttribPointer(attributes[0],3,gl.FLOAT,false,20,0);gl.vertexAttribPointer(attributes[1],2,gl.FLOAT,false,20,12);
        const brightness=new Float32Array(g.vertices.map(v=>engine.game_vertex_light(i,...v.normal.map(n=>Math.trunc(n*65536)),...v.surface)/(31*65536)));
        gl.bindBuffer(gl.ARRAY_BUFFER,g.lightBuffer);gl.bufferData(gl.ARRAY_BUFFER,brightness,gl.DYNAMIC_DRAW);gl.vertexAttribPointer(attributes[2],1,gl.FLOAT,false,4,0);
        gl.uniform3fv(u.color,g.color);gl.uniform1i(u.textured,!!g.gpuTexture);if(g.gpuTexture)gl.bindTexture(gl.TEXTURE_2D,g.gpuTexture);gl.drawArrays(gl.TRIANGLES,0,g.values.length/5);
      }
    }
  }
  return{draw,pick(x,y){return boxes.find(b=>x>=b.minX-3&&x<=b.maxX+3&&y>=b.minY-3&&y<=b.maxY+3)?.i;},boxes};
}
