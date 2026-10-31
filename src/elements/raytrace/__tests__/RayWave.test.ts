import { describe, expect, it } from 'vitest';
import { RayWave } from '../RayWave';
import { RayWaveEntrySchema, rayWaveResources as R } from '../wave/shaders';
import { workHarness } from '../../gpu/__tests__/helpers/workHarness';

describe('RayWave (spec 039: a onda no Resource de trabalho)', () => {
    it('ensure declara a onda no trabalho; a C2 aloca e as fontes devolvidas são os buffers dela', () => {
        const h = workHarness();
        const wave = new RayWave(h.ctx, 'w');
        const first = wave.ensure(100, [], 0);
        const entries = h.resources.bufferOf(h.work, 'w:ray_wave');
        expect(entries?.byteSize).toBe(100 * RayWaveEntrySchema.stride);
        expect(first.bindings?.get(R.entries)).toBe(entries);
        expect(first.pipelines.map((p) => p.id)).toEqual([
            wave.resetId,
            wave.scanId,
            wave.scatterId,
        ]);
    });

    it('crescer realoca pela C2 (libera a onda antiga); caber não refaz nada', () => {
        const h = workHarness();
        const wave = new RayWave(h.ctx, 'w');
        wave.ensure(100, [], 0);
        const old = h.resources.bufferOf(h.work, 'w:ray_wave');
        expect(wave.ensure(50, [], 0).bindings).toBeUndefined();
        const grown = wave.ensure(400, [], 0);
        expect(wave.capacity).toBe(400);
        expect(h.core.destroy).toHaveBeenCalledWith(old);
        expect(grown.bindings?.get(R.entries)).toBe(h.resources.bufferOf(h.work, 'w:ray_wave'));
    });
});
