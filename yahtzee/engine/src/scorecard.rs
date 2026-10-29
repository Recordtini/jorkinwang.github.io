//! Player score storage and commit logic, YAHTZEE.EXE 00413590 / 00414ca0.
//! This owns score mutation, not animation, UI, undo or turn advancement.
use crate::scoring;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Scorecard {
    pub scored_yahtzees: i32,        // player +4
    pub yahtzee_chain: i32,          // player +8; -1 undecided, 0 disqualified
    pub cells: [[i32; 3]; 30],       // player +0x18, category-major
    pub bonus_marks: [[i32; 3]; 30], // player +0x180
}

impl Default for Scorecard {
    fn default() -> Self {
        Self {
            scored_yahtzees: 0,
            yahtzee_chain: -1,
            cells: [[-1; 3]; 30],
            bonus_marks: [[0; 3]; 30],
        }
    }
}

impl Scorecard {
    /// Original 00415490 checks every active column's matching upper cell and
    /// Yahtzee cell for exactly -1. A scratched (zero) cell still qualifies.
    pub fn joker_eligible(&self, dice: [u8; 5], columns: usize) -> bool {
        if !(1..=3).contains(&columns)
            || !(1..=6).contains(&dice[0])
            || !dice.iter().all(|&d| d == dice[0])
        {
            return false;
        }
        (0..columns).all(|c| self.cells[21][c] != -1 && self.cells[dice[0] as usize][c] != -1)
    }

    /// Original 00415740, evaluated AFTER the five-of-a-kind counters change.
    fn extra_bonus(&self, five: bool, columns: usize) -> bool {
        self.yahtzee_chain != 0
            && five
            && self.yahtzee_chain >= 2
            && (columns != 3
                || self.scored_yahtzees == self.yahtzee_chain
                || self.scored_yahtzees == 3)
    }

    /// column is the original one-based multiplier (1, 2 or 3).
    /// Ok(false) means the original occupied-cell rejection. Unsupported scoring
    /// categories return Err; alternate-mode rules are not silently substituted.
    pub fn commit(
        &mut self,
        dice: [u8; 5],
        category: u32,
        column: usize,
        columns: usize,
    ) -> Result<bool, &'static str> {
        self.commit_hand(dice, None, category, column, columns)
    }
    pub fn commit_colored(
        &mut self,
        dice: [u8; 5],
        colors: [u8; 5],
        category: u32,
        column: usize,
        columns: usize,
    ) -> Result<bool, &'static str> {
        self.commit_hand(dice, Some(colors), category, column, columns)
    }
    fn commit_hand(
        &mut self,
        dice: [u8; 5],
        colors: Option<[u8; 5]>,
        category: u32,
        column: usize,
        columns: usize,
    ) -> Result<bool, &'static str> {
        if !(1..=3).contains(&columns) || column == 0 || column > columns {
            return Err("invalid column");
        }
        let joker = self.joker_eligible(dice, columns);
        let value = match colors {
            Some(colors) => scoring::score_colored(dice, colors, category, joker),
            None => scoring::score(dice, category, joker),
        }
        .ok_or("unsupported category or dice")?;
        let category = category as usize;
        if category >= 30 {
            return Err("invalid category");
        }
        let c = column - 1;
        if self.cells[category][c] != -1 {
            return Ok(false);
        }
        let five = dice.iter().all(|&d| d == dice[0]);
        if five {
            if category == 21 {
                self.scored_yahtzees = self.scored_yahtzees.wrapping_add(1);
            }
            if self.yahtzee_chain == -1 {
                self.yahtzee_chain = i32::from(category == 21);
            } else if self.yahtzee_chain != 0 {
                self.yahtzee_chain = self.yahtzee_chain.wrapping_add(1);
            }
        }
        self.cells[category][c] = value.wrapping_mul(column as i32);
        if self.extra_bonus(five, columns) && category != 21 {
            // Retail adds the bonus to the Yahtzee row, not a separate total.
            self.cells[21][c] = self.cells[21][c].wrapping_add(column as i32 * 100);
            self.bonus_marks[category][c] = 1;
        }
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn read(bytes: &[u8]) -> Scorecard {
        let value = |offset| i32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap());
        let mut state = Scorecard {
            scored_yahtzees: value(4),
            yahtzee_chain: value(8),
            ..Default::default()
        };
        for category in 0..30 {
            for c in 0..3 {
                state.cells[category][c] = value(0x18 + (category * 3 + c) * 4);
                state.bonus_marks[category][c] = value(0x180 + (category * 3 + c) * 4);
            }
        }
        state
    }
    #[test]
    fn original_commit_mutations() {
        let fixture = include_bytes!("../evidence/commit-oracle.bin");
        let size = 0x2e8;
        let record_size = 40 + size * 2;
        assert_eq!(fixture.len(), 2496 * record_size);
        for (i, record) in fixture.chunks_exact(record_size).enumerate() {
            let word = |n| u32::from_le_bytes(record[n * 4..n * 4 + 4].try_into().unwrap());
            assert_eq!(word(9), size as u32);
            let mut state = read(&record[40..40 + size]);
            let dice = std::array::from_fn(|n| word(n + 3) as u8);
            let committed = state
                .commit(dice, word(1), word(2) as usize, word(0) as usize)
                .unwrap();
            assert_eq!(committed, word(8) != 0, "case {i}");
            assert_eq!(state, read(&record[40 + size..]), "case {i}");
        }
    }
}
