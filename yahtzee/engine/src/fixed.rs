//! RenderWare 2 Q16.16 routines used by the original dice simulation.
//! Keep integer rounding/saturation and original square-root lookup data.
const SQRT: &[u8; 0x3004] = include_bytes!("../assets/models/renderware-sqrt.bin");
pub fn mul(a: i32, b: i32) -> i32 {
    ((a as i64 * b as i64) >> 16).clamp(i32::MIN as i64, i32::MAX as i64) as i32
}
pub fn div(a: i32, b: i32) -> i32 {
    if a == 0 || b == 0 {
        return a;
    }
    ((a as i64 * 65536) / (b as i64)).clamp(i32::MIN as i64, i32::MAX as i64) as i32
}
/// Original 1003b650. Index is a BYTE offset, not a table element number.
pub fn sqrt(value: u32) -> u32 {
    if value == 0 {
        return 0;
    }
    let mut shift = 30u32;
    let mut high = value;
    if high >> 16 != 0 {
        high >>= 16;
        shift = 14;
    }
    if high >> 8 != 0 {
        high >>= 8;
        shift -= 8;
    }
    if high >> 4 != 0 {
        high >>= 4;
        shift -= 4;
    }
    if high & 0xffff_fffc != 0 {
        shift -= 2;
    }
    let half = shift / 2;
    let index = (value.wrapping_shl(shift).wrapping_add(0xc0080000) & 0xfff3ffff) >> 18;
    let offset = index as usize;
    let lookup = u32::from_le_bytes(SQRT[offset..offset + 4].try_into().unwrap());
    1u32.wrapping_shl(half.wrapping_sub(1)).wrapping_add(lookup) >> half
}
/// Original 10031430 returns the pre-normalization length as well as vector.
pub fn normalize(vector: [i32; 3]) -> ([i32; 3], i32) {
    let mask = vector.iter().fold(0, |mask, v| mask | v.unsigned_abs());
    if mask == 0 {
        return (vector, 0);
    }
    let bit = 31 - mask.leading_zeros();
    let scaled = if bit < 14 {
        vector.map(|v| v.wrapping_shl(13 - bit))
    } else {
        vector.map(|v| v >> (bit - 13))
    };
    let square = scaled
        .iter()
        .fold(0i32, |sum, &v| sum.wrapping_add(v.wrapping_mul(v)))
        >> 16;
    let length = sqrt(square as u32) as i32;
    let inverse = div(65536, length);
    let normal = scaled.map(|v| mul(v, inverse));
    let original_length = if bit < 14 {
        length >> (13 - bit)
    } else {
        length.wrapping_shl(bit - 13)
    };
    (normal, original_length)
}
pub fn cross(a: [i32; 3], b: [i32; 3]) -> [i32; 3] {
    std::array::from_fn(|i| {
        mul(a[(i + 1) % 3], b[(i + 2) % 3]).wrapping_sub(mul(a[(i + 2) % 3], b[(i + 1) % 3]))
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn original_normalization() {
        let fixture = include_bytes!("../evidence/fixed-math-oracle.bin");
        assert_eq!(fixture.len(), 4100 * 28);
        for (i, bytes) in fixture.chunks_exact(28).enumerate() {
            let word = |n: usize| i32::from_le_bytes(bytes[n * 4..n * 4 + 4].try_into().unwrap());
            assert_eq!(
                normalize([word(0), word(1), word(2)]),
                ([word(4), word(5), word(6)], word(3)),
                "case {i}"
            );
        }
    }
}
