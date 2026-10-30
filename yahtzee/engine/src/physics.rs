//! Classic retail roll path: 00411740, 004113a0, 0040c1c0, 0040c440,
//! 0040bd30, 0040bb30, 0040c4d0. Original per-die update order is retained.
use crate::{die::{cube_face,pyramid_face,pyramid_settle},matrix::Matrix,rng::RetailRandom,retail_constants::*};

/// Rectangular arena selected by Triple's original initializer 00402d40.
/// Returns the boundary vector from 0040b610 (zero means no contact).
pub fn triple_boundary(position:[f32;3],velocity_z:f32)->[f32;3]{
    rectangular_boundary(position,velocity_z,[-4.2,4.,-3.9,4.5])
}
pub fn painted_boundary(position:[f32;3],velocity_z:f32)->[f32;3]{
    rectangular_boundary(position,velocity_z,[-3.,3.,-3.4,4.])
}
pub fn battle_boundary(position:[f32;3],velocity_z:f32,wide:bool)->[f32;3]{
    rectangular_boundary(position,velocity_z,[-3.,3.,-3.4,if wide{6.}else{3.}])
}
pub fn pyramid_boundary(position:[f32;3],velocity_z:f32)->[f32;3]{
    let [x,y,z]=position;let mut out=[0.;3];if y.to_bits()>0x80000000{out[1]=0.1;}
    if z>2.2f32{out[2]=2.2;}if z< -3.&&((y.to_bits() as i32)<0x40400000||velocity_z.to_bits()>0x80000000){out[2]=-3.;}
    let edge=z as f64*-0.5+1.2;if edge<x as f64{out[0]=edge as f32;out[2]=z;}if -edge>x as f64{out[0]=-edge as f32;out[2]=z;}out
}
fn rectangular_boundary(position:[f32;3],velocity_z:f32,bounds:[f32;4])->[f32;3]{
    let [x,y,z]=position;
    let mut out=[0.;3];
    if y.to_bits()>0x80000000{out[1]=0.1;}
    if x < bounds[0] {out[0]=bounds[0];}
    if x > bounds[1] {out[0]=bounds[1];}
    if z < bounds[2] && ((y.to_bits() as i32)<0x40400000 || velocity_z.to_bits()>0x80000000){out[2]=bounds[2];}
    if z > bounds[3] {out[2]=bounds[3];}
    out
}

#[derive(Clone,Debug)]
pub struct Die {
    pub position:[f32;3],pub velocity:[f32;3],pub orientation:Matrix,pub spin:Matrix,
    pub world:Matrix,pub world_position:[f32;3],pub sleeping:bool,pub held:bool,pub face:u8,pub rotations:u32,
    pub saved_position:[f32;3],pub rack:Option<usize>,pub pyramid:bool,
}
impl Die {
    fn new(face:u8)->Self{
        let mut d=Self{position:[0.;3],velocity:[0.;3],orientation:Matrix::default(),spin:Matrix::default(),world:Matrix::default(),world_position:[0.;3],sleeping:false,held:false,face,rotations:0,saved_position:[0.;3],rack:None,pyramid:false};
        d.settle(face,0.);d
    }
    fn read_face(&self)->u8{if self.held||self.sleeping{self.face}else if self.pyramid{pyramid_face(self.orientation)}else{cube_face(self.world.0[0],self.world.0[1])}}
    fn settle(&mut self,face:u8,yaw:f32){
        self.settle_tilt(face,yaw,0.);
    }
    fn settle_tilt(&mut self,face:u8,yaw:f32,tilt:f32){
        if self.pyramid{self.orientation=pyramid_settle(self.orientation,face,yaw);self.face=face;return}
        self.orientation.rotate([0,65536,0],(yaw as f64*C00426198 as f64)as i32,1);
        if tilt!=0.{self.orientation.rotate([65536,0,0],(tilt as f64*C00426198 as f64)as i32,2);}
        match face{2=>self.orientation.rotate([65536,0,0],90*65536,2),3=>self.orientation.rotate([0,0,65536],-90*65536,2),4=>self.orientation.rotate([0,0,65536],90*65536,2),5=>self.orientation.rotate([65536,0,0],-90*65536,2),6=>self.orientation.rotate([65536,0,0],180*65536,2),_=>()};
        self.face=face;
    }
    fn yaw(&self,face:u8)->f32{
        if self.pyramid{return 0.}
        if face==3||face==4{let v=self.orientation.0[2];((v[0]as f64).atan2(v[2]as f64)*C00426190)as f32}
        else{let v=self.orientation.0[0];((v[2]as f64).atan2(v[0]as f64)*C00426218)as f32}
    }
    fn boundary(&self)->[f32;3]{
        let mut out=[0.;3];if self.position[1].to_bits()>0x80000000{out[1]=C004261B8 as f32;}
        let radius=((self.position[2]as f64).powi(2)+(self.position[0]as f64).powi(2)).sqrt();
        // 0040b6eb compares the x87 result before its subsequent f32 store.
        let r=radius as f32;
        if 8.<radius{out[0]=(self.position[0]as f64/r as f64*8.)as f32;out[2]=(8./r as f64*self.position[2]as f64)as f32;}
        out
    }
    fn overlaps(&self,other:&Self)->bool{
        let d: [f32;3]=std::array::from_fn(|i|self.position[i]-other.position[i]);
        d[1]as f64*d[1]as f64+d[2]as f64*d[2]as f64+d[0]as f64*(d[0]as f64)<C00425348
    }
}

