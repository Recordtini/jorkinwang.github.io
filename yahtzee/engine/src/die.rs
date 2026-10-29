//! Cube face selection from the orientation branch of YAHTZEE.EXE 0040b960.
//! Painted/tetrahedral dice use a separate normal-list path, not this function.
use crate::fixed;

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
}
