/**
 * SC-005 — cena estática com 10 000 objetos: depois do primeiro quadro, nenhum envio de
 * transformação por objeto e nenhum dispatch do estágio de transformação.
 */
import { describe, expect, it } from 'vitest';
import { DefaultEventBus } from '../../events/DefaultEventBus';
import { FlowRegistry } from '../../flows/FlowRegistry';
import { ExecutionSystem } from '../../systems/ExecutionSystem';
import { ResourceSystem } from '../../systems/ResourceSystem';
import { World } from '../../world/World';
import { Transform } from '../../../elements/scene/Transform';
import { TransformFlow } from '../../../elements/scene/flows/TransformFlow';
import { fakeSceneCore } from '../helpers/fakeSceneCore';

describe('cena estática de 10 000 objetos', () => {
    it('após o primeiro quadro, quadros parados não enviam transformações nem despacham o estágio', () => {
        const events = new DefaultEventBus();
        const world = new World(events);
        const { core, trace } = fakeSceneCore();
        const resources = new ResourceSystem(core, events, world);
        const flows = new FlowRegistry();
        new ExecutionSystem(core, events, flows);
        flows.register(new TransformFlow(core, resources, events));
        for (let i = 0; i < 10_000; i++) {
            world.insert(new Transform({ position: [i, 0, 0, 1] }));
        }
        expect(resources.poolCount('Transform')).toBe(10_000);
        events.emit('frameTick', { dt: 1 / 60, elapsed: 0 });
        expect(trace).toContain('compute:TransformFlow');
        for (let f = 1; f <= 10; f++) {
            trace.length = 0;
            events.emit('frameTick', { dt: 1 / 60, elapsed: f / 60 });
            expect(trace.filter((c) => c.startsWith('write:'))).toHaveLength(0);
            expect(trace).not.toContain('compute:TransformFlow');
        }
    });
});
