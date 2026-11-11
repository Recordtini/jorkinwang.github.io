// Logo resource IDs from the retail screen 001 manifest. Explicit mappings
// cover titles whose displayed spelling differs from the asset name.
const LOGOS = {
  'Three Strikes':2424, 'Bonkers':2426, 'Check Game':2427, 'Check Out':2428,
  'Cliff Hangers':2429, 'Clock Game':2430, 'Contestants Row':2431,
  'Dice Game':2432, 'Double Prices':2433, 'Flip Flop':2434, 'Freeze Frame':2435,
  'Golden Road':2436, 'Grocery Game':2437, 'Half Off':2438, 'Hole in One':2439,
  "It's in the Bag":2440, 'Lucky Seven':2441, 'Master Key':2442, 'Money Game':2443,
  'Most Expensive':2444, 'One Away':2445, 'Plinko':2446, 'Punch a Bunch':2447,
  'Push Over':2448, 'Race Game':2449, 'Range Game':2450, 'Safe Crackers':2451,
  'Secret X':2452, 'Shell Game':2453, 'Showcase':2454, 'Showcase Showdown':2455,
  'Spelling Bee':2456, 'Squeeze Play':2457,
};
export function arcadeCatalog(games, unavailable) {
  return [ ...Object.entries(games).map(([k,g]) => ({k,name:g.name,lock:false,logo:LOGOS[g.name]})),
    ...unavailable.map(name=>({k:null,name,lock:true,hint:'not yet ported',logo:LOGOS[name]})) ];
}
