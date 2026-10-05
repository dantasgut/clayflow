import { describe, expect, it } from 'vitest';
import { LCPFlow } from '../flows/LCPFlow';
import { RigidBody } from '../bodies/RigidBody';
import { Transform } from '../../scene/Transform';
import { DefaultEventBus } from '../../../scene/events/DefaultEventBus';
import { ResourceSystem } from '../../../scene/systems/ResourceSystem';
import { World } from '../../../scene/world/World';
import { fakeResourceCore } from '../../../scene/__tests__/helpers/fakeResourceCore';

/** Expõe a publicação de pose (protegida) para teste. */
class TestLCPFlow extends LCPFlow {
    publish(ab: ArrayBuffer): void {
        this.applyTransformsFromReadback(ab);
    }
}

const STRIDE_F32 = 40;

function setup() {
    const events = new DefaultEventBus();
    const world = new World(events);
    const { core, writes } = fakeResourceCore();
    const resources = new ResourceSystem(core, events, world);
    const flow = new TestLCPFlow(core, world, resources);
    const body = new RigidBody({ shape: 'sphere', radius: 0.5, mass: 1, position: [0, 4, 0] });
    const transform = body.attached.find((p) => p instanceof Transform)!;
    transform.data.scale = [0.5, 0.5, 0.5, 1];
    const id = world.insert(body);
    const slot = resources.poolSlotOf('LCPSchema', id)!;
    return { events, world, writes, resources, flow, transform, slot };
}

function readback(slot: number, pos: number[], rot: number[]): ArrayBuffer {
    const view = new Float32Array((slot + 1) * STRIDE_F32);
    view.set(pos, slot * STRIDE_F32);
    view.set(rot, slot * STRIDE_F32 + 12);
    return view.buffer;
}

describe('LCPFlow publica pose', () => {
    it('atribui posição e rotação normalizada, preserva a escala e não escreve matriz', () => {
        const { flow, transform, slot } = setup();
        flow.publish(readback(slot, [1, 2, 3], [0, 2, 0, 2]));
        expect(transform.data.position).toEqual([1, 2, 3, 1]);
        const rot = transform.data.rotation as number[];
        expect(Math.hypot(...rot)).toBeCloseTo(1, 6);
        expect(rot[1]).toBeCloseTo(Math.SQRT1_2, 6);
        expect(transform.data.scale).toEqual([0.5, 0.5, 0.5, 1]);
        expect('model' in transform.data).toBe(false);
    });

    it('a pose entra na fila do ResourceSystem e é enviada uma vez no próximo quadro', () => {
        const { flow, events, writes, resources, slot } = setup();
        const before = writes.length;
        flow.publish(readback(slot, [1, 2, 3], [0, 0, 0, 1]));
        expect(writes.length).toBe(before);
        events.emit('frameRecording', { elapsed: 0 });
        const transformPool = resources.poolBufferSpec('Transform');
        const sent = writes.slice(before).filter((w) => w.spec === transformPool);
        expect(sent).toHaveLength(1);
    });

    it('quaternion nulo vira identidade', () => {
        const { flow, transform, slot } = setup();
        flow.publish(readback(slot, [0, 0, 0], [0, 0, 0, 0]));
        expect(transform.data.rotation).toEqual([0, 0, 0, 1]);
    });
});