#[derive(Clone)]
pub struct Simulation {pub dice:[Die;5],pub random:RetailRandom,pub render_counter:u32,pub triple_arena:bool,pub painted_arena:bool,pub pyramid_arena:bool,pub sounds:Vec<(u32,u32,u32)>}
impl Simulation {
    pub fn new(seed:u32)->Self{Self{dice:std::array::from_fn(|i|Die::new(i as u8+1)),random:RetailRandom::new(seed),render_counter:0,triple_arena:false,painted_arena:false,pyramid_arena:false,sounds:Vec::new()}}
    fn restitution(&self,i:usize)->f32{if self.pyramid_arena{if i==0{-0.7}else{-0.65}}else if self.painted_arena{-0.7}else{-0.5}}
    fn boundary(&self,i:usize)->[f32;3]{let d=&self.dice[i];if self.pyramid_arena{pyramid_boundary(d.position,d.velocity[2])}else if self.painted_arena{painted_boundary(d.position,d.velocity[2])}else if self.triple_arena{triple_boundary(d.position,d.velocity[2])}else{d.boundary()}}
    fn publish(&mut self,i:usize){
        self.render_counter=self.render_counter.wrapping_add(1);
        self.dice[i].world=if self.render_counter&127!=0{self.dice[i].orientation.ortho()}else{self.dice[i].orientation};
        self.dice[i].world_position=self.dice[i].position.map(|p|((p as f64*65536.)as i32)as f32/65536.);
    }
    pub fn initialize_layout(&mut self){for i in 0..5{self.dice[i].position=[1.5*i as f32-3.25,0.,0.];self.publish(i);}}
    pub fn initialize_pyramid(&mut self){self.pyramid_arena=true;for i in 0..5{let d=&mut self.dice[i];d.pyramid=true;d.orientation=Matrix::default();let face=(i%4+1)as u8;d.settle(face,0.);d.position=if i==0{[-1.,0.,-2.]}else if i==4{[0.5,0.,-2.]}else{[1.5*i as f32-3.25,0.,0.]};self.publish(i);}}
    fn rotation(&mut self,i:usize,axis:[i32;3],angle:i32,mode:u32,spin:bool){
        let d=&mut self.dice[i];if spin{d.spin.rotate(axis,angle,mode)}else{d.orientation.rotate(axis,angle,mode)}
        let old=d.rotations;d.rotations=d.rotations.wrapping_add(1);
        if old&63==0{if spin{d.spin=d.spin.ortho()}else{d.orientation=d.orientation.ortho()}}
        d.sleeping=false;
    }
    fn random_axis(&mut self,coefficient:f32)->i32{
        let v=32767-(self.random.next_u31()&65535)as i32;
        (v as f64*coefficient as f64*C00426198 as f64)as i32
    }
    pub fn roll(&mut self){
        self.roll_from([7.4,0.,-7.6]);
    }
    fn roll_from(&mut self,origin:[f32;3]){
        let speed=((self.random.next_u31()&127)+100)as f64*C00426730 as f64;
        let side=(10-(self.random.next_u31()&63)as i32)as f64*C00426730 as f64;
        self.throw(origin,side as f32,speed as f32);
    }
    pub fn throw(&mut self,origin:[f32;3],side:f32,speed:f32){
        let side=side.clamp(-0.5,0.6);let speed=speed.clamp(0.,0.7);
        let positions=[[0.,0.,0.],[2.,2.,0.],[2.,0.,2.],[-2.,1.,2.],[-1.,0.,0.]];
        for(i,p)in positions.iter().enumerate(){if !self.dice[i].held{
            self.dice[i].position=std::array::from_fn(|a|p[a]+origin[a]);
            let swap=self.random.next_u31()&128!=0;
            for n in 0..2{
                let r=(self.random.next_u31()&65535)as f64;
                let angle=((r*C004267A4 as f64*C004267A8 as f64+C004267AC as f64)*C00426758 as f64)as i32;
                let axis=if(n==0)==swap{[65536,0,0]}else{[0,0,65536]};
                self.rotation(i,axis,angle,if n==0{1}else{3},false);
            }
        }}
        const AXES:[[i32;3];8]=[[65536,0x3333,65536],[0x3333,65536,65536],[65536,0x3333,0x3333],[0,65536,0x8000],[0x3333,65536,65536],[65536,65536,0x3333],[0,0x3333,65536],[65536,0,65536]];
        for i in 0..5{if !self.dice[i].held{
            self.wall(i);self.ground(i);
            let forward=(((self.random.next_u31()&127)+90)as f64*C004267B0 as f64+speed as f64)as f32;
            let sideways=(10-(self.random.next_u31()&63)as i32)as f64*C004267B0 as f64+side as f64;
            self.dice[i].velocity[0]=(sideways*C00426718 as f64+self.dice[i].velocity[0]as f64)as f32;
            self.dice[i].velocity[2]=(forward as f64*C00426718 as f64+self.dice[i].velocity[2]as f64)as f32;
            self.dice[i].sleeping=false;
            let axis=(self.random.next_u31()&7)as usize;
            let angle=(((self.random.next_u31()&127)+80)as f64*C004267B4 as f64*C00426718 as f64*C00426758 as f64)as i32;
            self.rotation(i,AXES[axis],angle,3,true);self.publish(i);
        }}
    }
    fn ground(&mut self,i:usize)->u32{
        if self.dice[i].sleeping||self.dice[i].held{return 0}
        let mut sound=0;
        for a in 0..3{self.dice[i].position[a]+=self.dice[i].velocity[a];}
        self.dice[i].orientation=self.dice[i].orientation.combine(self.dice[i].spin);self.publish(i);
        if self.dice[i].position[1].to_bits()>0x80000000{
            self.dice[i].position[1]=0.;self.dice[i].velocity[1]*=self.restitution(i);
            sound=(self.dice[i].velocity[1].abs() as f64*C004261D0) as u32;
            let face=self.dice[i].read_face();let yaw=self.dice[i].yaw(face);self.dice[i].settle(face,yaw);
            if self.dice[i].velocity[1]as f64>C004261D8{
                let v=self.dice[i].spin.vector([65536,0,0]);
                for a in [0,2]{self.dice[i].velocity[a]=(self.dice[i].velocity[a]as f64*C004261E8)as f32;}
                if self.dice[i].velocity[1]as f64>=C004261F0{
                    let angle=self.random_axis(C004261A0);let z=self.random_axis(C004261A0);let y=self.random_axis(C004261A0);let x=self.random_axis(C004261A0);
                    self.dice[i].spin.rotate([x,y,z],angle,3);
                }else{
                    self.dice[i].spin=Matrix::default();
                    let angle=((v[2]as f64).atan2(v[0]as f64)*C004261F8*C00426200*C00426198 as f64)as i32;
                    self.dice[i].spin.rotate([0,65536,0],angle,1);
                }
            }else{
                self.dice[i].spin=Matrix::default();self.publish(i);self.dice[i].velocity[1]=0.;self.dice[i].position[1]=0.;
                let friction=if self.triple_arena{f32::from_bits(0x3f6147ae)}else{f32::from_bits(0x3f4ccccd)};
                for a in [0,2]{self.dice[i].velocity[a]*=friction;}
                if self.dice[i].velocity[0]as f64<=C004261E0&&self.dice[i].velocity[2]as f64<=C004261E0{
                    self.dice[i].face=self.dice[i].read_face();self.dice[i].sleeping=true;self.dice[i].velocity=[0.;3];
                }
            }
        }
        self.dice[i].velocity[1]=(self.dice[i].velocity[1]as f64-C00426208)as f32;
        sound.min(127)
    }
    fn wall(&mut self,i:usize)->u32{
        let p=self.boundary(i);let restitution=self.restitution(i);if p[0]!=0.{self.dice[i].position[0]=p[0];self.dice[i].velocity[0]*=restitution;}
        if p[2]!=0.{self.dice[i].position[2]=p[2];if p[2]>0.||self.dice[i].velocity[2]<0.{self.dice[i].velocity[2]*=restitution;}}
        let x=if p[0]!=0.{(self.dice[i].velocity[0].abs() as f64*C004261D0) as u32}else{0};
        let z=if p[2]!=0.{(self.dice[i].velocity[2].abs() as f64*C004261D0) as u32}else{0};
        (x+z).min(127)
    }
    fn vertical_contact(&mut self,this:usize,a:usize,b:usize,offset:[f32;3],boundary:[f32;3]){
        self.dice[a].velocity[1]=(self.dice[b].velocity[1]as f64*C00426170)as f32;
        let r=(self.random.next_u31()&255)as f64;
        let restitution=self.restitution(this) as f64;
        self.dice[b].velocity[1]=((C00426180 as f64-r*C0042617C as f64)*restitution*self.dice[b].velocity[1]as f64)as f32;
        self.dice[b].position[1]=(offset[1]as f64*C00426184 as f64+self.dice[b].position[1]as f64)as f32;
        self.dice[a].position[1]=boundary[1];
        for axis in [0,2]{
            self.dice[b].velocity[axis]=((self.dice[a].position[axis]as f64-self.dice[b].position[axis]as f64)*C00426188 as f64+self.dice[b].velocity[axis]as f64)as f32;
            self.dice[a].velocity[axis]=(self.dice[a].velocity[axis]as f64-self.dice[b].velocity[axis]as f64*restitution)as f32;
        }
        let angle=((self.dice[b].position[0]as f64-self.dice[a].position[0]as f64).atan2(self.dice[b].position[2]as f64-self.dice[a].position[2]as f64)*C00426190)as f32;
        let mut scratch=Matrix::default();scratch.rotate([0,-65536,0],angle as i32,1);
        let axis=scratch.vector([65536,0,0]);
        let spin_angle=self.random_axis(C0042618C);self.dice[b].spin.rotate([axis[0],0,axis[2]],spin_angle,3);
        let angle=self.random_axis(C0042619C);let z=self.random_axis(C004261A0);let y=self.random_axis(C004261A4);let x=self.random_axis(C004261A0);
        self.dice[a].spin.rotate([x,y,z],angle,1);
        let _=this; // Each mode's dice share a restitution coefficient.
    }
    fn pair(&mut self,a:usize,b:usize)->bool{
        let restitution=self.restitution(a);
        let mut iterations=0;
        while self.dice[a].overlaps(&self.dice[b])&&iterations<8{
            iterations+=1;self.dice[b].sleeping=false;
            let diff:[f32;3]=std::array::from_fn(|i|self.dice[b].position[i]-self.dice[a].position[i]);
            let length=(diff[1]as f64*diff[1]as f64+diff[2]as f64*diff[2]as f64+diff[0]as f64*diff[0]as f64).sqrt();
            // 0040bda6..0040bdee stores the unit vector, but keeps both
            // the distance and push magnitude in the 53-bit x87 stack.
            let unit=diff.map(|v|(v as f64/length)as f32);
            let push=(C004261A8-length)*C004261B0 as f64+C004261B8;
            let delta:[f32;3]=std::array::from_fn(|i|(unit[i]as f64*push)as f32);
            let delta=delta.map(|d|d.clamp(C004261C0 as f32,C004261B8 as f32));
            for i in 0..3{self.dice[b].position[i]+=delta[i];}
            let boundary_b=self.boundary(b);
            if boundary_b==[0.;3]{
                for i in 0..3{self.dice[a].position[i]-=delta[i];}
                let boundary_a=self.boundary(a);
                if boundary_a==[0.;3]{
                    for i in 0..3{let v=self.dice[a].velocity[i];self.dice[a].velocity[i]=self.dice[b].velocity[i];self.dice[b].velocity[i]=v;}
                    let angle=self.random_axis(C004261A0);let z=self.random_axis(C004261A0);let y=self.random_axis(C004261A0);let x=self.random_axis(C004261A0);
                    self.dice[a].spin.rotate([x,y,z],angle,3);
                }else{
                    if boundary_a[1]!=0.{self.vertical_contact(a,a,b,delta,boundary_a);}
                    if boundary_a[0]!=0.{
                        if(boundary_a[2]<0.&&self.dice[b].velocity[2]<0.)||(boundary_a[2]>0.&&self.dice[b].velocity[2]>0.){
                            self.dice[a].velocity[0]=self.dice[b].velocity[0];self.dice[b].velocity[0]*=restitution;
                        }
                        self.dice[b].position[0]=(delta[0]as f64*C00426180 as f64+self.dice[b].position[0]as f64)as f32;
                        self.dice[a].position[0]=boundary_a[0];
                    }
                    if boundary_a[2]!=0.{self.dice[a].velocity[2]=self.dice[b].velocity[2];self.dice[b].velocity[2]*=restitution;self.dice[b].position[2]=(delta[2]as f64*C00426180 as f64+self.dice[b].position[2]as f64)as f32;self.dice[a].position[2]=boundary_a[2];}
                    for i in 0..3{self.dice[b].position[i]-=delta[i];}
                }
            }else{
                if boundary_b[1]!=0.{self.vertical_contact(a,b,a,delta,boundary_b);}
                if boundary_b[0]!=0.{
                    if(boundary_b[0]<0.&&self.dice[b].velocity[0]<0.)||(boundary_b[0]>0.&&self.dice[b].velocity[0]>0.){self.dice[b].velocity[0]=self.dice[a].velocity[0];}
                    self.dice[a].velocity[0]*=restitution;self.dice[a].position[0]=(delta[0]as f64*C00426184 as f64+self.dice[a].position[0]as f64)as f32;self.dice[b].position[0]=boundary_b[0];
                }
                if boundary_b[2]!=0.{
                    if(boundary_b[2]<0.&&self.dice[b].velocity[2]<0.)||(boundary_b[2]>0.&&self.dice[b].velocity[2]>0.){self.dice[b].velocity[2]=self.dice[a].velocity[2];self.dice[a].velocity[2]*=restitution;}
                    self.dice[a].position[2]=(delta[2]as f64*C00426184 as f64+self.dice[a].position[2]as f64)as f32;self.dice[b].position[2]=boundary_b[2];
                }
                for i in 0..3{self.dice[b].position[i]-=delta[i];}
            }
        }
        for i in [a,b]{if self.boundary(i)!=[0.;3]{self.dice[i].velocity[2]=if self.dice[i].position[2]>0.{-0.08}else{0.08};}}
        iterations!=0
    }
    pub fn step(&mut self){self.step_batch(1);}
    /// 004113a0 runs all substeps for one die before advancing to the next,
    /// then emits only the last substep's impact values for that die.
    pub fn step_batch(&mut self,steps:u32){for i in 0..5{
        let(mut ground,mut wall,mut collisions)=(0,0,0);
        for _ in 0..steps{
            ground=self.ground(i);wall=self.wall(i);collisions=0;
            if !self.dice[i].held{for j in 0..5{if i!=j&&!self.dice[j].held&&self.pair(i,j){collisions+=40;}}}
        }
        if ground>0{self.sounds.push((1,i as u32,ground));}if wall>0{self.sounds.push((2,i as u32,wall));}if collisions>0{self.sounds.push((3,i as u32,collisions.min(127)));}
    }}
    pub fn settled(&self)->bool{self.dice.iter().all(|d|d.sleeping||d.held)}
    pub fn faces(&self)->[u8;5]{std::array::from_fn(|i|self.dice[i].read_face())}
    /// Rack coordinates/angles: YAHTZEE.EXE 0042c0d8; hold/unhold 00412540.
    pub fn toggle_hold(&mut self,i:usize){
        const RACK:[[f32;5];5]=[[-3.15,5.7,8.35,-19.4,-20.2],[-4.6,5.7,7.87,-24.2,-20.2],[-6.01,5.7,7.18,-31.2,-20.2],[-7.33,5.7,6.37,-35.8,-20.2],[-8.57,5.7,5.38,-43.2,-20.2]];
        const TRIPLE_RACK:[[f32;5];5]=[[6.99,3.09,-5.93,0.,0.],[6.99,3.39,-4.76,0.,0.],[6.99,3.69,-3.64,0.,0.],[6.99,3.89,-2.37,0.,0.],[6.99,4.09,-1.25,0.,0.]];
        const PAINTED_RACK:[[f32;5];5]=[[-5.92,4.63,2.61,-99.6,-55.],[-5.69,4.61,1.22,-90.6,-55.],[-5.91,4.25,0.10,-83.4,-55.],[-6.12,4.38,-1.38,-73.8,-55.],[-7.07,3.56,-2.41,-75.6,-55.]];
        const PYRAMID_RACK:[[f32;5];5]=[[1.66,3.59,1.51,-24.,0.],[2.08,3.59,0.51,-24.,0.],[2.5,3.59,-0.45,-24.,0.],[2.91,3.59,-1.4,-24.,0.],[3.31,3.59,-2.37,-24.,0.]];
        let rack=if self.pyramid_arena{&PYRAMID_RACK}else if self.painted_arena{&PAINTED_RACK}else if self.triple_arena{&TRIPLE_RACK}else{&RACK};
        let face=self.dice[i].read_face();
        if !self.dice[i].held{
            let slot=(0..5).find(|s|!self.dice.iter().any(|d|d.rack==Some(*s))).unwrap();
            let d=&mut self.dice[i];d.saved_position=d.position;d.held=true;d.rack=Some(slot);d.position=[rack[slot][0],rack[slot][1],rack[slot][2]];
            self.publish(i); // 00411650 publishes the moved clump first.
            self.dice[i].settle_tilt(face,rack[slot][3],rack[slot][4]);
        }else{
            let d=&mut self.dice[i];d.position=d.saved_position;d.held=false;d.rack=None;
            self.publish(i); // 0040c8b0 restores and publishes before settling.
            self.dice[i].settle(face,0.);
            let(mut x,mut z)=(-5.,-5.);
            while !self.valid_placement(i){
                x+=1.;if x>5.{z+=1.;x=-5.;}
                if z>5.{self.dice[i].position=[0.;3];break}
                self.dice[i].position=[x,0.,z];
            }
        }
        self.publish(i);
    }
    fn valid_placement(&mut self,i:usize)->bool{
        if self.boundary(i)!=[0.;3]{return false}
        for j in 0..5{if i!=j&&self.pair(i,j){return false}}
        true
    }
}

