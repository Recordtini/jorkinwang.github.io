//! Score dispatcher at 00412740 and its callees; category IDs are retail IDs.
pub const CLASSIC_CATEGORIES: [u32; 13] = [1, 2, 3, 4, 5, 6, 16, 17, 18, 19, 20, 21, 22];
pub fn score(dice: [u8; 5], category: u32, joker_eligible: bool) -> Option<i32> {
    score_hand(dice, None, category, joker_eligible)
}
/// Painted categories consume each die's settled face color as well as value.
/// Colors are original numeric labels (0..5), not browser palette colors.
pub fn score_colored(
    dice: [u8; 5],
    colors: [u8; 5],
    category: u32,
    joker_eligible: bool,
) -> Option<i32> {
    if colors.iter().any(|&c| c > 5) {
        return None;
    }
    score_hand(dice, Some(colors), category, joker_eligible)
}
fn score_hand(
    dice: [u8; 5],
    colors: Option<[u8; 5]>,
    category: u32,
    joker_eligible: bool,
) -> Option<i32> {
    if dice.iter().any(|d| !(1..=6).contains(d)) {
        return None;
    }
    let mut counts = [0i32; 6];
    for d in dice {
        counts[d as usize - 1] += 1
    }
    let sum = dice.iter().map(|&d| d as i32).sum();
    let kind = |n| counts.iter().any(|&v| v >= n);
    let straight = |length| {
        let mut n = 0;
        for c in counts {
            if c == 0 {
                n = 0
            } else {
                n += 1;
                if n >= length {
                    return true;
                }
            }
        }
        false
    };
    let joker = kind(5) && joker_eligible;
    Some(match category {
        1..=6 => counts[category as usize - 1] * category as i32,
        7 => -10,
        9..=13 => {
            let colors = colors?;
            dice.iter()
                .zip(colors)
                .filter(|(_, c)| *c as u32 == category - 9)
                .map(|(&face, _)| face as i32)
                .sum()
        }
        16 => {
            if kind(3) {
                sum
            } else {
                0
            }
        }
        17 => {
            if kind(4) {
                sum
            } else {
                0
            }
        }
        // 00412cc0 accepts a five-count, including without joker eligibility.
        18 => {
            if kind(5) || (counts.contains(&3) && counts.contains(&2)) || joker {
                25
            } else {
                0
            }
        }
        19 => {
            if straight(4) || joker {
                30
            } else {
                0
            }
        }
        20 => {
            if straight(5) || joker {
                40
            } else {
                0
            }
        }
        21 => {
            if kind(5) {
                50
            } else {
                0
            }
        }
        22 | 25 => sum,
        23 | 24 | 26 | 27 => {
            let colors = colors?;
            let mut bins = [0; 6];
            for c in colors {
                bins[c as usize] += 1;
            }
            let passes = match category {
                23 => bins[..5].iter().all(|&v| v == 1),
                // Original helper accepts five identical colors too.
                24 => bins.contains(&5) || (bins.contains(&3) && bins.contains(&2)),
                26 => bins.iter().any(|&v| v >= 5),
                27 => bins.iter().any(|&v| v >= 4),
                _ => unreachable!(),
            };
            if passes || joker {
                match category {
                    23 => 35,
                    24 => 25,
                    26 => 45,
                    _ => sum,
                }
            } else {
                0
            }
        }
        28 => {
            if (counts[0] == 2 && counts[1] == 2 && counts[2] == 1) || joker {
                15
            } else {
                0
            }
        }
        29 => {
            if (counts[1] == 2 && counts[2] == 2 && counts[3] == 1) || joker {
                20
            } else {
                0
            }
        }
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn original_machine_code_oracle() {
        let fixture = include_bytes!("../evidence/classic-score-oracle.bin");
        assert_eq!(fixture.len(), 7776 * 13 * 2 * 4);
        let mut offset = 0;
        for joker in [false, true] {
            for n in 0..7776 {
                let mut index = n;
                let mut dice = [0; 5];
                for d in &mut dice {
                    *d = (index % 6 + 1) as u8;
                    index /= 6
                }
                for category in CLASSIC_CATEGORIES {
                    let expected =
                        i32::from_le_bytes(fixture[offset..offset + 4].try_into().unwrap());
                    offset += 4;
                    assert_eq!(
                        score(dice, category, joker),
                        Some(expected),
                        "dice={dice:?}, category={category}, joker={joker}"
                    )
                }
            }
        }
    }
    #[test]
    fn original_colored_dispatcher() {
        let fixture = include_bytes!("../evidence/colored-score-oracle.bin");
        assert_eq!(fixture.len(), 7776 * 6 * 2 * 128);
        for (case, bytes) in fixture.chunks_exact(128).enumerate() {
            let word = |n| u32::from_le_bytes(bytes[n * 4..n * 4 + 4].try_into().unwrap());
            let dice = std::array::from_fn(|i| ((word(0) >> (i * 4)) & 15) as u8);
            let colors = std::array::from_fn(|i| ((word(1) >> (i * 4)) & 15) as u8);
            for cat in 1..30 {
                assert_eq!(
                    score_colored(dice, colors, cat, word(2) != 0).unwrap_or(-1000),
                    word(cat as usize + 2) as i32,
                    "case {case} category {cat}, dice={dice:?} colors={colors:?}"
                );
            }
        }
    }
}
