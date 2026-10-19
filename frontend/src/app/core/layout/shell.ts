import { BreakpointObserver } from '@angular/cdk/layout';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { LocationContextService } from '../context/location-context.service';
import { ThemeMenu } from '../theme/theme-menu';
import { NavSection, visibleNavigation } from './navigation';

const collapsedKey = 'pan.sidebar';
const closedSectionsKey = 'pan.sidebar.closed';

/**
 * App shell (frontend §4.1): top bar (menu button, brand, active location, user menu with profile, theme and sign
 * out) and the sidebar with the menu filtered by permissions. The sidebar collapses on desktop (remembered per
 * device) and is a drawer on phones. Each section folds on its own (remembered per device); the section of the
 * current page opens on navigation, and a folded one shows a dot when it holds the current page.
 */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatDividerModule,
    MatSidenavModule,
    MatSelectModule,
    MatTooltipModule,
    ThemeMenu,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  private readonly auth = inject(AuthService);
  protected readonly context = inject(LocationContextService);

  protected readonly user = this.auth.user;
  protected readonly navigation = computed(() => visibleNavigation((p) => this.auth.can(p)));
  protected readonly isHandset = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 767.98px)')
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );
  protected readonly collapsed = signal(readCollapsed());
  /** Collapsed only applies on desktop; the phone drawer always shows the labels. */
  protected readonly showCollapsed = computed(() => this.collapsed() && !this.isHandset());

  private readonly router = inject(Router);
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  private readonly closedSections = signal<ReadonlySet<string>>(readClosedSections());
  /** Section that holds the current page. */
  protected readonly activeSection = computed(() => sectionOf(this.navigation(), this.url()));

  constructor() {
    // Navigating into a folded section opens it.
    effect(() => {
      const section = this.activeSection();
      if (section && untracked(this.closedSections).has(section))
        untracked(() => this.toggleSection(section));
    });
  }

  /** The icon-only sidebar has no section headers: every item stays reachable. */
  protected isSectionOpen(label: string): boolean {
    return this.showCollapsed() || !this.closedSections().has(label);
  }

  protected toggleSection(label: string): void {
    const closed = new Set(this.closedSections());
    if (!closed.delete(label)) closed.add(label);
    this.closedSections.set(closed);
    try {
      if (closed.size > 0) localStorage.setItem(closedSectionsKey, JSON.stringify([...closed]));
      else localStorage.removeItem(closedSectionsKey);
    } catch {
      // Without storage the state lasts for this session.
    }
  }

  protected toggleMenu(drawer: MatSidenav): void {
    if (this.isHandset()) {
      void drawer.toggle();
      return;
    }
    const collapsed = !this.collapsed();
    this.collapsed.set(collapsed);
    try {
      if (collapsed) localStorage.setItem(collapsedKey, 'collapsed');
      else localStorage.removeItem(collapsedKey);
    } catch {
      // Without storage the state lasts for this session.
    }
  }

  protected closeOnPhone(drawer: MatSidenav): void {
    if (this.isHandset()) void drawer.close();
  }

  protected logout(): void {
    void this.auth.logout();
  }
}

function readClosedSections(): ReadonlySet<string> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(closedSectionsKey) ?? '[]');
    return new Set(
      Array.isArray(stored) ? stored.filter((s): s is string => typeof s === 'string') : [],
    );
  } catch {
    return new Set();
  }
}

/** The section whose item matches the URL (the longest route wins; "/" only matches itself). */
export function sectionOf(sections: readonly NavSection[], url: string): string | null {
  const path = url.split(/[?#]/)[0];
  let best: { label: string; length: number } | null = null;
  for (const section of sections)
    for (const { route } of section.items) {
      const matches = route === '/' ? path === '/' : path === route || path.startsWith(route + '/');
      if (matches && (!best || route.length > best.length))
        best = { label: section.label, length: route.length };
    }
  return best?.label ?? null;
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(collapsedKey) === 'collapsed';
  } catch {
    return false;
  }
}
