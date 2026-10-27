// @vitest-environment jsdom
// SPEC 9.7: adversarial UI tests. The worker is replaced by a direct call so the page logic itself is tested.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { thresholdsFor } from '../src/core/calibrate';
import { readText } from './helpers';

vi.mock('../src/ui/useWorker', () => ({
  useWorker: () => ({
    call: async (req: any) => ({ id: 1, kind: 'calibrate', result: thresholdsFor(req.T, req.N, req.seed, req.withBenchmark) }),
  }),
}));
import { Audit } from '../src/ui/Audit';

beforeAll(() => {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(cleanup);

const profile = async () => (await waitFor(() => screen.getByRole('region', { name: 'Evidence profile' }), { timeout: 20000 }));

describe('Auditor (adversarial)', () => {
  it('synthetic_boom_parallel.csv must NOT show "Harm plus a supporting signal"', async () => {
    render(<Audit />);
    fireEvent.click(screen.getByRole('button', { name: /Demand boom/ }));
    const p = await profile();
    expect(p.textContent).not.toMatch(/Harm plus a supporting signal/);
    expect(p.className).not.toMatch(/amber/);
  });

  it('synthetic_cartel_static.csv shows the amber blind-spot banner', async () => {
    render(<Audit />);
    fireEvent.click(screen.getByRole('button', { name: /Cartel that never reacts/ }));
    const p = await profile();
    expect(p.className).toMatch(/amber/);
    expect(p.textContent).toMatch(/Cannot decide from these logs/);
    expect(p.textContent).toMatch(/Harm with no supporting signal: the logs cannot decide/);
  });

  it('real log uploaded by hand, competitive 90 and monopoly 100: Talk not available, collusion index 0.6 to 0.7', async () => {
    const { container } = render(<Audit />);
    const content = readText('samples/real_pressure_oversight_run2.csv');
    const file = new File([content], 'real.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'text', { value: async () => content });
    fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [file] } });
    await waitFor(() => screen.getByLabelText(/Competitive price/));
    // Without a competitive price nothing is shown, and no profile is invented.
    expect(screen.queryByRole('region', { name: 'Evidence profile' })).toBeNull();
    expect(screen.getByText(/Enter the competitive price/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Competitive price/), { target: { value: '90' } });
    // Prices are not between 0 and 1: asks for the monopoly price instead of guessing a scale.
    await waitFor(() => screen.getByText(/enter a monopoly price/));
    fireEvent.change(screen.getByLabelText(/Monopoly price/), { target: { value: '100' } });
    const p = await profile();
    const m = /Collusion index (\d\.\d+)/.exec(p.textContent ?? '');
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(0.6);
    expect(Number(m![1])).toBeLessThanOrEqual(0.7);
    expect(container.textContent).toMatch(/Not available \(no flagged column\)/);
  });

  it('a garbage file shows a plain error that names the row, and no profile', async () => {
    const { container } = render(<Audit />);
    const content = 'round,agent,price\n1,a,0.3\n1,b,oops\n2,a,0.3\n2,b,0.31';
    const file = new File([content], 'bad.csv');
    Object.defineProperty(file, 'text', { value: async () => content });
    fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [file] } });
    await waitFor(() => screen.getByRole('alert'));
    expect(screen.getByRole('alert').textContent).toMatch(/Row 3: price "oops" is not a number/);
    expect(screen.queryByRole('region', { name: 'Evidence profile' })).toBeNull();
  });
});
