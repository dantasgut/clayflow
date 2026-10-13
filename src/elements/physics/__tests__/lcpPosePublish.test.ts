import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RigidBody } from '../bodies/RigidBody';
import { Transform } from '../../scene/Transform';
import { LCPSchema } from '../bodies/schemas/LCPSchema';
import { lcpScene } from './helpers/lcpScene';

const STRIDE_F32 = LCPSchema.stride / 4;
const POS = LCPSchema.offsetOf('pos') / 4;
const ROT = LCPSchema.offsetOf('rot') / 4;

async function setup() {
    const s = await lcpScene();
    const body = new RigidBody({ shape: 'sphere', radius: 0.5, mass: 1, position: [0, 4, 0] });
    const transform = body.attached.find((p) => p instanceof Transform)!;
    transform.data.scale = [0.5, 0.5, 0.5, 1];
    const id = s.scene.world.insert(body);
    const slot = s.scene.resourceSystem.poolSlotOf('LCPSchema', id)!;
    return { ...s, body, transform, slot, id };
}

function readback(
    count: number,
    poses: Record<number, { pos: number[]; rot: number[] }>,
): ArrayBuffer {
    const view = new Float32Array(count * STRIDE_F32);
    for (const [slot, p] of Object.entries(poses)) {
        view.set(p.pos, Number(slot) * STRIDE_F32 + POS);
        view.set(p.rot, Number(slot) * STRIDE_F32 + ROT);
    }
    return view.buffer;
}

beforeEach(() => {
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers();
});

describe('LCPFlow publica pose', () => {
    it('atribui posição e rotação normalizada, preserva a escala e não escreve matriz', async () => {
        const { flow, transform, slot, id } = await setup();
        const entities = [];
        entities[slot] = id;
        flow().publish(
            readback(slot + 1, { [slot]: { pos: [1, 2, 3], rot: [0, 2, 0, 2] } }),
            entities,
        );
        expect(transform.data.position).toEqual([1, 2, 3, 1]);
        const rot = transform.data.rotation as number[];
        expect(Math.hypot(...rot)).toBeCloseTo(1, 6);
        expect(rot[1]).toBeCloseTo(Math.SQRT1_2, 6);
        expect(transform.data.scale).toEqual([0.5, 0.5, 0.5, 1]);
        expect('model' in transform.data).toBe(false);
    });

    it('a pose entra na fila do ResourceSystem e é enviada uma vez no próximo quadro', async () => {
        const { flow, scene, writes, slot, id } = await setup();
        const entities = [];
        entities[slot] = id;
        const before = writes.length;
        flow().publish(
            readback(slot + 1, { [slot]: { pos: [1, 2, 3], rot: [0, 0, 0, 1] } }),
            entities,
        );
        expect(writes.length).toBe(before);
        scene.events.emit('frameRecording', { elapsed: 0 });
        const transformPool = scene.resourceSystem.poolBufferSpec('Transform');
        expect(writes.slice(before).filter((w) => w.spec === transformPool)).toHaveLength(1);
    });

    it('quaternion nulo vira identidade', async () => {
        const { flow, transform, slot, id } = await setup();
        const entities = [];
        entities[slot] = id;
        flow().publish(
            readback(slot + 1, { [slot]: { pos: [0, 0, 0], rot: [0, 0, 0, 0] } }),
            entities,
        );
        expect(transform.data.rotation).toEqual([0, 0, 0, 1]);
    });

    it('A6: o mapa slot → entidade é o do momento da cópia — remoção e reuso do slot antes da leitura não trocam a pose', async () => {
        const s = await setup();
        const other = new RigidBody({ shape: 'sphere', radius: 0.5, mass: 1, position: [3, 4, 0] });
        s.scene.world.insert(other);
        const otherTransform = other.attached.find((p) => p instanceof Transform)!;
        s.readbackWith(() => readback(2, { [s.slot]: { pos: [9, 9, 9], rot: [0, 0, 0, 1] } }));
        s.step();
        expect(s.copies()).toBeGreaterThan(0);
        // Entre a cópia e a leitura: a entidade do slot sai e outra ocupa o mesmo slot.
        s.scene.world.remove(s.body);
        const intruder = new RigidBody({
            shape: 'sphere',
            radius: 0.5,
            mass: 1,
            position: [7, 7, 7],
        });
        const intruderId = s.scene.world.insert(intruder);
        expect(s.scene.resourceSystem.poolSlotOf('LCPSchema', intruderId)).toBe(s.slot);
        const intruderTransform = intruder.attached.find((p) => p instanceof Transform)!;
        await vi.runAllTimersAsync();
        expect(intruderTransform.data.position).toEqual([7, 7, 7, 1]);
        expect(otherTransform.data.position).toEqual([0, 0, 0, 1]);
    });
});
