//! CAnimRLE: YAHTZEE.EXE 00405ad0, 00405d40, 00406120/1c0/240.
pub struct Image {
    pub width: usize,
    pub height: usize,
    pub raw: Vec<u8>,
    pub rgba: Vec<u8>,
}
fn u16le(b: &[u8], p: usize) -> Result<u16, String> {
    Ok(u16::from_le_bytes(
        b.get(p..p + 2).ok_or("truncated u16")?.try_into().unwrap(),
    ))
}
fn u32le(b: &[u8], p: usize) -> Result<u32, String> {
    Ok(u32::from_le_bytes(
        b.get(p..p + 4).ok_or("truncated u32")?.try_into().unwrap(),
    ))
}

pub fn decode_first_frame(b: &[u8]) -> Result<Image, String> {
    let width = u32le(b, 0)? as usize;
    let height = u32le(b, 4)? as usize;
    if width == 0 || height == 0 || width > 4096 || height > 4096 {
        return Err("invalid dimensions".into());
    }
    let depth = u16le(b, 8)?;
    let bytes = match depth {
        8 => 1,
        15 | 16 => 2,
        24 => 3,
        _ => return Err("unsupported depth".into()),
    };
    if u16le(b, 14)? == 0 {
        return Err("no initial full frame; delta stream unsupported".into());
    }
    let start: usize = 16 + if bytes == 1 { 1024 } else { 0 };
    let end = start
        .checked_add(u32le(b, start)? as usize)
        .ok_or("frame overflow")?;
    if end > b.len() || end < start + 4 {
        return Err("invalid frame length".into());
    }
    let mut pos = start + 4;
    let mut raw = Vec::with_capacity(width * height * bytes);
    while pos < end {
        let mut count = *b.get(pos).ok_or("truncated count")? as i8 as i32;
        pos += 1;
        if count == 0 {
            count = u16le(b, pos)? as i16 as i32;
            pos += 2
        }
        if count == 0 {
            return Err("zero-length run".into());
        }
        let n = count.unsigned_abs() as usize;
        if raw.len() + n * bytes > width * height * bytes {
            return Err("run exceeds image".into());
        }
        let size = if count < 0 { bytes } else { n * bytes };
        if pos + size > end {
            return Err("run exceeds frame".into());
        }
        if count < 0 {
            for _ in 0..n {
                raw.extend_from_slice(&b[pos..pos + bytes])
            }
        } else {
            raw.extend_from_slice(&b[pos..pos + size])
        }
        pos += size;
    }
    if raw.len() != width * height * bytes {
        return Err(format!("incomplete image: {} bytes", raw.len()));
    }
    let mut rgba = Vec::with_capacity(width * height * 4);
    for pixel in raw.chunks_exact(bytes) {
        let (r, g, blue) = match depth {
            8 => {
                let p = 16 + pixel[0] as usize * 4;
                (b[p], b[p + 1], b[p + 2])
            }
            // RenderWare's 16-bit raster path is RGB565; 15-bit is RGB555.
            15 | 16 => {
                let v = u16::from_le_bytes([pixel[0], pixel[1]]);
                let r = (v >> if depth == 16 { 11 } else { 10 }) & 31;
                let g = (v >> 5) & if depth == 16 { 63 } else { 31 };
                let blue = v & 31;
                (
                    (r * 255 / 31) as u8,
                    (g * 255 / if depth == 16 { 63 } else { 31 }) as u8,
                    (blue * 255 / 31) as u8,
                )
            }
            _ => (pixel[2], pixel[1], pixel[0]),
        };
        rgba.extend_from_slice(&[r, g, blue, 255]);
    }
    Ok(Image {
        width,
        height,
        raw,
        rgba,
    })
}

/// Original 004064a0 delta stream. Applied over the decoded ECONES3 base.
pub fn apply_delta24(b: &[u8], raw: &mut [u8]) -> Result<(), String> {
    let width = u32le(b, 0)? as usize;
    let height = u32le(b, 4)? as usize;
    if u16le(b, 8)? != 24 || u16le(b, 14)? != 0 || raw.len() != width * height * 3 {
        return Err("invalid 24-bit delta target".into());
    }
    let mut pos = 20;
    let end = 16usize
        .checked_add(u32le(b, 16)? as usize)
        .ok_or("delta size overflow")?;
    if end > b.len() || end <= pos {
        return Err("invalid delta length".into());
    }
    let mut dest = b[pos] as usize * width * 3;
    pos += 1;
    let mut next_row = dest + width * 3;
    while pos < end {
        if pos + 2 > end {
            return Err("truncated delta command".into());
        }
        let skip = b[pos] as i8 as i32;
        let count = b[pos + 1] as i8 as i32;
        pos += 2;
        if skip < 0 {
            dest = next_row + (-skip - 1) as usize * 3;
            next_row += width * 3
        } else {
            dest += skip as usize * 3
        }
        let n = count.unsigned_abs() as usize * 3;
        if dest + n > raw.len() {
            return Err("delta writes outside image".into());
        }
        if count < 0 {
            if pos + n > end {
                return Err("truncated delta literal".into());
            }
            raw[dest..dest + n].copy_from_slice(&b[pos..pos + n]);
            pos += n;
            dest += n
        } else if count > 0 {
            if pos + 3 > end {
                return Err("truncated delta repeat".into());
            }
            for pixel in raw[dest..dest + n].chunks_exact_mut(3) {
                pixel.copy_from_slice(&b[pos..pos + 3])
            }
            pos += 3;
            dest += n
        }
        if count != 0 && dest > next_row {
            next_row += width * 3
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn retail_screens_and_truncation() {
        for i in 0..5 {
            let a = crate::screen(i).unwrap();
            assert_eq!((a.width, a.height), (640, 480));
            assert_eq!(a.raw.len(), 614400)
        }
        for n in [0, 15, 17, 100, 5000] {
            assert!(decode_first_frame(&crate::SCREENS[0][..n]).is_err())
        }
    }
    #[test]
    fn original_machine_decoder_buffers() {
        let originals: [&[u8]; 5] = [
            include_bytes!("../evidence/original-rle/ECLASS16.raw"),
            include_bytes!("../evidence/original-rle/ETRIPL16.raw"),
            include_bytes!("../evidence/original-rle/EBATTL16.raw"),
            include_bytes!("../evidence/original-rle/EPYRAM16.raw"),
            include_bytes!("../evidence/original-rle/EPAINT16.raw"),
        ];
        for (i, original) in originals.iter().enumerate() {
            assert_eq!(
                crate::screen(i).unwrap().raw.as_slice(),
                *original,
                "screen {i}"
            )
        }
    }
}
