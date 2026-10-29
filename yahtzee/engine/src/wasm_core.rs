//! Raw WASM ABI for recovered gameplay routines. No invented dice rolls.
use crate::{die, rng::RetailRandom, scorecard::Scorecard, scoring};
use std::cell::RefCell;
thread_local! {
    static BOOK: RefCell<(Scorecard, usize)> = RefCell::new((Scorecard::default(), 1));
    static RANDOM: RefCell<RetailRandom> = RefCell::new(RetailRandom::new(1));
}
fn unpack(value: u32) -> [u8; 5] {
    std::array::from_fn(|i| ((value >> (i * 4)) & 15) as u8)
}
#[no_mangle]
pub extern "C" fn scorecard_reset(columns: u32) -> u32 {
    if !(1..=3).contains(&columns) {
        return 0;
    }
    BOOK.with(|book| *book.borrow_mut() = (Scorecard::default(), columns as usize));
    1
}
#[no_mangle]
pub extern "C" fn scorecard_preview(dice: u32, colors: u32, category: u32) -> i32 {
    BOOK.with(|book| {
        let (state, columns) = &*book.borrow();
        let dice = unpack(dice);
        scoring::score_colored(
            dice,
            unpack(colors),
            category,
            state.joker_eligible(dice, *columns),
        )
        .unwrap_or(-1000)
    })
}
/// Returns 1 committed, 0 occupied, -1 invalid/unsupported input.
#[no_mangle]
pub extern "C" fn scorecard_commit(dice: u32, colors: u32, category: u32, column: u32) -> i32 {
    BOOK.with(|book| {
        let (state, columns) = &mut *book.borrow_mut();
        state
            .commit_colored(
                unpack(dice),
                unpack(colors),
                category,
                column as usize,
                *columns,
            )
            .map(i32::from)
            .unwrap_or(-1)
    })
}
#[no_mangle]
pub extern "C" fn scorecard_cell(category: u32, column: u32) -> i32 {
    BOOK.with(|book| {
        let (state, columns) = &*book.borrow();
        if category >= 30 || column == 0 || column as usize > *columns {
            return -1000;
        }
        state.cells[category as usize][column as usize - 1]
    })
}
#[no_mangle]
pub extern "C" fn retail_random_seed(seed: u32) {
    RANDOM.with(|r| *r.borrow_mut() = RetailRandom::new(seed));
}
#[no_mangle]
pub extern "C" fn retail_random_next() -> u32 {
    RANDOM.with(|r| r.borrow_mut().next_u31())
}
#[no_mangle]
pub extern "C" fn retail_colored_score(dice: u32, colors: u32, category: u32, joker: u32) -> i32 {
    scoring::score_colored(unpack(dice), unpack(colors), category, joker != 0).unwrap_or(-1000)
}
#[no_mangle]
pub extern "C" fn retail_cube_face(xx: i32, xy: i32, xz: i32, yx: i32, yy: i32, yz: i32) -> u32 {
    die::cube_face([xx, xy, xz], [yx, yy, yz]) as u32
}
