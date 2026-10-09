"""Sample original NiTransformController camera tracks through their parents."""
import math
import numpy as np
from build_assets import nif,GAME,OUT,write

def vector(value):
    return np.array([value.x,value.y,value.z],dtype=float) if hasattr(value,'x') else np.array([float(value)])

def sample(group,time,fallback):
    keys=list(group.keys)
    if not keys:return fallback
    if time<=keys[0].time:return vector(keys[0].value)
    if time>=keys[-1].time:return vector(keys[-1].value)
    for a,b in zip(keys,keys[1:]):
        if a.time<=time<=b.time:break
    u=(time-a.time)/(b.time-a.time);p=vector(a.value);q=vector(b.value)
    if int(group.interpolation)==2:
        # Gamebryo stores outgoing as Backward and incoming as Forward.
        # Tangents are segment-relative, not derivatives multiplied by duration.
        return (2*u**3-3*u*u+1)*p+(-2*u**3+3*u*u)*q+(u**3-2*u*u+u)*vector(a.backward)+(u**3-u*u)*vector(b.forward)
    if int(group.interpolation)==5:return p if u<.5 else q
    return p+(q-p)*u

def quaternion(value):return np.array([value.x,value.y,value.z,value.w],dtype=float)

def slerp(a,b,u):
    a=a/np.linalg.norm(a);b=b/np.linalg.norm(b);dot=np.dot(a,b)
    if dot<0:b=-b;dot=-dot
    if dot>.9995:r=a+(b-a)*u;return r/np.linalg.norm(r)
    angle=math.acos(np.clip(dot,-1,1));return (a*math.sin((1-u)*angle)+b*math.sin(u*angle))/math.sin(angle)

def rotation(keys,time,fallback):
    keys=list(keys)
    if not keys:return fallback
    if time<=keys[0].time:return quaternion(keys[0].value)
    if time>=keys[-1].time:return quaternion(keys[-1].value)
    for a,b in zip(keys,keys[1:]):
        if a.time<=time<=b.time:break
    return slerp(quaternion(a.value),quaternion(b.value),(time-a.time)/(b.time-a.time))

def matrix(q):
    x,y,z,w=q/np.linalg.norm(q)
    return np.array([[1-2*y*y-2*z*z,2*x*y-2*z*w,2*x*z+2*y*w],
                     [2*x*y+2*z*w,1-2*x*x-2*z*z,2*y*z-2*x*w],
                     [2*x*z-2*y*w,2*y*z+2*x*w,1-2*x*x-2*y*y]]).T

def recover():
    data=nif.load_nif_data(GAME/'data/models/sets/stage5/stage5.nif.soe');parents=nif.build_parent_lookup(data);animations=[]
    for camera in data.blocks:
        if type(camera).__name__!='NiCamera':continue
        chain=[];block=camera
        while block is not None:
            chain.append(block);block=parents.get(id(block))
        controllers={}
        for block in chain:
            c=getattr(block,'controller',None)
            while c:
                if type(c).__name__=='NiTransformController' and getattr(c,'interpolator',None) and c.interpolator.data:controllers[id(block)]=c
                c=getattr(c,'next_controller',None)
        if not controllers:continue
        c=next(iter(controllers.values()));duration=(c.stop_time-c.start_time)/c.frequency;frames=[]
        for wall_time in np.linspace(0,duration,math.ceil(duration*30)+1):
            world=np.eye(4)
            for block in chain:
                local=np.array(block.get_transform().as_list(),dtype=float);controller=controllers.get(id(block))
                if controller:
                    interp=controller.interpolator;keys=interp.data;time=min(controller.stop_time,controller.start_time+wall_time*controller.frequency+controller.phase)
                    translation=sample(keys.translations,time,vector(interp.translation))
                    scale=sample(keys.scales,time,np.array([interp.scale]))[0]
                    q=rotation(keys.quaternion_keys,time,quaternion(interp.rotation))
                    if np.all(np.abs(translation)<1e30):local[3,:3]=translation
                    if np.all(np.abs(q)<1e30) and np.linalg.norm(q)>0:local[:3,:3]=matrix(q)*(scale if abs(scale)<1e30 else block.scale)
                world=world@local
            basis=world[:3,:3];basis=basis/np.linalg.norm(basis,axis=1)[:,None]
            frames.append(dict(time=float(wall_time),position=world[3,:3].tolist(),forward=basis[0].tolist(),up=basis[1].tolist()))
        name=nif.decode_name(camera.name,'');animations.append(dict(name=name,duration=float(duration),frequency=float(c.frequency),frames=frames))
        source=nif.world_matrix(camera,parents,{})
        print(name,'seconds',round(duration,3),'samples',len(frames),'start/rest position delta',round(float(np.linalg.norm(source[3,:3]-frames[0]['position'])),4),flush=True)
    write(OUT/'camera-animations.json',dict(source='NiTransformController / NiTransformData',sampleRate=30,animations=animations))
    return animations

if __name__=='__main__':recover()
