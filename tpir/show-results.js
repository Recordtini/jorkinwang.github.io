// Values already exposed by each game. A null result means its prize data has
// not yet been connected; never substitute a different segment's prize.
export function gameWinnings(name, s, won) {
  const digits = a => Array.isArray(a) ? Number(a.join('')) : NaN;
  const win = value => won ? value : 0;
  switch (name) {
    case 'rangegame': return win(s.price);
    case 'mostexpensive': return win(s.prices.reduce((a, b) => a + b, 0));
    case 'squeezeplay': case 'flipflop': return win(s.real);
    case 'doubleprices': case 'freezeframe': return win(s.real);
    case 'oneaway': case 'bonkers': return win(digits(s.real));
    case 'clockgame': return s.real.slice(0, s.prizes).reduce((a,b) => a+b, 0) + (won ? 1000 : 0);
    case 'safecrackers': return s.winnings;
    case 'luckyseven': return won ? s.price + s.dollars - 1 : 0;
    case 'checkgame': return won ? s.cash + s.price : 0;
    case 'punchabunch': return s.cash;
    default: return null;
  }
}
export function rowWinnings(row) { return row.won ? row.price + row.bonus : 0; }
