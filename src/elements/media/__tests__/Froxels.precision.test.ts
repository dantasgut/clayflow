import { describe, expect, it } from 'vitest';
import { Froxels } from '../Froxels';

// Precisão do histórico da névoa (spec 037, R6, T040): um canal temporal da C2 (duas fatias), lido filtrado; a precisão
// declarada no canal, resolvida pela C2 (32 bits só com `float32-filterable`).

const historyOf = (f: Froxels) => f.getDescriptors().find((d) => d.id === 'history');

describe('Froxels — historyPrecision', () => {
    it("padrão 'half': o histórico é um canal de duas fatias em rgba16float, lido filtrado", () => {
        const f = new Froxels();
        expect(f.historyPrecision).toBe('half');
        const h = historyOf(f)!;
        expect(h.textureShape?.format).toBe('rgba16float');
        expect(h.history).toEqual({ depth: 2, precision: 'half', filtered: true });
    });

    it("'full': só o histórico pede 32 bits (espalhamento e ambiente não são históricos)", () => {
        const f = new Froxels();
        f.historyPrecision = 'full';
        expect(f.historyPrecision).toBe('full');
        expect(historyOf(f)!.history).toEqual({ depth: 2, precision: 'full', filtered: true });
        const others = f
            .getDescriptors()
            .filter((d) => d.id === 'scatter' || d.id === 'ambient')
            .map((d) => [d.textureShape?.format, d.history]);
        expect(others).toEqual([
            ['rgba16float', undefined],
            ['rgba16float', undefined],
        ]);
    });
});
