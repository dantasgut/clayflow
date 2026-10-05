/**
 * Integração — o mesmo mecanismo reativo vale para qualquer recurso (spec 003, US2,
 * Acceptance 4): mutar a cor de um material inserido envia o dado no quadro seguinte.
 */
import { describe, expect, it } from 'vitest';
import { DefaultEventBus } from '../../events/DefaultEventBus';
import { FlowRegistry } from '../../flows/FlowRegistry';
import { ExecutionSystem } from '../../systems/ExecutionSystem';
import { ResourceSystem } from '../../systems/ResourceSystem';
import { World } from '../../world/World';
import { StandardMaterial } from '../../../elements/material/StandardMaterial';
import { fakeSceneCore } from '../helpers/fakeSceneCore';

describe('material reativo', () => {
    it('mutar albedo envia o material uma vez no próximo quadro, sem chamada manual', () => {
        const events = new DefaultEventBus();
        const world = new World(events);
        const { core, trace } = fakeSceneCore();
        new ResourceSystem(core, events, world);
        new ExecutionSystem(core, events, new FlowRegistry());
        const material = new StandardMaterial({ albedo: [0.2, 0.2, 0.2, 1] });
        world.insert(material);
        trace.length = 0;
        (material.data.albedo as number[])[0] = 1;
        (material.data.albedo as number[])[1] = 0.5;
        expect(trace).toHaveLength(0);
        events.emit('frameTick', { dt: 1 / 60, elapsed: 0 });
        expect(trace.filter((c) => c.startsWith('write:'))).toHaveLength(1);
    });
});
