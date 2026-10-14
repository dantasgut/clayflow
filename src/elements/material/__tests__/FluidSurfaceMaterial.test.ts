/**
 * Material de água (spec 017): padrões de água clara, validação, empacotamento no struct próprio, topologia de pontos e
 * nenhuma sombra projetada (a água atenua a luz, não a bloqueia); sem shader de forward.
 */
import { describe, expect, it } from 'vitest';
import { FluidSurfaceMaterial } from '../FluidSurfaceMaterial';

describe('FluidSurfaceMaterial (spec 017)', () => {
    it('padrões: água clara, ior 1,333, cáusticas ligadas', () => {
        const m = new FluidSurfaceMaterial();
        expect(m.data.ior).toBeCloseTo(1.333);
        expect(m.data.caustics).toBe(1);
        expect(m.data.absorption.slice(0, 3).every((a) => a >= 0)).toBe(true);
        expect(m.data.particleRadius).toBe(0); // automático pelo espaçamento
        expect(m.topology).toBe('point-list');
        expect(m.castsShadow).toBe(false);
        expect(m.getPipelineDescriptors()).toEqual([]);
        expect(m.getDescriptors()).toEqual([
            {
                id: 'material',
                role: 'storage-ro',
                schema: FluidSurfaceMaterial.schema,
                storage: 'pool',
            },
        ]);
    });

    it('opções: cáusticas desligadas, cores e escalares', () => {
        const m = new FluidSurfaceMaterial({
            caustics: false,
            ior: 1.5,
            color: [1, 0, 0, 1],
            absorption: [1, 2, 3, 0],
            particleRadius: 0.02,
        });
        expect(m.data.caustics).toBe(0);
        expect(m.data.ior).toBe(1.5);
        expect(m.data.color).toEqual([1, 0, 0, 1]);
        expect(m.data.particleRadius).toBe(0.02);
    });

    it('validação: ior < 1, absorção negativa, vetores malformados e escalares negativos', () => {
        expect(() => new FluidSurfaceMaterial({ ior: 0.9 })).toThrow(/ior/);
        expect(() => new FluidSurfaceMaterial({ absorption: [-1, 0, 0, 0] })).toThrow(/absorption/);
        expect(() => new FluidSurfaceMaterial({ color: [1, 1, 1] })).toThrow(/color/);
        expect(() => new FluidSurfaceMaterial({ ambient: [Number.NaN, 0, 0, 1] })).toThrow(
            /ambient/,
        );
        expect(() => new FluidSurfaceMaterial({ smoothingRadius: -1 })).toThrow(/smoothingRadius/);
        expect(() => new FluidSurfaceMaterial({ depthThreshold: 0 })).toThrow(/depthThreshold/);
        expect(() => new FluidSurfaceMaterial({ rippleSize: 0 })).toThrow(/rippleSize/);
        expect(() => new FluidSurfaceMaterial({ rippleStrength: -1 })).toThrow(/rippleStrength/);
    });

    it('empacota no layout do struct (sem padding implícito a mais)', () => {
        const schema = FluidSurfaceMaterial.schema;
        expect(schema.stride).toBe(112);
        const m = new FluidSurfaceMaterial({ ior: 1.25 });
        const bytes = schema.pack(m.data as unknown as Record<string, unknown>);
        const f32 = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
        expect(f32[schema.offsetOf('ior') / 4]).toBe(1.25);
        const u32 = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
        expect(u32[schema.offsetOf('caustics') / 4]).toBe(1);
    });
});
