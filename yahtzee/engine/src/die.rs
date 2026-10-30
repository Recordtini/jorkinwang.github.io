//! Cube face selection from the orientation branch of YAHTZEE.EXE 0040b960.
//! Painted/tetrahedral dice use a separate normal-list path, not this function.
use crate::fixed;
use crate::matrix::Matrix;
const TETRA:[[i32;3];4]=[[0,40132,0],[-32768,-13377,18918],[32768,-13377,18918],[0,-13377,-37837]];
pub fn pyramid_face(m:Matrix)->u8{
    let mut best=i32::MIN;let mut face=0;
    for (i,n) in TETRA.iter().enumerate(){let y=m.vector(*n)[1];if y>best{best=y;face=i as u8+1;}}
    face
}
pub fn pyramid_settle(mut m:Matrix,face:u8,yaw:f32)->Matrix{
    m=m.ortho();let n=TETRA[(face-1) as usize];let p=m.vector(n);
    let a=((p[2]as f64).atan2(p[1]as f64)*57.29577951308232*65536.)as i32;
    m.rotate([-65536,0,0],a,3);let p=m.vector(n);
    let a=((p[0]as f64).atan2(p[1]as f64)*57.29577951308232*65536.)as i32;
    m.rotate([0,0,65536],a,3);
    if yaw!=0.{let n=TETRA[if face==1{1}else{0}];let p=m.vector(n);let a=(((p[2]as f64).atan2(p[0]as f64)*57.29577951308232+yaw as f64)*65536.)as i32;m.rotate([0,65536,0],a,3);}
    m
}

/// x_axis/y_axis are the first two transformed unit axes in RenderWare Q16.16.
/// Original tie handling favors the derived z axis, then local y over local x.
pub fn cube_face(x_axis: [i32; 3], y_axis: [i32; 3]) -> u8 {
    let z_axis = fixed::normalize(fixed::cross(x_axis, y_axis)).0;
    let x = x_axis[1];
    let y = y_axis[1];
    let z = z_axis[1];
    if y.wrapping_abs() < x.wrapping_abs() {
        if z.wrapping_abs() < x.wrapping_abs() {
            return if x > 0 { 4 } else { 3 };
        }
    } else if z.wrapping_abs() < y.wrapping_abs() {
        return if y > 0 { 1 } else { 6 };
    }
    if z > 0 {
        5
    } else {
        2
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn original_cube_orientation_branch() {
        let fixture = include_bytes!("../evidence/die-face-oracle.bin");
        assert_eq!(fixture.len(), 4123 * 28);
        for (i, bytes) in fixture.chunks_exact(28).enumerate() {
            let word = |n: usize| i32::from_le_bytes(bytes[n * 4..n * 4 + 4].try_into().unwrap());
            assert_eq!(
                cube_face([word(0), word(1), word(2)], [word(3), word(4), word(5)]),
                word(6) as u8,
                "case {i}"
            );
        }
    }
    #[test]fn original_pyramid_orientation(){
        for(i,b)in include_bytes!("../evidence/pyramid-orientation.bin").chunks_exact(76).enumerate(){
            let w=|n:usize|i32::from_le_bytes(b[n*4..n*4+4].try_into().unwrap());let m=Matrix(std::array::from_fn(|r|std::array::from_fn(|c|w(r*3+c))));let face=w(9) as u8;
            assert_eq!(pyramid_face(m),face,"face {i}");let out=pyramid_settle(m,face,0.);for r in 0..3{for c in 0..3{assert!((out.0[r][c]-w(10+r*3+c)).abs()<=2,"settle case {i} [{r},{c}]: {} != {}",out.0[r][c],w(10+r*3+c));}}
        }
    }
    #[test]fn original_pyramid_rack_orientation(){
        for(i,b)in include_bytes!("../evidence/pyramid-orientation-yaw.bin").chunks_exact(76).enumerate(){let w=|n:usize|i32::from_le_bytes(b[n*4..n*4+4].try_into().unwrap());let m=Matrix(std::array::from_fn(|r|std::array::from_fn(|c|w(r*3+c))));let face=w(9)as u8;let out=pyramid_settle(m,face,-24.);for r in 0..3{for c in 0..3{assert!((out.0[r][c]-w(10+r*3+c)).abs()<=2,"case {i} [{r},{c}]: {} != {}",out.0[r][c],w(10+r*3+c));}}}
    }
}
