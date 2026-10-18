import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { BreadcrumbsService } from './breadcrumbs.service';

@Component({ template: '' })
class Blank {}

describe('BreadcrumbsService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'inventario',
            data: { breadcrumb: 'Inventario' },
            children: [
              {
                path: 'ajustes',
                data: { breadcrumb: 'Ajustes' },
                children: [
                  { path: '', component: Blank },
                  { path: ':id', component: Blank, data: { breadcrumb: 'Detalle' } },
                ],
              },
            ],
          },
          { path: '', component: Blank },
        ]),
      ],
    });
  });

  it('builds one crumb per route with a label, after Inicio; the last one is not a link', async () => {
    await TestBed.inject(Router).navigateByUrl('/inventario/ajustes/a1');
    expect(TestBed.inject(BreadcrumbsService).crumbs()).toEqual([
      { label: 'Inicio', url: '/' },
      { label: 'Inventario', url: null },
      { label: 'Ajustes', url: '/inventario/ajustes' },
      { label: 'Detalle', url: null },
    ]);
  });

  it('lets a detail page show its folio until the next navigation', async () => {
    const router = TestBed.inject(Router);
    const breadcrumbs = TestBed.inject(BreadcrumbsService);
    await router.navigateByUrl('/inventario/ajustes/a1');
    breadcrumbs.setCurrent('AJ-00012');
    expect(breadcrumbs.crumbs().at(-1)).toEqual({ label: 'AJ-00012', url: null });

    await router.navigateByUrl('/inventario/ajustes');
    expect(breadcrumbs.crumbs().at(-1)).toEqual({ label: 'Ajustes', url: null });
  });

  it('shows only Inicio on the home page', async () => {
    await TestBed.inject(Router).navigateByUrl('/');
    expect(TestBed.inject(BreadcrumbsService).crumbs()).toEqual([{ label: 'Inicio', url: null }]);
  });
});
