/**
 * Integração — mutação de Transform reflete no quadro seguinte (spec 003, US2).
 * Sistemas reais (World, ResourceSystem, ExecutionSystem, FlowRegistry, TransformFlow)
 * com EngineCore falso registrando a ordem de envio e de gravação.
 */
import { describe, expect, it } from 'vitest';
import { createScene } from '../../SceneContext';
import { Transform } from '../../../elements/scene/Transform';
import { TransformFlow } from '../../../elements/scene/flows/TransformFlow';
import { fakeSceneCore } from '../helpers/fakeSceneCore';

function setup() {
    const { core, trace } = fakeSceneCore();
    const { world, events, flows } = createScene({ core });
    flows.register((ctx) => new TransformFlow(ctx), { type: 'transform', phase: 'transform' });
    let elapsed = 0;
    const frame = (): string[] => {
        trace.length = 0;
        elapsed += 1 / 60;
        events.emit('frameTick', { dt: 1 / 60, realDt: 1 / 60, elapsed, frame: 1 });
        return [...trace];
    };
    return { world, frame };
}

describe('Transform reativo ponta a ponta', () => {
    it('mutação é enviada ao pool Transform antes do estágio de transformação, no mesmo quadro', () => {
        const { world, frame } = setup();
        const t = new Transform({ position: [0, 0, 0, 1] });
        world.insert(t);
        frame();
        (t.data.position as number[])[0] = 5;
        const trace = frame();
        const write = trace.indexOf('write:pool:Transform');
        const compute = trace.indexOf('compute:TransformFlow');
        expect(write).toBeGreaterThanOrEqual(0);
        expect(compute).toBeGreaterThan(write);
    });

    it('quadro sem mutação não envia nem despacha', () => {
        const { world, frame } = setup();
        world.insert(new Transform());
        frame();
        const trace = frame();
        expect(trace.filter((c) => c.startsWith('write:pool:Transform'))).toHaveLength(0);
        expect(trace).not.toContain('compute:TransformFlow');
    });

    it('atribuição do campo inteiro também chega no quadro seguinte', () => {
        const { world, frame } = setup();
        const t = new Transform();
        world.insert(t);
        frame();
        t.data.scale = [2, 2, 2, 1];
        const trace = frame();
        expect(trace).toContain('write:pool:Transform');
        expect(trace).toContain('compute:TransformFlow');
    });
});
