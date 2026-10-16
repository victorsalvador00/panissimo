import { Subject } from 'rxjs';
import { withLock } from './with-lock';

/** Web Locks mínimo en memoria: un candado por nombre, las solicitudes esperan en fila. */
function fakeLocks() {
  const queues = new Map<string, Promise<void>>();
  return {
    request(name: string, callback: () => Promise<void>): Promise<void> {
      const previous = queues.get(name) ?? Promise.resolve();
      const next = previous.then(() => callback());
      queues.set(
        name,
        next.catch(() => undefined),
      );
      return next;
    },
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve));

describe('withLock', () => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'locks');

  afterEach(() => {
    if (original) {
      Object.defineProperty(navigator, 'locks', original);
    } else {
      delete (navigator as { locks?: unknown }).locks;
    }
  });

  it('sin Web Locks ejecuta directamente', () => {
    Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });
    const values: number[] = [];
    const source = new Subject<number>();
    withLock('x', () => source).subscribe((v) => values.push(v));
    source.next(1);
    expect(values).toEqual([1]);
  });

  it('dos renovaciones (dos pestañas) se turnan: la segunda empieza cuando termina la primera', async () => {
    Object.defineProperty(navigator, 'locks', { value: fakeLocks(), configurable: true });
    const first = new Subject<string>();
    const second = new Subject<string>();
    const started: string[] = [];
    const results: string[] = [];

    withLock('sgo-auth-refresh', () => {
      started.push('primera');
      return first;
    }).subscribe((v) => results.push(v));
    withLock('sgo-auth-refresh', () => {
      started.push('segunda');
      return second;
    }).subscribe((v) => results.push(v));

    await tick();
    expect(started).toEqual(['primera']);

    first.next('token-1');
    first.complete();
    await tick();
    expect(started).toEqual(['primera', 'segunda']);

    second.next('token-2');
    second.complete();
    expect(results).toEqual(['token-1', 'token-2']);
  });

  it('un error libera el candado', async () => {
    Object.defineProperty(navigator, 'locks', { value: fakeLocks(), configurable: true });
    const failing = new Subject<string>();
    let errored = false;
    let secondRan = false;

    withLock('k', () => failing).subscribe({ error: () => (errored = true) });
    withLock('k', () => {
      secondRan = true;
      return new Subject<string>();
    }).subscribe();

    await tick();
    failing.error(new Error('401'));
    await tick();
    expect(errored).toBe(true);
    expect(secondRan).toBe(true);
  });
});
