/**
 * Integração — 10 mil `Transform` mudados por quadro (spec 007, US2): envio em faixas, uma notificação por pool e um
 * despacho do estágio de transformação, como na cena `instances/10k-moving` do benchmark.
 */
import { describe, expect, it } from 'vitest';
import { createScene } from '../../SceneContext';
import { Transform } from '../../../elements/scene/Transform';
import { TransformFlow } from '../../../elements/scene/flows/TransformFlow';
import { fakeSceneCore } from '../helpers/fakeSceneCore';

const COUNT = 10_000;

function setup() {
    const { core, trace } = fakeSceneCore();
    const scene = createScene({ core });
    scene.flows.register((ctx) => new TransformFlow(ctx), {
        type: 'transform',
        phase: 'transform',
    });
    const transforms = Array.from({ length: COUNT }, (_, i) => {
        const t = new Transform({ position: [i, 0, 0, 1] });
        scene.world.insert(t);
        return t;
    });
    let n = 0;
    const frame = (): string[] => {
        trace.length = 0;
        scene.events.emit('frameTick', { dt: 1 / 60, realDt: 1 / 60, elapsed: n / 60, frame: ++n });
        return [...trace];
    };
    return { scene, transforms, frame };
}

describe('10 mil Transform em movimento (spec 007)', () => {
    it('todos mudados: uma escrita do pool, um poolWritten, um despacho de composição', () => {
        const s = setup();
        s.frame();
        let written = 0;
        s.scene.events.on('poolWritten', (e) => {
            if (e.poolKey === 'Transform') written++;
        });
        for (const [i, t] of s.transforms.entries()) {
            t.data.position = [i, 1, 0, 1];
            t.data.rotation = [0, Math.sin(i), 0, Math.cos(i)];
        }
        const trace = s.frame();
        expect(trace.filter((e) => e.startsWith('write:pool:Transform'))).toHaveLength(1);
        expect(written).toBe(1);
        expect(trace.filter((e) => e === 'compute:TransformFlow')).toHaveLength(1);
    });

    it('metade alternada: uma escrita por faixa contígua (cada slot mudado é a sua faixa)', () => {
        const s = setup();
        s.frame();
        s.transforms.forEach((t, i) => {
            if (i % 2 === 0) t.data.position[1] = 2;
        });
        const trace = s.frame();
        expect(trace.filter((e) => e.startsWith('write:pool:Transform'))).toHaveLength(COUNT / 2);
    });
});
