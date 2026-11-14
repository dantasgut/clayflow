import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Spec 034 (T065, SC-017): a água e o vidro vêm pelo traçado da refração — nenhum Flow copia a cor da cena para ler
// "o que está atrás" (a cópia da tela), e o caminho antigo da água (`water_background`, `WaterFlow`, `water_composite`,
// `WaterSurface`, `FluidFieldPassFlow`) não volta. Este teste conta os sites no gate.

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');

function files(dir: string, ext: readonly string[]): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) out.push(...files(p, ext));
        else if (ext.some((e) => entry.endsWith(e))) out.push(p);
    }
    return out;
}

/** Código sem comentários (uma menção num comentário não é uso). */
function code(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function sources(dirs: readonly string[], ext: readonly string[]): { rel: string; src: string }[] {
    return dirs
        .flatMap((d) => files(join(SRC, d), ext))
        .map((p) => ({
            rel: relative(SRC, p).replace(/\\/g, '/'),
            src: code(readFileSync(p, 'utf8')),
        }))
        .filter((f) => !f.rel.includes('__tests__/') && !f.rel.startsWith('__smokes__/'));
}

describe('sem cópia da tela (spec 034, T065)', () => {
    it('nenhum copyTextureToTexture em src/elements, src/presentation e src/platform', () => {
        const sites = sources(['elements', 'presentation', 'platform'], ['.ts']).flatMap((f) =>
            [...f.src.matchAll(/\bcopyTextureToTexture\s*\(/g)].map(() => f.rel),
        );
        expect(sites).toEqual([]);
    });

    it('o caminho antigo da água não reaparece (TS e WGSL)', () => {
        const sites = sources(['.'], ['.ts', '.wgsl']).flatMap((f) =>
            [
                ...f.src.matchAll(
                    /\b(water_background|water_composite|WaterFlow|WaterSurface|FluidFieldPassFlow)\b/g,
                ),
            ].map((m) => `${f.rel}: ${m[1]}`),
        );
        expect(sites).toEqual([]);
    });
});
