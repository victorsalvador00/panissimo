import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { HelpService } from './help.service';

@Component({ template: '' })
class Blank {}

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'inventario/existencias', component: Blank },
        { path: 'inventario/ajustes/:id', component: Blank },
      ]),
    ],
  });
  return { help: TestBed.inject(HelpService), router: TestBed.inject(Router) };
}

describe('HelpService', () => {
  it('resolves the topic by the route pattern', async () => {
    const { help, router } = setup();
    await router.navigateByUrl('/inventario/ajustes/abc');
    expect(help.pattern()).toBe('inventario/ajustes/:id');
    expect(help.topic()?.title).toBe('Ajuste');
  });

  it('closes when a navigation started with the panel open ends, not before', async () => {
    const { help, router } = setup();
    await router.navigateByUrl('/inventario/existencias');
    help.toggle();
    expect(help.open()).toBe(true);
    await router.navigateByUrl('/inventario/ajustes/abc');
    expect(help.open()).toBe(false);
    expect(help.topic()?.title).toBe('Ajuste');
  });
});
