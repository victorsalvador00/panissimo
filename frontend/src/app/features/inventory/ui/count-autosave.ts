import { signal } from '@angular/core';

export type AutosaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface CountSaveResult {
  version: number;
}

/**
 * Autosave of a blind count (frontend §7.3): the counted quantities wait 1 s after the last change (or until the
 * field loses focus or the app is hidden) and go out one save after another, each with the version the previous
 * one returned. A failed save keeps its quantities to retry with the next change or `flush()`.
 */
export class CountAutosave<T extends CountSaveResult> {
  readonly state = signal<AutosaveState>('idle');

  private readonly pending = new Map<string, number>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private version: number,
    private readonly save: (version: number, counts: Map<string, number>) => Promise<T>,
    private readonly saved: (result: T) => void,
    private readonly delayMs = 1000,
  ) {}

  /** A new counted quantity for a line; null (field cleared) is not sent. */
  change(lineId: string, counted: number | null): void {
    if (counted === null || Number.isNaN(counted)) return;
    this.pending.set(lineId, counted);
    this.state.set('pending');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.delayMs);
  }

  /** Sends what is pending now (blur, hidden app, leaving the page, closing the count). */
  flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pending.size === 0) return this.chain;
    const counts = new Map(this.pending);
    this.pending.clear();
    this.chain = this.chain.then(async () => {
      this.state.set('saving');
      try {
        const result = await this.save(this.version, counts);
        this.version = result.version;
        this.saved(result);
        this.state.set(this.pending.size > 0 ? 'pending' : 'saved');
      } catch {
        // Keep them for the next attempt, unless a newer value arrived meanwhile.
        for (const [lineId, counted] of counts)
          if (!this.pending.has(lineId)) this.pending.set(lineId, counted);
        this.state.set('error');
      }
    });
    return this.chain;
  }

  /** The version changed elsewhere (start, add line): the next save uses it. */
  setVersion(version: number): void {
    this.version = version;
  }

  get hasPending(): boolean {
    return this.pending.size > 0;
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
  }
}
