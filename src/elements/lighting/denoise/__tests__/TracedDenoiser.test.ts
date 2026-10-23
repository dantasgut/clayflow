import { describe, expect, it } from 'vitest';
import { renderScene } from '../../../../presentation/flows/__tests__/helpers/renderHarness';
import {
    TracedDenoiser,
    TRACED_DENOISE_DEFAULT_HISTORY,
    TRACED_DENOISE_MAX_HISTORY,
} from '../TracedDenoiser';

// Filtro de sinal traçado (spec 034, T044a): valores e validação, e os alvos do tamanho do canvas alocados só sob demanda.

const TARGETS = [
    ['accumulated', 'rgba16float'],
    ['accumulatedMoments', 'rgba16float'],
    ['history', 'rgba16float'],
    ['historyMoments', 'rgba16float'],
    ['guidePrevious', 'rgba32float'],
    ['output', 'rgba16float'],
] as const;

describe('TracedDenoiser (spec 034, T044a)', () => {
    it('padrão: ligado, 32 quadros; validação de 1–256 (o valor anterior fica)', () => {
        const d = new TracedDenoiser();
        expect(d.data).toEqual({ enabled: 1, history_max: 32, _pad0: 0, _pad1: 0 });
        expect([d.enabled, d.maxHistory]).toEqual([true, TRACED_DENOISE_DEFAULT_HISTORY]);
        expect(new TracedDenoiser({ enabled: false, maxHistory: 256 }).data).toMatchObject({
            enabled: 0,
            history_max: TRACED_DENOISE_MAX_HISTORY,
        });
        for (const n of [0, 257, Number.NaN])
            expect(() => new TracedDenoiser({ maxHistory: n })).toThrow(RangeError);
        d.maxHistory = 8;
        expect(() => {
            d.maxHistory = 300;
        }).toThrow(RangeError);
        expect(d.maxHistory).toBe(8);
        d.enabled = false;
        expect(d.data.enabled).toBe(0);
    });

    it('descritores: parâmetros e os alvos do filtro (storage, do tamanho do canvas, sob demanda)', () => {
        const byId = new Map(new TracedDenoiser().getDescriptors().map((d) => [d.id, d]));
        expect(byId.get('params')).toEqual({
            id: 'params',
            role: 'uniform',
            schema: TracedDenoiser.schema,
        });
        for (const [id, format] of TARGETS)
            expect(byId.get(id)).toEqual({
                id,
                role: 'storage-texture',
                allocation: 'onDemand',
                textureShape: { format, sizeFromCanvas: true, access: 'write-only' },
            });
        expect(byId.size).toBe(TARGETS.length + 1);
    });

    it('a C2 aloca só os parâmetros na inserção; os alvos quando pedidos, no tamanho do canvas', async () => {
        const s = await renderScene();
        const d = new TracedDenoiser();
        s.scene.world.insert(d);
        s.step();
        const rs = s.scene.resourceSystem;
        expect(rs.bufferOf(d, 'params')).toBeDefined();
        for (const [id] of TARGETS) expect(rs.textureOf(d, id)).toBeUndefined();
        for (const [id, format] of TARGETS) {
            rs.ensureAllocated(d, id);
            const t = rs.textureOf(d, id)!;
            expect([t.width, t.height, t.format]).toEqual([800, 600, format]);
            // Escrito como storage, lido como textura e copiado para o quadro seguinte.
            expect(t.usage & GPUTextureUsage.STORAGE_BINDING).toBeTruthy();
            expect(t.usage & GPUTextureUsage.TEXTURE_BINDING).toBeTruthy();
            expect(t.usage & GPUTextureUsage.COPY_DST).toBeTruthy();
        }
    });
});
