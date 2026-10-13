/**
 * Posse da GPU por conjunto (`slot.entities({ owns })`, spec 007, R7): depois do primeiro envio a CPU não escreve o slot;
 * mutação é ignorada com aviso único; a saída do conjunto devolve a posse e reenvia a intenção; o crescimento do pool
 * preserva o dado por cópia na GPU; dois donos do mesmo dado são erro.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Frame } from '../../core/contracts/index';
import { Entity } from '../contracts/Entity';
import { ResourceState } from '../contracts/ResourceState';
import type { Resource } from '../contracts/Resource';
import type { GPUDescriptor } from '../descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../descriptors/PipelineDescriptor';
import { FieldType } from '../descriptors/FieldType';
import { StructSchema } from '../descriptors/StructSchema';
import { Flow } from '../flows/Flow';
import type { BoundFlow, TransitionContext } from '../flows/FlowBinding';
import type { FlowTransitions } from '../flows/FlowTransitions';
import { slot } from '../flows/slots';
import { createScene } from '../SceneContext';
import { countingCore } from './helpers/countingCore';

const PoseSchema = new StructSchema('OwnedPose', { p: FieldType.vec4f });
const BodySchema = new StructSchema('OwnerBody', { m: FieldType.vec4f });

class Pose extends Entity implements Resource {
    static readonly schema = PoseSchema;
    state = ResourceState.Uninitialized;
    data: Record<string, unknown>;
    constructor(x = 0) {
        super();
        this.data = { p: [x, 0, 0, 1] };
    }
    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'pose', role: 'storage-rw', storage: 'pool', schema: PoseSchema }];
    }
    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
class Body extends Entity implements Resource {
    static readonly schema = BodySchema;
    state = ResourceState.Uninitialized;
    data: Record<string, unknown> = { m: [1, 0, 0, 0] };
    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'body', role: 'storage-rw', storage: 'pool', schema: BodySchema }];
    }
    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}

const ownedSlots = {
    bodies: slot.entities({ all: [Body, Pose], owns: [[Pose, 'pose']] }),
};
type Slots = typeof ownedSlots;

class Owner extends Flow<Slots, 'idle'> {
    readonly type: string;
    readonly slots: Slots;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', TransitionContext<Slots>> = {
        '*': {
            slotsResolved: 'ignore',
            pipelinesCompiled: 'ignore',
            bindGroupReplaced: 'ignore',
            entitiesChanged: 'ignore',
        },
    };
    constructor(type: string, slots: Slots = ownedSlots) {
        super();
        this.type = type;
        this.slots = slots;
    }
    dispatch(_frame: Frame, _bound: BoundFlow<Slots>): void {}
}

function setup() {
    const counting = countingCore();
    const poseWrites: { offset: number; first: number }[] = [];
    vi.mocked(counting.core.write).mockImplementation((spec, data, offset) => {
        if ((spec as { discriminator?: string }).discriminator?.startsWith('pool:OwnedPose'))
            poseWrites.push({
                offset: offset ?? 0,
                first: new Float32Array(data.buffer, data.byteOffset, 1)[0]!,
            });
    });
    const scene = createScene({ core: counting.core });
    let n = 0;
    const frame = (): void => {
        scene.events.emit('frameTick', { dt: 1 / 60, realDt: 1 / 60, elapsed: 0, frame: ++n });
    };
    const body = (x: number) => new Body().add(new Pose(x));
    return { scene, frame, poseWrites, body };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('posse da GPU por conjunto (spec 007)', () => {
    it('o primeiro envio sai; depois a mutação é ignorada com aviso único por Resource', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const s = setup();
        s.scene.flows.register(() => new Owner('owner'), { type: 'owner', phase: 'physics' });
        const owned = s.body(3);
        s.scene.world.insert(owned);
        s.frame();
        expect(s.poseWrites.map((w) => w.first)).toEqual([3]);
        const pose = owned.attached[0] as Pose;
        pose.data.p = [9, 0, 0, 1];
        s.frame();
        pose.data.p = [8, 0, 0, 1];
        s.frame();
        expect(s.poseWrites).toHaveLength(1);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]![0])).toMatch(/OwnedPose.*GPU é dona/);
    });

    it('Pose fora do conjunto continua com a CPU; a faixa contígua quebra no slot de posse', () => {
        const s = setup();
        s.scene.flows.register(() => new Owner('owner'), { type: 'owner', phase: 'physics' });
        const free1 = new Pose(1);
        const owned = s.body(2);
        const free2 = new Pose(3);
        for (const e of [free1, owned, free2]) s.scene.world.insert(e);
        s.frame();
        s.poseWrites.length = 0;
        free1.data.p = [10, 0, 0, 1];
        (owned.attached[0] as Pose).data.p = [20, 0, 0, 1];
        free2.data.p = [30, 0, 0, 1];
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        s.frame();
        expect(s.poseWrites.map((w) => [w.offset / PoseSchema.stride, w.first])).toEqual([
            [0, 10],
            [2, 30],
        ]);
    });

    it('sem o Flow dono, a posse volta à CPU e a intenção é reenviada', () => {
        const s = setup();
        const registration = s.scene.flows.register(() => new Owner('owner'), {
            type: 'owner',
            phase: 'physics',
        });
        const owned = s.body(1);
        s.scene.world.insert(owned);
        s.frame();
        s.scene.flows.unregister(registration);
        s.frame();
        expect(s.poseWrites.map((w) => w.first)).toEqual([1, 1]);
        (owned.attached[0] as Pose).data.p = [5, 0, 0, 1];
        s.frame();
        expect(s.poseWrites.at(-1)!.first).toBe(5);
    });

    it('crescimento do pool não reescreve da CPU os slots de posse da GPU', () => {
        const s = setup();
        s.scene.flows.register(() => new Owner('owner'), { type: 'owner', phase: 'physics' });
        for (let i = 0; i < 16; i++) s.scene.world.insert(s.body(i));
        s.frame();
        s.poseWrites.length = 0;
        s.scene.world.insert(s.body(99)); // 17º: o pool cresce (cópia na GPU)
        s.frame();
        expect(s.poseWrites.map((w) => [w.offset / PoseSchema.stride, w.first])).toEqual([
            [16, 99],
        ]);
    });

    it('dois conjuntos donos do mesmo descritor da mesma entidade é erro', () => {
        const s = setup();
        s.scene.world.insert(s.body(1));
        s.scene.flows.register(() => new Owner('a'), { type: 'a', phase: 'physics' });
        const other = {
            bodies: slot.entities({ all: [Body, Pose], owns: [[Pose, 'pose']] }),
        };
        expect(() =>
            s.scene.flows.register(() => new Owner('b', other), { type: 'b', phase: 'physics' }),
        ).toThrow(/já tem dono na GPU/);
    });
});
