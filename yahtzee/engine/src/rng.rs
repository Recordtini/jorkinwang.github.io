//! Default RenderWare type-3 generator, RWX20.DLL 10031970 / 10031ab0.
//! Dice outcomes are derived by simulation; do NOT substitute next()%6.
#[derive(Clone)]
pub struct RetailRandom {
    state: [u32; 31],
    front: usize,
    rear: usize,
}
impl RetailRandom {
    pub fn new(seed: u32) -> Self {
        let mut state = [0u32; 31];
        state[0] = seed;
        for i in 1..31 {
            state[i] = state[i - 1].wrapping_mul(0x41c64e6d).wrapping_add(0x3039)
        }
        let mut result = Self {
            state,
            front: 3,
            rear: 0,
        };
        for _ in 0..310 {
            result.next_u31();
        }
        result
    }
    pub fn next_u31(&mut self) -> u32 {
        self.state[self.front] = self.state[self.front].wrapping_add(self.state[self.rear]);
        let result = (self.state[self.front] >> 1) & 0x7fffffff;
        self.front = (self.front + 1) % 31;
        self.rear = (self.rear + 1) % 31;
        result
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn original_renderware_generator() {
        let bytes = include_bytes!("../evidence/rng-oracle.bin");
        assert_eq!(bytes.len(), 6 * (4096 + 1) * 4);
        let mut p = 0;
        for _ in 0..6 {
            let seed = u32::from_le_bytes(bytes[p..p + 4].try_into().unwrap());
            p += 4;
            let mut random = RetailRandom::new(seed);
            for index in 0..4096 {
                let expected = u32::from_le_bytes(bytes[p..p + 4].try_into().unwrap());
                p += 4;
                assert_eq!(random.next_u31(), expected, "seed {seed}, index {index}")
            }
        }
    }
}
