//! Directional vertex lighting from RWX20 1000cbd0/1000c950. Texture
//! modulation is performed by the browser rasterizer after this calculation.
use crate::{fixed::{self,mul,div},matrix::Matrix};
fn inverse(m:Matrix)->Matrix{
    let [a,b,c]=m.0;let cols=[fixed::cross(b,c),fixed::cross(c,a),fixed::cross(a,b)];
    let mut inverse=Matrix(std::array::from_fn(|r|std::array::from_fn(|col|cols[col][r])));
    let determinant=mul(inverse.0[0][0],a[0]).wrapping_add(mul(inverse.0[1][0],a[1])).wrapping_add(mul(inverse.0[2][0],a[2]));
    if determinant!=0{let d=div(65536,determinant);for row in &mut inverse.0{for v in row{*v=mul(*v,d)}}}inverse
}
pub fn vertex(matrix:Matrix,normal:[i32;3],surface:[u32;3])->i32{
    let inv=inverse(matrix);
    let sources=[[0,-65536,0],[-65536,-19660,0],[0,-19660,-65536]];
    let mut result=(surface[0]as i32*0x1f0000)>>8;
    for (source,intensity) in sources.into_iter().zip([14,14,3]){
        let source=fixed::normalize(source).0.map(|v|-v);
        let local=fixed::normalize(inv.vector(source)).0;
        let dot=((0..3).map(|k|normal[k]as i64*local[k]as i64).sum::<i64>()>>16)as i32;
        if dot>0{
            let mut v=(surface[1]as i32*dot)>>8;
            if dot>0xb333{
                let mut s=((dot>>8).min(255))<<8;
                for _ in 0..4{s=mul(s,s)}
                v+=((surface[2]as i32)*s)>>8;
            }
            result+=intensity*v;
        }
    }
    result.min(0x1f0000)
}
#[cfg(test)]mod tests{
    use super::*;
    #[test]fn original_vertex_lighting(){
        for(i,b)in include_bytes!("../evidence/lighting-oracle.bin").chunks_exact(36).enumerate(){
            let w=|j:usize|i32::from_le_bytes(b[j*4..j*4+4].try_into().unwrap());
            assert_eq!(vertex(Matrix::default(),[w(0),w(1),w(2)],[w(3)as u32,w(4)as u32,w(5)as u32]),w(6),"case {i}");
        }
    }
    #[test]fn original_rotated_lighting(){
        for(i,b)in include_bytes!("../evidence/lighting-rotations.bin").chunks_exact(72).enumerate(){
            let w=|j:usize|i32::from_le_bytes(b[j*4..j*4+4].try_into().unwrap());
            let matrix=Matrix(std::array::from_fn(|r|std::array::from_fn(|c|w(r*3+c))));
            assert_eq!(vertex(matrix,[w(9),w(10),w(11)],[w(12)as u32,w(13)as u32,w(14)as u32]),w(15),"case {i}");
        }
    }
}
