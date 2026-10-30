//! Retail-derived slices, not a completed game. See evidence/STATUS.md.
pub mod die;
pub mod matrix;
pub mod physics;
pub mod game;
pub mod painted;
pub mod cup;
pub mod lighting;
mod retail_constants;
pub mod fixed;
pub mod menu;
pub mod rle;
pub mod rng;
pub mod scorecard;
pub mod scoring;
mod wasm_core;
mod game_abi;
use std::cell::RefCell;

const SCREENS: [&[u8]; 6] = [
    include_bytes!("../assets/ECLASS16.RLE"),
    include_bytes!("../assets/ETRIPL16.RLE"),
    include_bytes!("../assets/EBATTL16.RLE"),
    include_bytes!("../assets/EPYRAM16.RLE"),
    include_bytes!("../assets/EPAINT16.RLE"),
    include_bytes!("../assets/menu/ECONES3.RLE"),
];
thread_local! { static FRAME: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) }; }

#[no_mangle]
pub extern "C" fn screen_open(index: usize) -> u32 {
    match screen(index) {
        Ok(image) => {
            FRAME.with(|f| *f.borrow_mut() = image.rgba);
            1
        }
        Err(_) => 0,
    }
}
#[no_mangle]
pub extern "C" fn frame_ptr() -> *const u8 {
    FRAME.with(|f| f.borrow().as_ptr())
}
#[no_mangle]
pub extern "C" fn frame_len() -> usize {
    FRAME.with(|f| f.borrow().len())
}
#[no_mangle]
pub extern "C" fn retail_score(packed_dice: u32, category: u32, joker: u32) -> i32 {
    let mut dice = [0u8; 5];
    for (i, d) in dice.iter_mut().enumerate() {
        *d = ((packed_dice >> (i * 4)) & 15) as u8;
    }
    scoring::score(dice, category, joker != 0).unwrap_or(-1000)
}

pub fn screen(index: usize) -> Result<rle::Image, String> {
    let mut image = rle::decode_first_frame(SCREENS.get(index).ok_or("screen index")?)?;
    // Title is presented by CAnimBitmap's positive-height Win32 DIB path
    // (0041deb0 / 0041e1a0), unlike the RenderWare gameplay raster path.
    if index == 5 {
        let stride = image.width * 4;
        for y in 0..image.height / 2 {
            let split = (image.height - 1 - y) * stride;
            let (top, bottom) = image.rgba.split_at_mut(split);
            top[y * stride..(y + 1) * stride].swap_with_slice(&mut bottom[..stride]);
        }
    }
    Ok(image)
}

/// Original menu highlight assets; selection/transition UI remains pending.
pub fn title_highlight(command: u32) -> Result<rle::Image, String> {
    let mut image = rle::decode_first_frame(SCREENS[5])?;
    let overlay: Option<&[u8]> = match command {
        0x41c => Some(include_bytes!("../assets/menu/ECLSCON3.RLE")),
        0x452 => Some(include_bytes!("../assets/menu/ETRPCON3.RLE")),
        0x450 => Some(include_bytes!("../assets/menu/EPNTCON3.RLE")),
        0x41d => Some(include_bytes!("../assets/menu/EPYRCON3.RLE")),
        0x43d => Some(include_bytes!("../assets/menu/EBATCON3.RLE")),
        _ => None,
    };
    if let Some(b) = overlay {
        rle::apply_delta24(b, &mut image.raw)?;
    }
    image.rgba.clear();
    // CAnimBitmap's positive-height DIB is bottom-up, BGR24.
    for row in image.raw.chunks_exact(image.width * 3).rev() {
        for p in row.chunks_exact(3) {
            image.rgba.extend_from_slice(&[p[2], p[1], p[0], 255]);
        }
    }
    Ok(image)
}
#[no_mangle]
pub extern "C" fn title_open(command: u32) -> u32 {
    match title_highlight(command) {
        Ok(image) => {
            FRAME.with(|f| *f.borrow_mut() = image.rgba);
            1
        }
        Err(_) => 0,
    }
}
