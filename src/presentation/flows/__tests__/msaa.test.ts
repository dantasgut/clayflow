/**
 * MSAA nos passes da cena (spec 008): com amostras nos `FrameTargets`, o forward desenha na cor multiamostrada e
 * resolve na cor da cena; o `ParticleFlow` carrega as amostras e resolve de novo; os pipelines têm o número de amostras
 * do alvo. Sem amostras, desenho direto na cor.
 */
import { describe, expect, it } from 'vitest';
import { BoxGeometry } from '../../../elements/geometry/BoxGeometry';
import { StandardMaterial } from '../../../elements/material/StandardMaterial';
import { PointSpriteMaterial } from '../../../elements/material/PointSpriteMaterial';
import { FluidBody } from '../../../elements/physics/bodies/FluidBody';
import { Camera } from '../../../elements/scene/Camera';
import { Transform } from '../../../elements/scene/Transform';
import { FrameTargets } from '../../app/FrameTargets';
import { ForwardFlow } from '../ForwardFlow';
import { ParticleFlow } from '../ParticleFlow';
import { TransformFlow } from '../../../elements/scene/flows/TransformFlow';
import { CameraFlow } from '../../../elements/scene/flows/CameraFlow';
import { renderScene } from './helpers/renderHarness';

async function scene(samples: 1 | 4) {
    const s = await renderScene();
    s.scene.flows.register((ctx) => new TransformFlow(ctx), {
        type: 'transform',
        phase: 'transform',
    });
    s.scene.flows.register((ctx) => new CameraFlow(ctx), {
        type: 'camera',
        phase: 'transform',
        priority: -10,
    });
    s.scene.flows.register((ctx) => new ForwardFlow(ctx), { type: 'forward', phase: 'forward' });
    s.scene.flows.register((ctx) => new ParticleFlow(ctx), {
        type: 'particles',
        phase: 'forward',
        priority: -50,
    });
    const targets = new FrameTargets({ samples });
    s.scene.world.insert(targets);
    s.scene.world.insert(new Camera().add(new Transform()));
    s.scene.world.insert(new BoxGeometry().add(new StandardMaterial()).add(new Transform()));
    s.scene.world.insert(
        new FluidBody({ algorithm: 'SPH', position: [0, 0, 0] }).add(new PointSpriteMaterial()),
    );
    return { ...s, targets };
}

describe('MSAA (spec 008)', () => {
    it('4 amostras: forward limpa e resolve, partículas carregam e resolvem; pipelines com 4 amostras', async () => {
        const s = await scene(4);
        s.step();
        const passes = s.step();
        const samples = s.scene.resourceSystem.textureViewOf(s.targets, 'samples');
        const color = s.scene.resourceSystem.textureViewOf(s.targets, 'color');
        const forward = passes.find((p) => p.label === 'ForwardFlow')!;
        const particles = passes.find((p) => p.label === 'ParticleFlow')!;
        expect(forward.target.colorAttachments[0]).toMatchObject({
            view: samples,
            resolveTarget: color,
            loadOp: 'clear',
        });
        expect(particles.target.colorAttachments[0]).toMatchObject({
            view: samples,
            resolveTarget: color,
            loadOp: 'load',
        });
        expect(forward.draws[0]!.pipeline.multisample?.count).toBe(4);
        expect(particles.vertexDraws[0]!.pipeline.multisample?.count).toBe(4);
    });

    it('1 amostra: desenho direto na cor, sem resolução', async () => {
        const s = await scene(1);
        s.step();
        const passes = s.step();
        const color = s.scene.resourceSystem.textureViewOf(s.targets, 'color');
        const forward = passes.find((p) => p.label === 'ForwardFlow')!;
        expect(forward.target.colorAttachments[0]).toMatchObject({ view: color });
        expect(forward.target.colorAttachments[0]!.resolveTarget).toBeUndefined();
        expect(forward.draws[0]!.pipeline.multisample?.count).toBe(1);
    });
});
