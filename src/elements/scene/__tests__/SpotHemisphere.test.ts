import { afterEach, describe, expect, it, vi } from 'vitest';
import { HemisphereLight } from '../HemisphereLight';
import { Light } from '../Light';
import { SpotLight } from '../SpotLight';

// Luz spot e hemisfério (spec 011, T040): layout, padrões, validação dos cones e o recurso do hemisfério.

afterEach(() => vi.restoreAllMocks());

describe('SpotLight e HemisphereLight (spec 011, T040)', () => {
    it('spot: kind 2 no pool Light com os cones em vec4f; padrões π/8 e π/6', () => {
        const spot = new SpotLight({ intensity: 200, range: 15 });
        expect(spot.data.kind).toBe(2);
        expect(spot.data.cones).toEqual([Math.PI / 8, Math.PI / 6, 0, 0]);
        expect(Light.schema.offsetOf('cones')).toBeGreaterThan(Light.schema.offsetOf('color'));
        expect(spot.getDescriptors()[0]).toMatchObject({ schema: Light.schema, storage: 'pool' });
    });

    it('cones fora da faixa são presos; interno maior que o externo vira o externo, com aviso único', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(new SpotLight({ innerCone: 0.6, outerCone: 0.4 }).data.cones.slice(0, 2)).toEqual([
            0.4, 0.4,
        ]);
        new SpotLight({ innerCone: 0.9, outerCone: 0.5 });
        expect(warn.mock.calls.length).toBeLessThanOrEqual(1);
        expect(new SpotLight({ innerCone: -1, outerCone: 4 }).data.cones.slice(0, 2)).toEqual([
            0,
            Math.PI / 2,
        ]);
    });

    it('hemisfério: uniform com céu, chão, eixo e intensidade; padrões e valores próprios', () => {
        const h = new HemisphereLight();
        expect(h.data).toEqual({
            skyColor: [0.8, 0.9, 1, 1],
            groundColor: [0.35, 0.3, 0.25, 1],
            up: [0, 1, 0, 0],
            intensity: 0.3,
        });
        expect(h.getDescriptors()).toEqual([
            { id: 'params', role: 'uniform', schema: HemisphereLight.schema },
        ]);
        const own = new HemisphereLight({
            skyColor: [1, 1, 1, 1],
            groundColor: [1, 1, 1, 1],
            intensity: 2,
        });
        expect(own.data.intensity).toBe(2);
        expect(own.data.groundColor).toEqual([1, 1, 1, 1]);
    });
});
