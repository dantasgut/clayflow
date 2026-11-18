import { describe, expect, it } from 'vitest';
import { renderScene, registerStages } from './helpers/renderHarness';
import { Camera } from '../../../elements/scene/Camera';
import { DirectionalLight } from '../../../elements/scene/DirectionalLight';
import { TemporalAntialiasing } from '../../../elements/scene/TemporalAntialiasing';
import { Transform } from '../../../elements/scene/Transform';
import { Sky } from '../../../elements/scene/sky/Sky';
import { SkyFlow } from '../../../elements/scene/sky/SkyFlow';
import { SkyReactiveFlow } from '../SkyReactiveFlow';

// A máscara reativa do disco do sol (spec 041): com o antisserrilhado temporal e um `Sky`, um retângulo em volta do disco
// de agora e do anterior (a série `Sky.sunTrack`) marca a máscara pelo máximo, e a resolução temporal a limpa depois de
// ler; sem o temporal (ou com MSAA, sem a máscara), nada. Com o alvo da luz que chega, o fundo escreve nele a própria
// radiância (a resolução temporal reilumina o histórico do fundo quando ela muda).

async function scene(mode: 'temporal' | 'msaa', samples: 1 | 4) {
    const s = await renderScene();
    s.scene.world.insert(new TemporalAntialiasing({ mode }));
    s.scene.world.insert(new Camera().add(new Transform({ position: [0, 0, 5, 1] })));
    const sun = new DirectionalLight({ direction: [0, -0.2, -1, 0], intensity: 100000 });
    s.scene.world.insert(sun);
    const sky = new Sky({ sun });
    s.scene.world.insert(sky);
    s.scene.flows.register((ctx) => new SkyFlow(ctx), {
        type: 'sky',
        phase: 'transform',
        priority: -55,
    });
    s.scene.flows.register((ctx) => new SkyReactiveFlow(ctx), {
        type: 'skyReactive',
        phase: 'forward',
        priority: -71,
    });
    const { frameTargets } = registerStages(s.scene, { forward: 'scene', post: true, samples });
    return { ...s, sky, frameTargets: frameTargets! };
}

describe('SkyReactiveFlow (spec 041)', () => {
    it('temporal: o retângulo dos dois discos na máscara, pelo máximo, antes da resolução que a limpa', async () => {
        const s = await scene('temporal', 1);
        s.step();
        s.step();
        const passes = s.step();
        const labels = passes.map((p) => p.label);
        const mask = passes.find((p) => p.label === 'SkyReactiveFlow')!;
        expect(mask).toBeDefined();
        expect(mask.vertexDraws[0]!.indexCount).toBe(6);
        const reactive = s.scene.resourceSystem.textureViewOf(s.frameTargets, 'reactive');
        expect(mask.target.colorAttachments).toEqual([
            { view: reactive, loadOp: 'load', storeOp: 'store' },
        ]);
        const pipeline = mask.vertexDraws[0]!.pipeline;
        expect(pipeline.fragment?.targets[0]).toMatchObject({
            format: 'r8unorm',
            blend: { color: { operation: 'max' } },
        });
        // O disco do quadro anterior vem da série do céu (lido pelo atraso 1).
        expect(pipeline.fragment?.shader.source).toContain('sky_sun_track_prev');
        expect(labels.indexOf('SkyReactiveFlow')).toBeLessThan(
            labels.indexOf('PostFlow.temporalResolve'),
        );
        expect(labels.indexOf('PostFlow.temporalResolve')).toBeLessThan(
            labels.indexOf('PostFlow.reactiveClear'),
        );
        // A vista do céu escreve a direção do sol do quadro na série.
        expect(s.computes()).toContain('SkyFlow.sky_view');
        expect(s.createdWhileRecording()).toBe(0);
    });

    it('sem o temporal (MSAA, sem a máscara): nada; o fundo sem o alvo da luz', async () => {
        const s = await scene('msaa', 4);
        s.step();
        s.step();
        const passes = s.step();
        expect(passes.map((p) => p.label)).not.toContain('SkyReactiveFlow');
        const entries = passes
            .flatMap((p) => p.vertexDraws)
            .map((d) => d.pipeline.fragment?.entryPoint);
        expect(entries).toContain('fs_background');
        expect(entries).not.toContain('fs_background_light');
    });

    it('temporal: o fundo escreve a própria radiância na luz que chega (a resolução reilumina o fundo)', async () => {
        const s = await scene('temporal', 1);
        s.step();
        s.step();
        const background = s
            .step()
            .flatMap((p) => p.vertexDraws)
            .find((d) => d.pipeline.fragment?.entryPoint === 'fs_background_light')!;
        expect(background).toBeDefined();
        // Cor e luz (rg16float), as duas escritas.
        expect(background.pipeline.fragment?.targets.map((t) => t.writeMask)).toEqual([
            undefined,
            undefined,
        ]);
        expect(background.pipeline.fragment?.targets[1]?.format).toBe('rg16float');
    });
});
