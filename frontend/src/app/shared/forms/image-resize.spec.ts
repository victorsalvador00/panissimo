import { describe, expect, it } from 'vitest';
import { fitSize, skuFromFileName } from './image-resize';

describe('fitSize', () => {
  it('fits the longer side and keeps the proportion', () => {
    expect(fitSize(4000, 3000, 512)).toEqual({ width: 512, height: 384 });
    expect(fitSize(1080, 1920, 96)).toEqual({ width: 54, height: 96 });
  });

  it('never enlarges a small image', () => {
    expect(fitSize(300, 200, 512)).toEqual({ width: 300, height: 200 });
  });
});

describe('skuFromFileName', () => {
  it('takes the SKU from the file name, in capitals and without the extension', () => {
    expect(skuFromFileName('TRENZA.jpg')).toBe('TRENZA');
    expect(skuFromFileName('concha-g.PNG')).toBe('CONCHA-G');
    expect(skuFromFileName(String.raw`C:\fotos\PAN.BLANCO.webp`)).toBe('PAN.BLANCO');
    expect(skuFromFileName('fotos/BOLILLO.jpg')).toBe('BOLILLO');
    expect(skuFromFileName('SIN-EXTENSION')).toBe('SIN-EXTENSION');
  });
});
