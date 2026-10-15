/**
 * Spec 010: partículas secundárias (spray, espuma, bolhas) — Resource com a nuvem de pontos e o material, validação, e o
 * `DiffuseFlow` gerando e atualizando só com fluido na cena.
 */
import { describe, expect, it } from 'vitest';
import { renderScene } from '../../../presentation/flows/__tests__/helpers/renderHarness';
import { PointCloudGeometry } from '../../geometry/PointCloudGeometry';
import { DiffuseMaterial } from '../../material/DiffuseMaterial';
import { FluidBody } from '../../physics/bodies/FluidBody';
import { Transform } from '../../scene/Transform';
import { DiffuseFlow } from '../DiffuseFlow';
import { DiffuseParticles } from '../DiffuseParticles';

function fluid(): FluidBody {
    return new FluidBody({ algorithm: 'PBF', position: [0, 0, 0, 0.05, 0, 0, 0, 0.05, 0] });
}

describe('DiffuseParticles (spec 010)', () => {
    it('anel de partículas só da GPU, com a nuvem de pontos, o material e o Transform anexados', () => {
        const d = new DiffuseParticles({ source: fluid(), maxParticles: 1024 });
        expect(d.getDescriptors()[0]).toMatchObject({
            id: 'particles',
            count: 1024,
            upload: 'never',
        });
        expect(d.attached.some((r) => r instanceof PointCloudGeometry)).toBe(true);
        expect(d.attached.some((r) => r instanceof DiffuseMaterial)).toBe(true);
        expect(d.attached.some((r) => r instanceof Transform)).toBe(true);
        expect(d.data.trappedAir).toEqual([5, 20]);
    });

    it('validação: capacidade, faixas e valores não negativos', () => {
        const source = fluid();
        expect(() => new DiffuseParticles({ source, maxParticles: 0 })).toThrow(/maxParticles/);
        expect(() => new DiffuseParticles({ source, trappedAir: [5, 5] })).toThrow(/faixa/);
        expect(() => new DiffuseParticles({ source, airDrag: -1 })).toThrow(/airDrag/);
    });

    it('DiffuseFlow: busca de vizinhos, geração e um passo por passo fixo com o fluido na cena', async () => {
        const s = await renderScene();
        s.scene.flows.register((ctx) => new DiffuseFlow(ctx), {
            type: 'diffuse',
            phase: 'physics',
            priority: -50,
        });
        const water = fluid();
        s.scene.world.insert(water);
        s.scene.world.insert(new DiffuseParticles({ source: water, maxParticles: 256 }));
        s.step();
        s.step();
        const labels = s.computes();
        for (const l of [
            'DiffuseFlow.normals',
            'DiffuseFlow.potential',
            'DiffuseFlow.spawn',
            'DiffuseFlow.head',
            'DiffuseFlow.update',
            'DiffuseFlow.collide',
        ])
            expect(labels).toContain(l);
    });
});
