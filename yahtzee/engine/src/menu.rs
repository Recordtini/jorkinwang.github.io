//! CGameSelect command handling recovered at 00408de0 / 00409030.
//! This maps original events; it does not invent the subsequent game flow.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode {
    Classic,
    Pyramid,
    Battle,
    Painted,
    Triple,
}
pub fn selected_mode(command: u32) -> Option<Mode> {
    // 0x4cb calls application exit; handled separately from mode selection.
    if command == 0x4cb {
        return None;
    }
    Some(match command {
        0x41d => Mode::Pyramid,
        0x43d => Mode::Battle,
        0x450 => Mode::Painted,
        0x452 => Mode::Triple,
        _ => Mode::Classic,
    })
}
pub fn hover_overlay(command: u32) -> Option<usize> {
    match command {
        0x450 => Some(0),
        0x452 => Some(1),
        0x41c => Some(2),
        0x43d => Some(3),
        0x41d => Some(4),
        _ => None,
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn retail_commands() {
        for (id, mode, overlay) in [
            (0x41c, Mode::Classic, 2),
            (0x41d, Mode::Pyramid, 4),
            (0x43d, Mode::Battle, 3),
            (0x450, Mode::Painted, 0),
            (0x452, Mode::Triple, 1),
        ] {
            assert_eq!(selected_mode(id), Some(mode));
            assert_eq!(hover_overlay(id), Some(overlay));
        }
        assert_eq!(selected_mode(0x4cb), None);
        assert_eq!(hover_overlay(0x4cb), None)
    }
    #[test]
    fn original_menu_decoder_buffers() {
        let fixtures: [(u32, &[u8]); 6] = [
            (0, include_bytes!("../evidence/original-rle/ECONES3.raw")),
            (
                0x41c,
                include_bytes!("../evidence/original-rle/ECLSCON3.raw"),
            ),
            (
                0x452,
                include_bytes!("../evidence/original-rle/ETRPCON3.raw"),
            ),
            (
                0x450,
                include_bytes!("../evidence/original-rle/EPNTCON3.raw"),
            ),
            (
                0x41d,
                include_bytes!("../evidence/original-rle/EPYRCON3.raw"),
            ),
            (
                0x43d,
                include_bytes!("../evidence/original-rle/EBATCON3.raw"),
            ),
        ];
        for (command, expected) in fixtures {
            assert_eq!(
                crate::title_highlight(command).unwrap().raw,
                expected,
                "command {command}"
            )
        }
    }
}
