/**
 * Chave de conteúdo das geometrias (spec 007, R1): paramétricas pela chave dos parâmetros, com os arrays gerados uma
 * vez por chave; arrays próprios pelo hash dos bytes; a nuvem de pontos (produzida na GPU) não tem chave.
 */
import { describe, expect, it } from 'vitest';
import { BoxGeometry } from '../BoxGeometry';
import { ParametricGeometry } from '../ParametricGeometry';
import { ParametricSurfaceGeometry } from '../ParametricSurfaceGeometry';
import { PlaneGeometry } from '../PlaneGeometry';
import { PointCloudGeometry } from '../PointCloudGeometry';
import { SphereGeometry } from '../SphereGeometry';
import { contentKeyOf } from '../geometryContent';

describe('chave de conteúdo das geometrias (spec 007)', () => {
    it('paramétricas: mesma chave e os mesmos arrays para os mesmos parâmetros', () => {
        const pairs = [
            [new BoxGeometry({ size: [1, 2, 3] }), new BoxGeometry({ size: [1, 2, 3] })],
            [new SphereGeometry({ radius: 0.5 }), new SphereGeometry({ radius: 0.5 })],
            [new PlaneGeometry({ size: [4, 4] }), new PlaneGeometry({ size: [4, 4] })],
        ] as const;
        for (const [a, b] of pairs) {
            expect(a.contentKey).toBeDefined();
            expect(a.contentKey).toBe(b.contentKey);
            expect(a.data.vertices).toBe(b.data.vertices);
            expect(a.data.indices).toBe(b.data.indices);
        }
        expect(new BoxGeometry({ size: [1, 1, 1] }).contentKey).not.toBe(
            new BoxGeometry({ size: [1, 1, 2] }).contentKey,
        );
        expect(new SphereGeometry({ radius: 1, latSegments: 8 }).contentKey).not.toBe(
            new SphereGeometry({ radius: 1, latSegments: 9 }).contentKey,
        );
    });

    it('superfície por função: mesma função e subdivisão compartilham; outra função não', () => {
        const f = (u: number, v: number) => [u, 0, v] as const;
        const g = (u: number, v: number) => [u, 1, v] as const;
        const a = new ParametricSurfaceGeometry(f, { uSteps: 4, vSteps: 4 });
        const b = new ParametricGeometry({ fn: f, uSteps: 4, vSteps: 4 });
        expect(a.contentKey).toBe(b.contentKey);
        expect(a.data.vertices).toBe(b.data.vertices);
        expect(new ParametricGeometry({ fn: g, uSteps: 4, vSteps: 4 }).contentKey).not.toBe(
            a.contentKey,
        );
        expect(new ParametricGeometry({ fn: f, uSteps: 5, vSteps: 4 }).contentKey).not.toBe(
            a.contentKey,
        );
    });

    it('arrays próprios: chave pelo hash dos bytes — iguais compartilham, diferentes não, mesmo no mesmo hash', () => {
        const box = new BoxGeometry({ size: [3, 3, 3] });
        box.data.vertices = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
        box.data.indices = new Uint16Array([0, 0, 0]);
        const twin = contentKeyOf(
            new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]),
            new Uint16Array([0, 0, 0]),
        );
        expect(box.contentKey).toBe(twin);
        expect(box.contentKey).toMatch(/^bytes:/);
        expect(
            contentKeyOf(new Float32Array([1, 2, 3, 4, 5, 6, 7, 9]), new Uint16Array([0, 0, 0])),
        ).not.toBe(twin);
        // Mesmos bytes de índice em formato diferente não são o mesmo conteúdo.
        expect(
            contentKeyOf(new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]), new Uint32Array([0, 0, 0])),
        ).not.toBe(twin);
    });

    it('nuvem de pontos não tem chave (dado produzido na GPU, sempre próprio)', () => {
        expect(new PointCloudGeometry({ maxParticles: 16 }).contentKey).toBeUndefined();
    });
});
