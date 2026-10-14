/**
 * Superfície de água da cena (spec 017): todos os descritores sob demanda — nada alocado na inserção; `ensureAllocated`
 * aloca textura (com o tamanho do canvas ou o lado da vista da luz) e buffer; as do tamanho do canvas são recriadas com
 * ele; validação do `lightSize`; sinal de produção por vista.
 */
import { describe, expect, it } from 'vitest';
import { createScene } from '../../scene/SceneContext';
import { countingCore } from '../../scene/__tests__/helpers/countingCore';
import { WATER_LIGHT_TEXTURES, WATER_VIEW_TEXTURES, WaterSurface } from '../app/WaterSurface';

function setup(lightSize?: number) {
    const counting = countingCore();
    const scene = createScene({ core: counting.core });
    const water = new WaterSurface(lightSize === undefined ? {} : { lightSize });
    scene.world.insert(water);
    return { scene, water, rs: scene.resourceSystem, counting };
}

describe('WaterSurface (spec 017)', () => {
    it('nada alocado na inserção', () => {
        const s = setup();
        for (const d of s.water.getDescriptors()) {
            expect(d.allocation).toBe('onDemand');
            expect(s.rs.textureOf(s.water, d.id)).toBeUndefined();
            expect(s.rs.bufferOf(s.water, d.id)).toBeUndefined();
        }
    });

    it('ensureAllocated aloca as texturas da vista (canvas) e da luz (lightSize) e os buffers', () => {
        const s = setup(256);
        for (const id of [...WATER_VIEW_TEXTURES, ...WATER_LIGHT_TEXTURES])
            s.rs.ensureAllocated(s.water, id);
        const size = s.counting.core.canvasSize()!;
        const depth = s.rs.textureOf(s.water, 'depth')!;
        expect([depth.width, depth.height, depth.format]).toEqual([
            size.width,
            size.height,
            'r32float',
        ]);
        expect(s.rs.textureViewOf(s.water, 'depth')).toBeDefined();
        const light = s.rs.textureOf(s.water, 'lightDepth')!;
        expect([light.width, light.height]).toEqual([256, 256]);
        expect(s.rs.textureOf(s.water, 'caustics')!.format).toBe('rgba16float');
        expect(s.rs.textureOf(s.water, 'material')!.format).toBe('r32uint');
        const photons = s.rs.bufferOf(s.water, 'photons')!;
        expect(photons.byteSize).toBeGreaterThanOrEqual(3 * 256 * 256 * 4);
        expect(s.rs.bufferOf(s.water, 'lightMatrix')).toBeDefined();
        // Pedir de novo não realoca.
        s.rs.ensureAllocated(s.water, 'depth');
        expect(s.rs.textureOf(s.water, 'depth')).toBe(depth);
    });

    it('texturas do tamanho do canvas recriadas com ele; as da luz ficam', () => {
        const s = setup();
        s.rs.ensureAllocated(s.water, 'depth');
        s.rs.ensureAllocated(s.water, 'lightDepth');
        const light = s.rs.textureOf(s.water, 'lightDepth');
        s.scene.events.emit('canvasReconfigured', {
            width: 320,
            height: 200,
            format: 'bgra8unorm',
        });
        const depth = s.rs.textureOf(s.water, 'depth')!;
        expect([depth.width, depth.height]).toEqual([320, 200]);
        expect(s.rs.textureOf(s.water, 'lightDepth')).toBe(light);
    });

    it('lightSize validado; sinal de produção por vista', () => {
        expect(() => new WaterSurface({ lightSize: 8 })).toThrow(/lightSize/);
        expect(() => new WaterSurface({ lightSize: 100.5 })).toThrow(/lightSize/);
        const w = new WaterSurface();
        expect(w.lightSize).toBe(512);
        expect([w.isProduced('camera'), w.isProduced('light')]).toEqual([false, false]);
        w.markProduced('light', true);
        expect([w.isProduced('camera'), w.isProduced('light')]).toEqual([false, true]);
    });
});
