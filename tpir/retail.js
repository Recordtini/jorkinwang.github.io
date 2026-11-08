// Retail product-script adapter. Native parser: 0x48d4f0, selector: 0x490980.
// Each script alternates a prize tuple (category 0) and pricing tuple (category 1).
// The supplied install has one English u00 group per game; its play counter
// advances through tuples in source order and wraps at the group's end.
export class ScriptSequence {
  constructor(scripts, products, counters = {}, persist = () => {}) {
    this.scripts = scripts; this.byId = new Map(products.map(p => [p.id, p]));
    this.counters = counters; this.persist = persist;
  }
  take(name, category = 0) {
    if (category !== 0 && category !== 1) throw new Error('Bad product category');
    const script = this.scripts[`${name}.u00.txt`];
    if (!script?.slots?.length) throw new Error(`Missing retail product script: ${name}`);
    const key = `${name}:${category}`, count = this.counters[key] ?? 0;
    const index = Number.isInteger(count) && count >= 0 && count < script.slots.length ? count : 0;
    const tuple = script.slots[index][category].map(id => {
      const product = this.byId.get(id);
      if (!product) throw new Error(`Unknown retail product ${id}`);
      return product;
    });
    this.counters[key] = (index + 1) % script.slots.length;
    this.persist(this.counters);
    return tuple;
  }
}
let catalog;
export async function retail() {
  if (!catalog) catalog = (async () => {
    const get = async url => { const response = await fetch(url); if (!response.ok) throw new Error(`${url}: ${response.status}`); return response.json(); };
    const [scripts, products] = await Promise.all([get('product-scripts.json'), get('retail-products.json')]);
    let profile = 'standalone';
    try { profile = JSON.parse(localStorage.getItem('tpir.save.v1'))?.current || profile; } catch {}
    const key = `tpir.retail.scriptCounters.v1:${profile}`;
    let counters = {}; try { counters = JSON.parse(localStorage.getItem(key)) || {}; } catch {}
    return new ScriptSequence(scripts, products, counters, value => {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
    });
  })();
  return catalog;
}
