//! Only the original data literals are read. Gameplay is implemented in Rust.
use serde_json::{Map, Value};
pub fn parse(text: &str) -> Result<Value, String> {
    let mut p = Parser {
        b: text.as_bytes(),
        i: 0,
    };
    let v = p.value()?;
    p.space();
    if p.i < p.b.len() {
        return Err(format!("Trailing data at {}", p.i));
    }
    Ok(v)
}
struct Parser<'a> {
    b: &'a [u8],
    i: usize,
}
impl Parser<'_> {
    fn space(&mut self) {
        while self.i < self.b.len() && self.b[self.i].is_ascii_whitespace() {
            self.i += 1
        }
    }
    fn value(&mut self) -> Result<Value, String> {
        self.space();
        match self.b.get(self.i).copied() {
            Some(b'[') => {
                self.i += 1;
                self.space();
                if self.b.get(self.i) == Some(&b']') {
                    self.i += 1;
                    return Ok(Value::Array(vec![]));
                }
                if self.b.get(self.i) == Some(&b':') {
                    self.i += 2;
                    return Ok(Value::Object(Map::new()));
                }
                let first = self.value()?;
                self.space();
                let dict = self.b.get(self.i) == Some(&b':');
                let mut array = vec![];
                let mut map = Map::new();
                let mut key = first;
                loop {
                    if dict {
                        if self.b.get(self.i) != Some(&b':') {
                            return Err(format!("Expected colon at {}", self.i));
                        }
                        self.i += 1;
                        map.insert(key.as_str().unwrap_or("").to_lowercase(), self.value()?);
                    } else {
                        array.push(key.clone());
                    }
                    self.space();
                    match self.b.get(self.i) {
                        Some(b']') => {
                            self.i += 1;
                            break;
                        }
                        Some(b',') => {
                            self.i += 1;
                            key = self.value()?;
                            self.space()
                        }
                        _ => return Err(format!("Expected list separator at {}", self.i)),
                    }
                }
                Ok(if dict {
                    Value::Object(map)
                } else {
                    Value::Array(array)
                })
            }
            Some(b'"') => {
                self.i += 1;
                let start = self.i;
                while self.b.get(self.i) != Some(&b'"') {
                    if self.i >= self.b.len() {
                        return Err("Unterminated string".into());
                    }
                    self.i += 1
                }
                let s = String::from_utf8_lossy(&self.b[start..self.i]).into_owned();
                self.i += 1;
                Ok(Value::String(s))
            }
            Some(b'#') => {
                self.i += 1;
                let start = self.i;
                while self.i < self.b.len()
                    && (self.b[self.i].is_ascii_alphanumeric() || self.b[self.i] == b'_')
                {
                    self.i += 1
                }
                Ok(Value::String(
                    String::from_utf8_lossy(&self.b[start..self.i]).into_owned(),
                ))
            }
            Some(_) => {
                let start = self.i;
                while self.i < self.b.len() && !b" ,:\t\r\n]".contains(&self.b[self.i]) {
                    self.i += 1
                }
                let s = std::str::from_utf8(&self.b[start..self.i]).map_err(|e| e.to_string())?;
                let n = s
                    .parse::<f64>()
                    .map_err(|_| format!("Invalid data literal {s} at {start}"))?;
                Ok(serde_json::json!(n))
            }
            None => Err("Unexpected end of data".into()),
        }
    }
}
