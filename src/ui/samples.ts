// Example files shown as "Try an example". Bundled into the page, so no download and no network call.
const raw = import.meta.glob('../../samples/*.csv', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export interface Sample {
  file: string;
  label: string;
  blurb: string;
  text: string;
  mode: 'pairwise' | 'restOfMarket';
  competitive?: number;
  monopoly?: number;
}

const META: Record<string, Omit<Sample, 'file' | 'text'>> = {
  synthetic_competitive: { label: 'Normal competition', blurb: 'Nobody colludes.', mode: 'pairwise' },
  synthetic_boom_parallel: { label: 'Demand boom', blurb: 'Nobody colludes, but prices rise with demand.', mode: 'pairwise' },
  synthetic_talk_no_action: { label: 'Talk, no action', blurb: 'Two sellers talk about colluding but price normally.', mode: 'pairwise' },
  synthetic_cartel_tacit: { label: 'Cartel that reacts', blurb: 'Two sellers hold a high price and follow each other.', mode: 'pairwise' },
  synthetic_cartel_static: { label: 'Cartel that never reacts', blurb: 'The blind spot: a high price with no reaction.', mode: 'pairwise' },
  real_base: { label: 'Real AI sellers: no messages', blurb: '5 LLM sellers, no chat (Agrawal et al. 2025).', mode: 'restOfMarket', competitive: 90, monopoly: 100 },
  real_boss_pressure: { label: 'Real AI sellers: profit pressure', blurb: 'Told to maximise profit, no chat.', mode: 'restOfMarket', competitive: 90, monopoly: 100 },
  real_seller_comms: { label: 'Real AI sellers: can chat', blurb: 'Sellers may message each other.', mode: 'restOfMarket', competitive: 90, monopoly: 100 },
  real_oversight: { label: 'Real AI sellers: chat watched', blurb: 'An overseer cuts messages after round 4.', mode: 'restOfMarket', competitive: 90, monopoly: 100 },
  real_pressure_oversight_run2: { label: 'Real AI sellers: pressure + watched', blurb: 'Pressure and an overseer. Messages included.', mode: 'restOfMarket', competitive: 90, monopoly: 100 },
};

export const SAMPLES: Sample[] = Object.entries(META).flatMap(([name, m]) => {
  const text = raw[`../../samples/${name}.csv`];
  return text === undefined ? [] : [{ file: `${name}.csv`, text, ...m }];
});
