//! Retail RenderWare Q16.16 matrix operations used by Classic dice.
use crate::fixed::{self,mul};
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub struct Matrix(pub [[i32;3];3]);
impl Default for Matrix { fn default()->Self{Self([[65536,0,0],[0,65536,0],[0,0,65536]])} }
impl Matrix {
    pub fn combine(self, other:Self)->Self {
        Self(std::array::from_fn(|r| std::array::from_fn(|c|{
            let sum=(0..3).fold(0i64,|v,k|v.wrapping_add(self.0[r][k]as i64*other.0[k][c]as i64));
            (sum>>16)as i32
        })))
    }
    pub fn vector(self,v:[i32;3])->[i32;3]{std::array::from_fn(|c|{
        (0..3).fold(0i32,|sum,r|sum.wrapping_add(mul(v[r],self.0[r][c])))
    })}
    pub fn rotate(&mut self,axis:[i32;3],angle:i32,mode:u32){
        let(axis,len)=fixed::normalize(axis);if len<1{return}
        let(s,one_minus_c)=if angle.wrapping_abs()%0x5a0000==0 {
            match ((angle>>16)/90)&3 {1=>(65536,65536),2=>(0,131072),3=>(-65536,65536),_=>(0,0)}
        }else{
            let radians=mul(angle,0x477)as f64/65536.;
            ((radians.sin()*65536.)as i32,65536-(radians.cos()*65536.)as i32)
        };
        let[x,y,z]=axis;let t=one_minus_c;
        let xx=65536-mul(t,65536-mul(x,x));
        let yy=65536-mul(t,65536-mul(y,y));
        let zz=65536-mul(t,65536-mul(z,z));
        let yz=mul(t,mul(y,z));let zx=mul(t,mul(z,x));let xy=mul(t,mul(x,y));
        let sx=mul(s,x);let sy=mul(s,y);let sz=mul(s,z);
        let r=Self([[xx,xy+sz,zx-sy],[xy-sz,yy,yz+sx],[zx+sy,yz-sx,zz]]);
        *self=match mode {1=>r,2=>r.combine(*self),3=>self.combine(r),_=>panic!("invalid retail matrix mode")};
    }
    pub fn ortho(self)->Self {
        let mut rows=self.0;let mut lengths=[0;3];
        for i in 0..3{let(n,l)=fixed::normalize(rows[i]);rows[i]=n;lengths[i]=l;}
        let dot=|a:usize,b:usize|->i32{((0..3).map(|i|rows[a][i]as i64*rows[b][i]as i64).sum::<i64>()>>16)as i32};
        let(target,left,right)=if lengths[0]>0{
            if lengths[1]<1 {(1,2,0)}else if lengths[2]<1{(2,0,1)}else{
                let a=dot(1,2).wrapping_abs();let b=dot(2,0).wrapping_abs();let c=dot(0,1).wrapping_abs();
                if b<=a {if b<c{(1,2,0)}else{(2,0,1)}}else if c<=a{(2,0,1)}else{(0,1,2)}
            }
        }else{(0,1,2)};
        rows[target]=fixed::normalize(fixed::cross(rows[left],rows[right])).0;
        rows[right]=fixed::normalize(fixed::cross(rows[target],rows[left])).0;
        Self(rows)
    }
}
#[cfg(test)]mod tests{
    use super::*;
    #[test]fn original_ortho(){
        for(case,bytes)in include_bytes!("../evidence/ortho-oracle.bin").chunks_exact(72).enumerate(){
            let word=|n:usize|i32::from_le_bytes(bytes[n*4..n*4+4].try_into().unwrap());
            let input=Matrix(std::array::from_fn(|r|std::array::from_fn(|c|word(r*3+c))));
            let expected=Matrix(std::array::from_fn(|r|std::array::from_fn(|c|word(9+r*3+c))));
            assert_eq!(input.ortho(),expected,"case {case}");
        }
    }
}
