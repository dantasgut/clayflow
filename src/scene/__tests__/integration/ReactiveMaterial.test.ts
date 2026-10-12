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
import { WireframeMaterial } from '../../../elements/material/WireframeMaterial';
import { BoxGeometry } from '../../../elements/geometry/BoxGeometry';
import { Camera } from '../../../elements/scene/Camera';
import { Transform } from '../../../elements/scene/Transform';
import {
    registerStages,
    renderScene,
} from '../../../presentation/flows/__tests__/helpers/renderHarness';

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
        events.emit('frameTick', { dt: 1 / 60, realDt: 1 / 60, elapsed: 0, frame: 1 });
        expect(trace.filter((c) => c.startsWith('write:'))).toHaveLength(1);
    });
});

describe('material em pool uniforme', () => {
    it('cada schema de material tem o seu pool, com stride alinhado a 256', async () => {
        const s = await renderScene();
        s.scene.world.insert(new StandardMaterial());
        s.scene.world.insert(new WireframeMaterial());
        s.step();
        for (const name of [StandardMaterial.schema.name, WireframeMaterial.schema.name]) {
            const info = s.scene.resourceSystem.poolInfo(name);
            expect(info).toBeDefined();
            expect(info!.stride % 256).toBe(0);
        }
    });

    it('trocar o material da entidade por outro schema a move de pool e muda o pipeline do desenho', async () => {
        const s = await renderScene();
        registerStages(s.scene, { forward: 'canvas' });
        s.scene.world.insert(new Camera());
        const standard = new BoxGeometry().add(new StandardMaterial()).add(new Transform());
        const id = s.scene.world.insert(standard);
        s.step();
        expect(s.scene.resourceSystem.poolSlotOf(StandardMaterial.schema.name, id)).toBeDefined();
        const before = s.draws('ForwardFlow')[0]!;
        s.scene.world.remove(standard);
        const wireframe = new BoxGeometry().add(new WireframeMaterial()).add(new Transform());
        const id2 = s.scene.world.insert(wireframe);
        s.step();
        expect(s.scene.resourceSystem.poolSlotOf(StandardMaterial.schema.name, id)).toBeUndefined();
        expect(s.scene.resourceSystem.poolSlotOf(WireframeMaterial.schema.name, id2)).toBeDefined();
        const [after] = s.draws('ForwardFlow');
        expect(after!.pipeline).not.toBe(before.pipeline);
        expect(after!.bindGroups.get(2)!.group.bindings[0]).toMatchObject({
            buffer: s.scene.resourceSystem.poolBufferSpec(WireframeMaterial.schema.name),
        });
    });
});
