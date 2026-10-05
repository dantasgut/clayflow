import { describe, expect, it } from 'vitest';
import { ForwardFlow } from '../ForwardFlow';
import { BoxGeometry } from '../../../elements/geometry/BoxGeometry';
import { StandardMaterial } from '../../../elements/material/StandardMaterial';
import { Camera } from '../../../elements/scene/Camera';
import { Transform } from '../../../elements/scene/Transform';
import { DefaultEventBus } from '../../../scene/events/DefaultEventBus';
import { World } from '../../../scene/world/World';
import type { LayoutSpec } from '../../../core/contracts/index';
import { discOf, renderHarness } from './helpers/renderHarness';

function scene(scale: [number, number, number, number] = [1, 1, 1, 1]) {
    const h = renderHarness();
    const world = new World(new DefaultEventBus());
    world.insert(new Camera());
    const box = new BoxGeometry({ size: [1, 1, 1] })
        .add(new StandardMaterial({ albedo: [1, 0, 0, 1] }))
        .add(new Transform({ position: [5, 0, 0, 1], scale }));
    const id = world.insert(box);
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const flow = new ForwardFlow(h.core, world, h.pools, canvas);
    return { ...h, world, flow, id, box };
}

describe('ForwardFlow — matriz de mundo por slot', () => {
    it('grupo 1 é storage somente leitura visível no vértice, ligado ao pool WorldTransform', () => {
        const s = scene();
        s.slots.set(s.id, 7);
        s.flow.dispatch(s.frame);
        const layout = s.creates.find(
            (c) => discOf(c) === 'forward_transform_layout',
        ) as LayoutSpec;
        expect(layout.entries[0]).toMatchObject({
            kind: 'buffer',
            type: 'read-only-storage',
            visibility: GPUShaderStage.VERTEX,
        });
        const [draw] = s.takeDraws();
        const bg = draw!.bindGroups.get(1)!;
        expect(bg.bindings[0]).toMatchObject({ kind: 'buffer', buffer: s.worldBuffer.current });
    });

    it('desenha com firstInstance = slot da entidade', () => {
        const s = scene();
        s.slots.set(s.id, 7);
        s.flow.dispatch(s.frame);
        const draws = s.takeDraws();
        expect(draws).toHaveLength(1);
        expect(draws[0]!.firstInstance).toBe(7);
    });

    it('não cria nem escreve buffer de transform por objeto, em quadros seguidos', () => {
        const s = scene();
        s.slots.set(s.id, 0);
        s.flow.dispatch(s.frame);
        s.flow.dispatch(s.frame);
        expect(s.creates.some((c) => discOf(c).startsWith('forward_transform:'))).toBe(false);
        expect(s.writes.some((w) => discOf(w).startsWith('forward_transform'))).toBe(false);
    });

    it('objeto sem slot no pool não é desenhado', () => {
        const s = scene();
        s.flow.dispatch(s.frame);
        expect(s.takeDraws()).toHaveLength(0);
    });

    it('escala com determinante negativo usa frontFace cw', () => {
        const s = scene([-1, 1, 1, 1]);
        s.slots.set(s.id, 0);
        s.flow.dispatch(s.frame);
        const [draw] = s.takeDraws();
        expect(draw!.pipeline.primitive?.frontFace).toBe('cw');
    });

    it('escala positiva usa frontFace ccw e troca ao espelhar em tempo de execução', () => {
        const s = scene();
        s.slots.set(s.id, 0);
        s.flow.dispatch(s.frame);
        expect(s.takeDraws()[0]!.pipeline.primitive?.frontFace).toBe('ccw');
        const t = s.box.attached.find((p) => p instanceof Transform)!;
        t.data.scale = [1, -1, 1, 1];
        s.flow.dispatch(s.frame);
        expect(s.takeDraws()[0]!.pipeline.primitive?.frontFace).toBe('cw');
    });

    it('recria o bind group após poolReallocated(WorldTransform)', () => {
        const s = scene();
        s.slots.set(s.id, 0);
        s.flow.dispatch(s.frame);
        s.takeDraws();
        s.worldBuffer.current = {
            ...s.worldBuffer.current,
            discriminator: 'pool:WorldTransform:gen1',
        };
        s.flow.onPoolReallocated('WorldTransform');
        s.flow.dispatch(s.frame);
        const [draw] = s.takeDraws();
        expect(draw!.bindGroups.get(1)!.bindings[0]).toMatchObject({
            buffer: s.worldBuffer.current,
        });
    });
});
