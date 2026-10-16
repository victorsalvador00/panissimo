import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { buildCrumbs } from './breadcrumbs';

@Component({ template: '' })
class Dummy {}

describe('buildCrumbs', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'inventario',
            children: [
              {
                path: 'ajustes',
                title: 'Ajustes',
                children: [
                  { path: '', component: Dummy },
                  { path: ':id', title: 'Detalle del ajuste', component: Dummy },
                ],
              },
            ],
          },
        ]),
      ],
    }),
  );

  async function crumbsFor(url: string) {
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    return buildCrumbs(router.routerState.snapshot.root, router.url);
  }

  it('sección del menú + títulos de las rutas; la última no es enlace', async () => {
    expect(await crumbsFor('/inventario/ajustes/123')).toEqual([
      { label: 'Inventario' },
      { label: 'Ajustes', url: '/inventario/ajustes' },
      { label: 'Detalle del ajuste' },
    ]);
  });

  it('página de lista', async () => {
    expect(await crumbsFor('/inventario/ajustes')).toEqual([
      { label: 'Inventario' },
      { label: 'Ajustes' },
    ]);
  });
});
