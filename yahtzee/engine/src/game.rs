//! Browser turn controller over recovered retail simulation and score storage.
//! Single-player Classic only. Browser input/state routing is new; the recovered
//! roll, rack, scoring, joker and bonus behavior retains the original routines.
use crate::{physics::Simulation,scorecard::Scorecard,scoring,cup::Cup};
pub const CATEGORIES:[u32;13]=[1,2,3,4,5,6,17,16,18,19,20,21,22];
pub struct Game {pub simulation:Simulation,pub book:Scorecard,pub rolls:u32,pub turns:u32,pub moving:bool,pub cup:Cup,pub columns:usize}
impl Game {
    pub fn new(seed:u32)->Self{
        let mut simulation=Simulation::new(seed);
        simulation.initialize_layout();
        Self{simulation,book:Scorecard::default(),rolls:0,turns:0,moving:false,cup:Cup::default(),columns:1}
    }
    pub fn triple(seed:u32)->Self{let mut g=Self::new(seed);g.columns=3;g.simulation.triple_arena=true;g.cup.triple=true;g.cup.position=[-2.5,-1.3,-7.2];g}
    pub fn roll(&mut self)->bool{
        if !self.cup.picked&&!self.pickup(){return false}
        let speed=(((self.simulation.random.next_u31()&127)+100)as f64*f32::from_bits(0x3b808081)as f64)as f32;
        let side=((10-(self.simulation.random.next_u31()&63)as i32)as f64*f32::from_bits(0x3b808081)as f64)as f32;
        self.throw(side,speed)
    }
    pub fn pickup(&mut self)->bool{
        if self.moving||self.turns==13*self.columns as u32||self.rolls==3||self.cup.picked{return false}
        if self.rolls==0{for d in &mut self.simulation.dice{d.held=false;d.sleeping=true;d.rack=None;}}
        if self.simulation.dice.iter().all(|d|d.held){return false}
        self.cup.pickup();true
    }
    fn throw(&mut self,side:f32,speed:f32)->bool{
        if !self.cup.picked{return false}
        self.simulation.throw(self.cup.position,side,speed);self.rolls+=1;self.moving=true;self.cup.rest();true
    }
    pub fn pointer(&mut self,dx:f32,dy:f32,millis:u32)->bool{
        if !self.cup.picked{return false}
        // 00410d50: anchor minus cursor, scaled/stored before 004173f0.
        let(x,y)=((-dx as f64*0.02)as f32,(-dy as f64*0.02)as f32);
        if self.cup.motion(x,y){let dt=millis.max(1)as f64;return self.throw((-dx as f64/dt*0.25)as f32,(-dy as f64/dt*0.25)as f32)}false
    }
    pub fn step(&mut self){if self.moving{self.simulation.step();if self.simulation.settled(){self.moving=false;}}else if self.cup.picked{self.cup.tick();}}
    pub fn hold(&mut self,i:usize)->bool{
        if i>=5||self.rolls==0||self.moving||self.turns==13*self.columns as u32||self.cup.picked{return false}
        self.simulation.toggle_hold(i);true
    }
    pub fn preview(&self,category:u32)->i32{
        self.preview_column(category,1)
    }
    pub fn preview_column(&self,category:u32,column:usize)->i32{
        if column==0||column>self.columns||!CATEGORIES.contains(&category)||self.rolls==0||self.moving||self.cup.picked||self.book.cells[category as usize][column-1]!=-1{return -1}
        let dice=self.simulation.faces();scoring::score(dice,category,self.book.joker_eligible(dice,self.columns)).map_or(-1,|v|v*column as i32)
    }
    pub fn commit(&mut self,category:u32)->bool{
        self.commit_column(category,1)
    }
    pub fn commit_column(&mut self,category:u32,column:usize)->bool{
        if self.preview_column(category,column)<0||self.turns==13*self.columns as u32{return false}
        if self.book.commit(self.simulation.faces(),category,column,self.columns)!=Ok(true){return false}
        // 00414520: Classic upper bonus is awarded at 63, total sums positive rows.
        let n=column-1;if (1..=6).map(|c|self.book.cells[c][n].max(0)).sum::<i32>()>=63*column as i32{self.book.cells[7][n]=35*column as i32;}
        self.turns+=1;self.rolls=0;
        // 00414ca0 -> 004170a0: put all five dice in the rack after scoring.
        // 004157f0 clears held flags when the next turn's cup is picked up.
        for i in 0..5{if !self.simulation.dice[i].held{self.simulation.toggle_hold(i);}}
        true
    }
    pub fn total(&self)->i32{self.book.cells.iter().map(|row|row[..self.columns].iter().map(|v|(*v).max(0)).sum::<i32>()).sum()}
}
#[cfg(test)]mod tests{
    use super::*;
    fn settle(g:&mut Game){for _ in 0..2000{if !g.moving{return}g.step();}panic!("dice did not settle")}
    #[test]fn complete_games_and_input_gates(){
        for seed in 1..=100{
            let mut g=Game::new(seed);assert!(!g.hold(0));assert!(!g.commit(1));
            for category in CATEGORIES{
                assert!(g.roll());assert!(!g.roll());assert!(!g.hold(0));assert!(!g.commit(category));settle(&mut g);
                let held=g.simulation.faces()[0];assert!(g.hold(0));assert!(g.roll());settle(&mut g);assert_eq!(g.simulation.faces()[0],held);
                assert!(g.hold(0));assert!(g.roll());settle(&mut g);assert!(!g.roll());
                assert!(g.preview(category)>=0);assert!(g.commit(category));assert!(!g.commit(category));
            }
            assert_eq!(g.turns,13);assert!(!g.roll());assert!(!g.hold(0));assert!(g.total()>=0);
        }
    }
    #[test]fn triple_game_fills_all_columns(){
        let mut g=Game::triple(42);
        for column in 1..=3{for category in CATEGORIES{
            assert!(g.roll());settle(&mut g);
            let face=g.simulation.faces()[0];assert!(g.hold(0));assert!(g.roll());settle(&mut g);assert_eq!(g.simulation.faces()[0],face);assert!(g.hold(0));
            let expected=g.preview_column(category,column);assert!(expected>=0);
            assert!(g.commit_column(category,column));assert_eq!(g.book.cells[category as usize][column-1],expected);
            assert!(!g.commit_column(category,column));
        }}
        assert_eq!(g.turns,39);assert!(!g.roll());assert_eq!(g.total(),g.book.cells.iter().flatten().map(|x|(*x).max(0)).sum());
    }
}
