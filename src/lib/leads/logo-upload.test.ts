import { describe, expect, test } from 'vitest';
import { emailLogoType } from './logo-upload';

describe('logo de los emails', () => {
  test('PNG y JPG por sus bytes; SVG, WEBP o un texto, no', () => {
    expect(emailLogoType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png');
    expect(emailLogoType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(emailLogoType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(emailLogoType(new TextEncoder().encode('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '))).toBeNull();
    expect(emailLogoType(new Uint8Array([]))).toBeNull();
  });
});
