import { describe, expect, it } from 'vitest';
import { ShadowFlow } from '../ShadowFlow';
import { BoxGeometry } from '../../../elements/geometry/BoxGeometry';
import { DirectionalLight } from '../../../elements/scene/DirectionalLight';
import { Transform } from '../../../elements/scene/Transform';
import { DefaultEventBus } from '../../../scene/events/DefaultEventBus';
import { World } from '../../../scene/world/World';
import type { LayoutSpec } from '../../../core/contracts/index';
import { discOf, renderHarness } from './helpers/renderHarness';

function scene(scale: [number, number, number, number] = [1, 1, 1, 1]) {
    const h = renderHarness();
    const world = new World(new DefaultEventBus());
    world.insert(new DirectionalLight({ direction: [0, -1, 0, 0], castShadow: true }));
    const box = new BoxGeometry({ size: [1, 1, 1] }).add(
        new Transform({ position: [2, 0, 0, 1], scale }),
    );
    const id = world.insert(box);
    const flow = new ShadowFlow(h.core, world, h.pools);
    return { ...h, world, flow, id, box };
}

describe('ShadowFlow — matriz de mundo por slot', () => {
    it('grupo 1 é storage somente leitura visível no vértice, ligado ao pool WorldTransform', () => {
        const s = scene();
        s.slots.set(s.id, 3);
        s.flow.dispatch(s.frame);
        const layout = s.creates.find((c) => discOf(c) === 'shadow_transform_layout') as LayoutSpec;
        expect(layout.entries[0]).toMatchObject({
            kind: 'buffer',
            type: 'read-only-storage',
            visibility: GPUShaderStage.VERTEX,
        });
        const [draw] = s.takeDraws();
        expect(draw!.bindGroups.get(1)!.bindings[0]).toMatchObject({
            buffer: s.worldBuffer.current,
        });
    });

    it('desenha com firstInstance = slot e sem escrever transform por objeto', () => {
        const s = scene();
        s.slots.set(s.id, 3);
        s.flow.dispatch(s.frame);
        s.flow.dispatch(s.frame);
        const draws = s.takeDraws();
        expect(draws.map((d) => d.firstInstance)).toEqual([3, 3]);
        expect(s.creates.some((c) => discOf(c).startsWith('shadow_transform:'))).toBe(false);
        expect(s.writes.some((w) => discOf(w).startsWith('shadow_transform'))).toBe(false);
    });

    it('objeto sem slot não é desenhado', () => {
        const s = scene();
        s.flow.dispatch(s.frame);
        expect(s.takeDraws()).toHaveLength(0);
    });

    it('escala com determinante negativo usa frontFace cw', () => {
        const s = scene([1, 1, -2, 1]);
        s.slots.set(s.id, 0);
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
        expect(s.takeDraws()[0]!.bindGroups.get(1)!.bindings[0]).toMatchObject({
            buffer: s.worldBuffer.current,
        });
    });
});
