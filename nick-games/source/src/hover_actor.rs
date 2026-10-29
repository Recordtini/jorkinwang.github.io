//! Timmy's original gHeroDrive animation ranges and turn-return transitions.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Pose {
    #[default]
    Idle,
    Left,
    LeftLoop,
    LeftReturn,
    Right,
    RightLoop,
    RightReturn,
    Air,
    Land,
    Win,
    Lose,
    LoseLoop,
}
#[derive(Clone, Debug, Default)]
pub struct Actor {
    pub pose: Pose,
    pub phase: u32,
    pub backwards: bool,
}
impl Actor {
    fn span(&self) -> (u32, u32) {
        match self.pose {
            Pose::Idle | Pose::Air => (5, 40),
            Pose::Left => (90, 99),
            Pose::LeftLoop => (100, 115),
            Pose::LeftReturn => (116, 125),
            Pose::Right => (50, 59),
            Pose::RightLoop => (60, 75),
            Pose::RightReturn => (76, 85),
            Pose::Land => (200, 205),
            Pose::Win => (170, 205),
            Pose::Lose => (130, 147),
            Pose::LoseLoop => (148, 165),
        }
    }
    pub fn frame(&self) -> f32 {
        let (a, b) = self.span();
        if self.backwards {
            (b - self.phase % (b - a)) as f32
        } else {
            (a + self.phase % (b - a)) as f32
        }
    }
    fn set(&mut self, pose: Pose) {
        if self.pose != pose {
            self.pose = pose;
            self.phase = 0;
        }
    }
    pub fn end(&mut self, won: bool) {
        self.set(if won { Pose::Win } else { Pose::Lose });
        self.backwards = false;
    }
    pub fn tick(&mut self, steer: f32, reverse: bool, airborne: bool) {
        if matches!(self.pose, Pose::Win | Pose::Lose | Pose::LoseLoop) {
            self.phase += 1;
            let (a, b) = self.span();
            if self.phase >= b - a {
                if self.pose == Pose::Lose {
                    self.set(Pose::LoseLoop);
                    self.backwards = true;
                } else {
                    self.phase = 0;
                    if self.pose == Pose::LoseLoop {
                        self.backwards = !self.backwards;
                    }
                }
            }
            return;
        }
        let was_air = self.pose == Pose::Air;
        if airborne {
            self.set(Pose::Air);
        } else if was_air {
            self.set(Pose::Land);
            return;
        } else if self.pose != Pose::Land {
            let direction = steer * if reverse { -1. } else { 1. };
            if direction > 0. {
                if !matches!(self.pose, Pose::Left | Pose::LeftLoop) {
                    self.set(Pose::Left);
                    return;
                }
            } else if direction < 0. {
                if !matches!(self.pose, Pose::Right | Pose::RightLoop) {
                    self.set(Pose::Right);
                    return;
                }
            } else {
                match self.pose {
                    Pose::Left | Pose::LeftLoop => {
                        self.set(Pose::LeftReturn);
                        return;
                    }
                    Pose::Right | Pose::RightLoop => {
                        self.set(Pose::RightReturn);
                        return;
                    }
                    _ => {}
                }
            }
        }
        self.phase += 1;
        let (a, b) = self.span();
        if self.phase >= b - a {
            match self.pose {
                Pose::Left => self.set(Pose::LeftLoop),
                Pose::Right => self.set(Pose::RightLoop),
                Pose::LeftReturn | Pose::RightReturn | Pose::Land => self.set(Pose::Idle),
                _ => self.phase = 0,
            }
        }
    }
}
