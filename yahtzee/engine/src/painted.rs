//! Painted die-face color labels from YAHTZEE.EXE 0041b5d0 / 0042d998.
const COLORS:[[u8;6];5]=[
    [0,1,3,2,4,0], [3,0,1,3,2,4], [1,4,0,1,3,2],
    [2,2,4,0,1,3], [4,3,2,4,0,1],
];
pub fn colors(faces:[u8;5])->Option<[u8;5]>{
    if faces.iter().any(|&v|!(1..=6).contains(&v)){return None}
    Some(std::array::from_fn(|i|COLORS[i][faces[i] as usize-1]))
}
#[cfg(test)]mod tests{
    #[test]fn original_painted_color_sums(){
        let data=include_bytes!("../evidence/painted-color.bin");assert_eq!(data.len(),7776*10);
        for r in data.chunks_exact(10){let faces:[u8;5]=r[..5].try_into().unwrap();let colors=super::colors(faces).unwrap();for c in 0..5{assert_eq!(crate::scoring::score_colored(faces,colors,9+c,false),Some(r[5+c as usize] as i32),"faces {faces:?} color {c}");}}
    }
}
