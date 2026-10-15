/**
 * Spec 009 (US3): superfície paramétrica — grade e índices fixos, validação, e o `SurfaceFlow` avaliando quando a
 * superfície entra, quando muda e a cada quadro só com `animated`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StandardMaterial } from '../../material/StandardMaterial';
import { Transform } from '../../scene/Transform';
import { ParametricSurface } from '../ParametricSurface';
import { SurfaceFlow } from '../SurfaceFlow';
import {
    registerStages,
    renderScene,
} from '../../../presentation/flows/__tests__/helpers/renderHarness';
import { Camera } from '../../scene/Camera';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ParametricSurface (spec 009)', () => {
    it('grade nu × nv: dois triângulos por célula, face da frente para du × dv', () => {
        const s = new ParametricSurface({ resolution: [3, 2] });
        expect(s.vertexCount).toBe(6);
        expect(s.indexCount).toBe(12);
        expect([...s.data.indices.slice(0, 6)]).toEqual([0, 1, 3, 1, 4, 3]);
        expect(s.contentKey).toBeUndefined();
        expect(s.getDescriptors()[0]).toMatchObject({
            id: 'vertices',
            role: 'vertex',
            upload: 'never',
        });
    });

    it('domínio e parâmetros padrão pela pronta; validação da resolução e do domínio', () => {
        const sphere = new ParametricSurface({ preset: 'sphere' });
        expect(sphere.data.domain).toEqual([0, 2 * Math.PI, 0, Math.PI]);
        expect(sphere.data.params).toEqual([1]);
        expect(() => new ParametricSurface({ resolution: [1, 4] })).toThrow(/resolução/);
        expect(() => new ParametricSurface({ domain: [0, 0, 0, 1] })).toThrow(/domínio/);
    });
});

describe('SurfaceFlow (spec 009)', () => {
    async function scene(animated: boolean) {
        const s = await renderScene();
        s.scene.flows.register((ctx) => new SurfaceFlow(ctx), {
            type: 'surface',
            phase: 'transform',
        });
        const surface = new ParametricSurface({ preset: 'torus', resolution: [8, 8], animated });
        s.scene.world.insert(surface.add(new StandardMaterial()).add(new Transform()));
        const evals = () => s.computes().filter((l) => l === 'SurfaceFlow').length;
        return { ...s, surface, evals };
    }

    it('avalia quando a superfície entra e quando muda; parada, não repete', async () => {
        const s = await scene(false);
        s.step();
        expect(s.evals()).toBe(1);
        s.step();
        expect(s.evals()).toBe(0);
        s.surface.data.params = [2, 0.5];
        s.step();
        expect(s.evals()).toBe(1);
    });

    it('com animated, avalia a cada quadro', async () => {
        const s = await scene(true);
        s.step();
        s.step();
        expect(s.evals()).toBe(1);
        s.step();
        expect(s.evals()).toBe(1);
    });
});

describe('geometria diferencial (spec 010)', () => {
    it('differential declara o pool SurfaceDiff (um registro por vértice, só da GPU)', () => {
        const plain = new ParametricSurface({ resolution: [4, 3] });
        expect(plain.getDescriptors().some((d) => d.id === 'diff')).toBe(false);
        const diff = new ParametricSurface({ resolution: [4, 3], differential: true });
        expect(diff.getDescriptors().find((d) => d.id === 'diff')).toMatchObject({
            storage: 'pool',
            upload: 'never',
            count: 12,
        });
    });

    it('superfície com e sem geometria diferencial é desenhada (campo opcional do registro sem o descritor)', async () => {
        for (const differential of [false, true]) {
            const s = await renderScene();
            registerStages(s.scene, { forward: 'scene' });
            s.scene.flows.register((ctx) => new SurfaceFlow(ctx), {
                type: 'surface',
                phase: 'transform',
                priority: -40,
            });
            s.scene.world.insert(new Camera().add(new Transform({ position: [0, 0, 3, 1] })));
            const surface = new ParametricSurface({
                preset: 'sphere',
                resolution: [8, 6],
                differential,
            });
            s.scene.world.insert(surface.add(new StandardMaterial()).add(new Transform()));
            s.step();
            expect(s.computes()).toContain('SurfaceFlow');
            s.step();
            expect(s.draws().some((d) => d.indexCount === surface.indexCount)).toBe(true);
        }
    });
});
