//! Classic cup pose, input and spring: 00411080, 00411290, 004173f0,
//! 00417190. Browser relative pointer coordinates replace Win32 cursor warping.
use crate::matrix::Matrix;
#[derive(Clone,Debug)]
pub struct Cup{pub position:[f32;3],pub yaw:f32,pub pitch:f32,pub target:f32,pub velocity:f32,pub previous_x:f32,pub picked:bool,pub triple:bool}
impl Default for Cup{fn default()->Self{Self{position:[7.4,0.,-7.6],yaw:0.,pitch:-90.,target:0.,velocity:0.,previous_x:0.,picked:false,triple:false}}}
impl Cup{
    pub fn pickup(&mut self){self.position=if self.triple{[1.8,6.,-7.]}else{[0.,8.,-9.]};self.yaw=0.;self.pitch=-60.;self.target=0.;self.velocity=0.;self.picked=true;}
    pub fn rest(&mut self){self.position=if self.triple{[-2.5,-1.3,-7.2]}else{[7.4,0.,-7.6]};self.yaw=0.;self.pitch=-90.;self.target=0.;self.velocity=0.;self.picked=false;}
    pub fn orientation(&self)->Matrix{let mut m=Matrix::default();m.rotate([65536,0,0],((self.pitch as f64+90.)*65536.)as i32,2);m.rotate([0,65536,0],(-self.yaw as f64*65536.)as i32,2);m}
    pub fn motion(&mut self,x:f32,y:f32)->bool{
        if y as f64*0.4+self.pitch as f64>=0.{return true}
        self.position[0]=if self.triple{(self.position[0]+x).clamp(-5.,4.)}else{(self.position[0]+x).clamp(-7.,5.)};
        self.yaw=(x as f64*4.+self.yaw as f64)as f32;self.target=self.position[0]*-4.;
        self.velocity=(x as f64*f32::from_bits(0x3d23d70a)as f64+self.velocity as f64)as f32;
        let pitch=y as f64*20.+self.pitch as f64;
        if pitch>=-60.{self.position[2]+=y;self.pitch=pitch as f32;}
        self.previous_x=x;false
    }
    pub fn tick(&mut self){
        let mut offset=self.yaw-self.target;
        let acceleration=if offset as f64*0.0075>=0.{(offset as f64*-0.0075).min(-0.0075)}else{(offset as f64*-0.0075).max(0.0075)}as f32;
        let threshold=f32::from_bits(0x3bf5c28f);
        if self.velocity.abs()<=threshold&&offset.abs()<threshold{self.velocity=0.;}else{self.velocity+=acceleration;offset+=self.velocity;self.velocity=(self.velocity as f64*0.996)as f32;}
        self.yaw=offset.clamp(-20.,20.)+self.target;
    }
}
#[cfg(test)]mod tests{
    use super::*;
    #[test]fn original_spring(){
        for b in include_bytes!("../evidence/cup-spring.bin").chunks_exact(32){let f=|i:usize|f32::from_le_bytes(b[i*4..i*4+4].try_into().unwrap());let mut c=Cup::default();c.yaw=f(0);c.pitch=f(1);c.target=f(2);c.velocity=f(3);c.tick();assert_eq!([c.yaw,c.pitch,c.target,c.velocity].map(f32::to_bits),[f(4),f(5),f(6),f(7)].map(f32::to_bits));}
    }
    #[test]fn original_cup_matrices(){
        for(case,b)in include_bytes!("../evidence/cup-matrix.bin").chunks_exact(44).enumerate(){
            let f=|i:usize|f32::from_le_bytes(b[i*4..i*4+4].try_into().unwrap());
            let c=Cup{yaw:f(0),pitch:f(1),..Cup::default()};let actual=c.orientation();
            for row in 0..3{for col in 0..3{let off=8+(row*3+col)*4;let expected=i32::from_le_bytes(b[off..off+4].try_into().unwrap());assert!((actual.0[row][col]-expected).abs()<=1,"case {case} matrix {row},{col}");}}
        }
    }
    #[test]fn original_motion(){
        for(case,b)in include_bytes!("../evidence/cup-motion.bin").chunks_exact(76).enumerate(){let f=|i:usize|f32::from_le_bytes(b[i*4..i*4+4].try_into().unwrap());let mut c=Cup{position:[f(0),f(1),f(2)],yaw:f(3),pitch:f(4),target:f(5),velocity:f(6),previous_x:f(7),picked:true,triple:false};let thrown=c.motion(f(8),f(9));assert_eq!(thrown,u32::from_le_bytes(b[40..44].try_into().unwrap())!=0,"case {case}");let after=[c.position[0],c.position[1],c.position[2],c.yaw,c.pitch,c.target,c.velocity,c.previous_x];assert_eq!(after.map(f32::to_bits),std::array::from_fn::<_,8,_>(|i|f(i+11).to_bits()),"case {case}");}
    }
}
