import { describe, expect, it } from 'vitest';
import { renderScene } from '../../../../presentation/flows/__tests__/helpers/renderHarness';
import {
    TemporalFilter,
    TEMPORAL_FILTER_DEFAULT_HISTORY,
    TEMPORAL_FILTER_MAX_HISTORY,
} from '../TemporalFilter';

// Filtro de sinal traçado (spec 034, T044a): valores e validação, e os alvos do tamanho do canvas alocados só sob demanda;
// a média, os momentos e o guia como canais temporais da C2 (spec 037).

const TARGETS = [
    ['accumulated', 'rgba16float'],
    ['accumulatedMoments', 'rgba16float'],
    ['guide', 'rgba32uint'],
    ['work', 'rgba16float'],
    ['output', 'rgba16float'],
] as const;

/** A série temporal de cada alvo que é canal (duas fatias; a média e os momentos na precisão do filtro). */
const HISTORY: Readonly<Record<string, object>> = {
    accumulated: { depth: 2, precision: 'half' },
    accumulatedMoments: { depth: 2, precision: 'half' },
    guide: { depth: 2 },
};

describe('TemporalFilter (spec 034, T044a)', () => {
    it('padrão: ligado, 32 quadros; validação de 1–256 (o valor anterior fica)', () => {
        const d = new TemporalFilter();
        expect(d.data).toEqual({ enabled: 1, history_max: 32, historyPrecision: 0, _pad1: 0 });
        expect([d.enabled, d.maxHistory]).toEqual([true, TEMPORAL_FILTER_DEFAULT_HISTORY]);
        expect(new TemporalFilter({ enabled: false, maxHistory: 256 }).data).toMatchObject({
            enabled: 0,
            history_max: TEMPORAL_FILTER_MAX_HISTORY,
        });
        for (const n of [0, 257, Number.NaN])
            expect(() => new TemporalFilter({ maxHistory: n })).toThrow(RangeError);
        d.maxHistory = 8;
        expect(() => {
            d.maxHistory = 300;
        }).toThrow(RangeError);
        expect(d.maxHistory).toBe(8);
        d.enabled = false;
        expect(d.data.enabled).toBe(0);
    });

    it('descritores: parâmetros e os alvos do filtro (storage, do tamanho do canvas, sob demanda)', () => {
        const byId = new Map(new TemporalFilter().getDescriptors().map((d) => [d.id, d]));
        expect(byId.get('params')).toEqual({
            id: 'params',
            role: 'uniform',
            schema: TemporalFilter.schema,
        });
        for (const [id, format] of TARGETS)
            expect(byId.get(id)).toEqual({
                id,
                role: 'storage-texture',
                allocation: 'onDemand',
                textureShape: { format, sizeFromCanvas: true, access: 'write-only' },
                ...(HISTORY[id] !== undefined ? { history: HISTORY[id] } : {}),
            });
        expect(byId.size).toBe(TARGETS.length + 1);
    });

    it('a C2 aloca só os parâmetros na inserção; os alvos quando pedidos, no tamanho do canvas', async () => {
        const s = await renderScene();
        const d = new TemporalFilter();
        s.scene.world.insert(d);
        s.step();
        const rs = s.scene.resourceSystem;
        expect(rs.bufferOf(d, 'params')).toBeDefined();
        for (const [id] of TARGETS) expect(rs.textureOf(d, id)).toBeUndefined();
        for (const [id, format] of TARGETS) {
            rs.ensureAllocated(d, id);
            const t = rs.textureOf(d, id)!;
            expect([t.width, t.height, t.format]).toEqual([800, 600, format]);
            // Escrito como storage e lido como textura.
            expect(t.usage & GPUTextureUsage.STORAGE_BINDING).toBeTruthy();
            expect(t.usage & GPUTextureUsage.TEXTURE_BINDING).toBeTruthy();
            // Os canais: duas fatias distintas, a de agora e a do quadro anterior.
            const ch = rs.channelOf(d, id);
            expect(ch === undefined).toBe(HISTORY[id] === undefined);
            if (ch !== undefined) expect(ch.texture(1)).not.toBe(ch.texture(0));
        }
    });

    it("historyPrecision (spec 037): 'full' põe os alvos em rgba32float (os canais pela C2); mudar realoca", async () => {
        const full = new Map(
            new TemporalFilter({ historyPrecision: 'full' }).getDescriptors().map((d) => [d.id, d]),
        );
        expect(full.get('accumulated')?.history).toEqual({ depth: 2, precision: 'full' });
        expect(full.get('accumulatedMoments')?.history).toEqual({ depth: 2, precision: 'full' });
        expect(full.get('guide')?.history).toEqual({ depth: 2 });
        expect(full.get('work')?.textureShape?.format).toBe('rgba32float');
        expect(full.get('output')?.textureShape?.format).toBe('rgba32float');
        const s = await renderScene();
        const d = new TemporalFilter();
        s.scene.world.insert(d);
        s.step();
        const rs = s.scene.resourceSystem;
        rs.ensureAllocated(d, 'accumulated');
        const ch = rs.channelOf(d, 'accumulated')!;
        expect(ch.format).toBe('rgba16float');
        d.historyPrecision = 'full';
        expect(d.historyPrecision).toBe('full');
        s.step();
        rs.ensureAllocated(d, 'accumulated');
        // O mesmo canal, fatias novas no formato novo (a série recomeça).
        expect(rs.channelOf(d, 'accumulated')).toBe(ch);
        expect(ch.format).toBe('rgba32float');
        expect(ch.texture(0)!.format).toBe('rgba32float');
        expect(ch.texture(1)!.format).toBe('rgba32float');
    });
});