#[cfg(test)]mod tests{
    #[test]fn original_triple_boundary(){
        for (i,b) in include_bytes!("../evidence/triple-boundary.bin").chunks_exact(32).enumerate(){
            let f=|n:usize| f32::from_le_bytes(b[n*4..n*4+4].try_into().unwrap());
            let result=super::triple_boundary([f(0),f(1),f(2)],f(3));
            assert_eq!(result.map(f32::to_bits),[f(5),f(6),f(7)].map(f32::to_bits),"case {i}");
            assert_eq!(result.iter().any(|&x|x!=0.) as u32,u32::from_le_bytes(b[16..20].try_into().unwrap()),"case {i}");
        }
    }
    #[test]fn original_painted_boundary(){
        for (i,b) in include_bytes!("../evidence/painted-boundary.bin").chunks_exact(32).enumerate(){
            let f=|n:usize| f32::from_le_bytes(b[n*4..n*4+4].try_into().unwrap());
            let result=super::painted_boundary([f(0),f(1),f(2)],f(3));
            assert_eq!(result.map(f32::to_bits),[f(5),f(6),f(7)].map(f32::to_bits),"case {i}");
        }
    }
    #[test]fn original_battle_boundaries(){
        for(wide,bytes)in [(false,include_bytes!("../evidence/battle-boundary.bin").as_slice()),(true,include_bytes!("../evidence/battle-wide-boundary.bin").as_slice())]{
            for(i,b)in bytes.chunks_exact(32).enumerate(){let f=|n:usize|f32::from_le_bytes(b[n*4..n*4+4].try_into().unwrap());let out=super::battle_boundary([f(0),f(1),f(2)],f(3),wide);assert_eq!(out.map(f32::to_bits),[f(5),f(6),f(7)].map(f32::to_bits),"wide {wide} case {i}");}
        }
    }
    #[test]fn original_pyramid_boundary(){
        for(i,b)in include_bytes!("../evidence/pyramid-boundary.bin").chunks_exact(32).enumerate(){let f=|n:usize|f32::from_le_bytes(b[n*4..n*4+4].try_into().unwrap());let out=super::pyramid_boundary([f(0),f(1),f(2)],f(3));assert_eq!(out.map(f32::to_bits),[f(5),f(6),f(7)].map(f32::to_bits),"case {i}");}
    }
    use super::*;
    #[test]fn original_first_frame(){
        let mut s=Simulation::new(1);s.roll();
        for(record,b)in include_bytes!("../evidence/first-frame.bin").chunks_exact(728).enumerate(){
            let i=b[1]as usize;let j=b[2]as usize;
            match b[0]{0=>{s.ground(i);},1=>{s.wall(i);},2=>{s.pair(i,j);},_=>unreachable!()}
            for k in 0..5{for a in 0..6{let offset=4+k*144+a*4;let expected=f32::from_le_bytes(b[offset..offset+4].try_into().unwrap());let actual=if a<3{s.dice[k].position[a]}else{s.dice[k].velocity[a-3]};assert!((actual-expected).abs()<0.00001,"event {record} {}({i},{j}), die {k} value{a}: {} != {expected}",b[0],actual);}}
        }
    }
    fn compare_rolls(fixture:&[u8],mode:u8){
        let mut offset=0;
        while offset<fixture.len(){
            let seed=u32::from_le_bytes(fixture[offset..offset+4].try_into().unwrap());let frames=u32::from_le_bytes(fixture[offset+4..offset+8].try_into().unwrap())as usize;offset+=8;
            let mut simulation=Simulation::new(seed);simulation.triple_arena=mode==1;simulation.painted_arena=mode==2;if mode==3{simulation.initialize_pyramid();}simulation.roll_from(match mode{1=>[1.8,6.,-7.],2=>[2.,6.5,-8.],3=>[1.,3.5,-6.],_=>[7.4,0.,-7.6]});
            for frame in 0..frames{
                let record=&fixture[offset..offset+724];offset+=724;
                for i in 0..5{
                    let r=&record[i*144..(i+1)*144];let f=|n:usize|f32::from_le_bytes(r[n*4..n*4+4].try_into().unwrap());let word=|n:usize|i32::from_le_bytes(r[n*4..n*4+4].try_into().unwrap());
                    let d=&simulation.dice[i];
                    for axis in 0..3{assert!((d.position[axis]-f(axis)).abs()<0.00002,"seed {seed} frame {frame} die {i} position {axis}: {} != {}",d.position[axis],f(axis));assert!((d.velocity[axis]-f(axis+3)).abs()<0.00002,"seed {seed} frame {frame} die {i} velocity {axis}: {} != {}",d.velocity[axis],f(axis+3));}
                    assert_eq!(d.sleeping,word(6)!=0,"seed {seed} frame {frame} die {i} sleep");
                    assert_eq!(d.face,word(7)as u8,"seed {seed} frame {frame} die {i} face");
                    assert_eq!(d.rotations,word(8)as u32,"seed {seed} frame {frame} die {i} rotations");
                    for(m,matrix)in [d.orientation,d.spin,d.world].iter().enumerate(){for a in 0..3{for b in 0..3{let expected=word(9+m*9+a*3+b);assert!((matrix.0[a][b]-expected).abs()<=1,"seed {seed} frame {frame} die {i} matrix {m}[{a}][{b}]: {} != {expected}",matrix.0[a][b]);}}}
                }
                if frame+1<frames{simulation.step();}
            }
            assert!(simulation.settled());
        }
    }
    #[test]fn original_full_rolls(){compare_rolls(include_bytes!("../evidence/roll-trace.bin"),0);}
    #[test]fn original_triple_rolls(){compare_rolls(include_bytes!("../evidence/triple-rolls.bin"),1);}
    #[test]fn original_painted_rolls(){compare_rolls(include_bytes!("../evidence/painted-rolls.bin"),2);}
    #[test]fn original_pyramid_rolls(){compare_rolls(include_bytes!("../evidence/pyramid-rolls.bin"),3);}
    #[test]fn original_collision_sound_levels(){
        let data=include_bytes!("../evidence/audio-oracle.bin");let mut p=0;
        fn word(data:&[u8],p:&mut usize)->u32{let v=u32::from_le_bytes(data[*p..*p+4].try_into().unwrap());*p+=4;v}
        while p<data.len(){let triple=word(data,&mut p)!=0;let seed=word(data,&mut p);let frames=word(data,&mut p);
            let mut s=Simulation::new(seed);s.triple_arena=triple;s.roll_from(if triple{[1.8,6.,-7.]}else{[7.4,0.,-7.6]});
            for frame in 0..frames{let n=word(data,&mut p);let expected:Vec<_>=(0..n).map(|_|word(data,&mut p)).collect();s.step();let actual:Vec<_>=s.sounds.drain(..).map(|(t,i,v)|t|(i<<8)|(v<<16)).collect();assert_eq!(actual,expected,"triple {triple}, seed {seed}, frame {frame}");}
        }
    }
    #[test]fn original_batched_rolls_and_sounds(){
        let data=include_bytes!("../evidence/batched-rolls.bin");let mut p=0;
        fn word(data:&[u8],p:&mut usize)->u32{let v=u32::from_le_bytes(data[*p..*p+4].try_into().unwrap());*p+=4;v}
        while p<data.len(){let triple=word(data,&mut p)!=0;let seed=word(data,&mut p);let frames=word(data,&mut p);
            let mut s=Simulation::new(seed);s.triple_arena=triple;s.roll_from(if triple{[1.8,6.,-7.]}else{[7.4,0.,-7.6]});
            for frame in 0..frames{let steps=word(data,&mut p);let n=word(data,&mut p);let expected:Vec<_>=(0..n).map(|_|word(data,&mut p)).collect();s.step_batch(steps);
                let actual:Vec<_>=s.sounds.drain(..).map(|(t,i,v)|t|(i<<8)|(v<<16)).collect();assert_eq!(actual,expected,"sounds triple {triple} seed {seed} frame {frame}");
                let record=&data[p..p+724];p+=724;
                for i in 0..5{let r=&record[i*144..(i+1)*144];let f=|n:usize|f32::from_le_bytes(r[n*4..n*4+4].try_into().unwrap());let d=&s.dice[i];for axis in 0..3{assert!((d.position[axis]-f(axis)).abs()<0.00002,"position triple {triple} seed {seed} frame {frame} die {i}");assert!((d.velocity[axis]-f(axis+3)).abs()<0.00002,"velocity triple {triple} seed {seed} frame {frame} die {i}");}}
            }
        }
    }
}
