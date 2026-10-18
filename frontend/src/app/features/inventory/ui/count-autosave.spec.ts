import { CountAutosave } from './count-autosave';

describe('CountAutosave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(results: (number | Error)[]) {
    const calls: { version: number; counts: Record<string, number> }[] = [];
    const saved: number[] = [];
    const autosave = new CountAutosave(
      1,
      async (version, counts) => {
        calls.push({ version, counts: Object.fromEntries(counts) });
        const next = results.shift();
        if (next instanceof Error) throw next;
        return { version: next! };
      },
      (result) => saved.push(result.version),
    );
    return { autosave, calls, saved };
  }

  it('waits 1 s after the last change and sends the latest value of each line', async () => {
    const { autosave, calls } = setup([2]);
    autosave.change('a', 1);
    vi.advanceTimersByTime(500);
    autosave.change('a', 12);
    autosave.change('b', 3);
    vi.advanceTimersByTime(999);
    expect(calls).toHaveLength(0);
    expect(autosave.state()).toBe('pending');

    vi.advanceTimersByTime(1);
    await autosave.flush();
    expect(calls).toEqual([{ version: 1, counts: { a: 12, b: 3 } }]);
    expect(autosave.state()).toBe('saved');
  });

  it('saves one after another with the version of the previous save', async () => {
    const { autosave, calls, saved } = setup([2, 3]);
    autosave.change('a', 1);
    const first = autosave.flush();
    autosave.change('b', 2);
    const second = autosave.flush();
    await Promise.all([first, second]);
    expect(calls.map((c) => c.version)).toEqual([1, 2]);
    expect(saved).toEqual([2, 3]);
  });

  it('keeps the quantities of a failed save for the next attempt', async () => {
    const { autosave, calls } = setup([new Error('red'), 5]);
    autosave.change('a', 4);
    await autosave.flush();
    expect(autosave.state()).toBe('error');
    expect(autosave.hasPending).toBe(true);

    await autosave.flush();
    expect(calls[1]).toEqual({ version: 1, counts: { a: 4 } });
    expect(autosave.state()).toBe('saved');
  });

  it('ignores a cleared field', async () => {
    const { autosave, calls } = setup([]);
    autosave.change('a', null);
    await autosave.flush();
    expect(calls).toHaveLength(0);
    expect(autosave.state()).toBe('idle');
  });
});
