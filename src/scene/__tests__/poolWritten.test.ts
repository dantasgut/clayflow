/**
 * Eventos agregados (spec 007, R5/R6): `poolWritten` um por pool por envio, entregue só aos Flows que escutam o schema
 * (`listens`); `entitiesChanged` um por slot por quadro, com as mudanças acumuladas, antes de `framePrepare`.
 */
import { describe, expect, it } from 'vitest';
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
import type { FlowEvent, FlowTransitions } from '../flows/FlowTransitions';
import { slot } from '../flows/slots';
import { createScene } from '../SceneContext';
import { countingCore } from './helpers/countingCore';

const HeardSchema = new StructSchema('HeardPool', { v: FieldType.vec4f });
const OtherSchema = new StructSchema('OtherPool', { v: FieldType.vec4f });

class Heard extends Entity implements Resource {
    static readonly schema = HeardSchema;
    state = ResourceState.Uninitialized;
    data: Record<string, unknown> = { v: [0, 0, 0, 0] };
    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'h', role: 'storage-ro', storage: 'pool', schema: HeardSchema }];
    }
    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
class Other extends Heard {
    static override readonly schema = OtherSchema;
    override getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'o', role: 'storage-ro', storage: 'pool', schema: OtherSchema }];
    }
}

const slots = { items: slot.entities({ all: [Heard] }) };
type Slots = typeof slots;

/** Flow que registra os eventos recebidos (`listens` opcional). */
class Recorder extends Flow<Slots, 'idle'> {
    readonly type: string;
    readonly slots = slots;
    override readonly listens: readonly StructSchema[];
    readonly seen: FlowEvent[] = [];
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', TransitionContext<Slots>>;
    constructor(type: string, listens: readonly StructSchema[]) {
        super();
        this.type = type;
        this.listens = listens;
        const record = { to: 'idle' as const, run: (e: FlowEvent) => this.seen.push(e) };
        this.transitions = {
            '*': {
                slotsResolved: 'ignore',
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
                entitiesChanged: record,
                resourceReady: record,
                poolWritten: record,
                framePrepare: record,
            },
        };
    }
    dispatch(_frame: Frame, _bound: BoundFlow<Slots>): void {}
}

function setup() {
    const { core } = countingCore();
    const scene = createScene({ core });
    const listening = scene.flows.register(() => new Recorder('listening', [HeardSchema]), {
        type: 'listening',
        phase: 'forward',
    }).flow!;
    const deaf = scene.flows.register(() => new Recorder('deaf', []), {
        type: 'deaf',
        phase: 'forward',
    }).flow!;
    let frameNo = 0;
    const frame = (): void => {
        scene.events.emit('frameTick', {
            dt: 1 / 60,
            realDt: 1 / 60,
            elapsed: 0,
            frame: ++frameNo,
        });
    };
    return { scene, listening, deaf, frame };
}

const kinds = (r: Recorder) => r.seen.map((e) => e.type);

describe('eventos agregados por quadro (spec 007)', () => {
    it('poolWritten: um por pool e envio, só para quem escuta o schema', () => {
        const s = setup();
        const items = Array.from({ length: 50 }, () => new Heard());
        for (const item of items) s.scene.world.insert(item);
        s.scene.world.insert(new Other());
        s.frame();
        const written = s.listening.seen.filter((e) => e.type === 'poolWritten');
        expect(written).toEqual([
            { type: 'poolWritten', poolKey: 'HeardPool', schema: HeardSchema, ranges: [[0, 50]] },
        ]);
        expect(kinds(s.deaf)).not.toContain('poolWritten');
        expect(kinds(s.listening)).not.toContain('resourceReady'); // dado em pool não gera resourceReady
        s.listening.seen.length = 0;
        for (const item of items) item.data.v = [1, 0, 0, 0];
        s.frame();
        expect(s.listening.seen.filter((e) => e.type === 'poolWritten')).toHaveLength(1);
    });

    it('entitiesChanged: um por slot por quadro com as inserções acumuladas, antes de framePrepare', () => {
        const s = setup();
        s.frame();
        s.deaf.seen.length = 0;
        const ids = [s.scene.world.insert(new Heard()), s.scene.world.insert(new Heard())];
        expect(kinds(s.deaf)).toEqual([]); // nada antes do quadro
        s.frame();
        expect(s.deaf.seen.filter((e) => e.type === 'entitiesChanged')).toEqual([
            { type: 'entitiesChanged', slot: 'items', added: ids, removed: [] },
        ]);
        expect(kinds(s.deaf).indexOf('entitiesChanged')).toBeLessThan(
            kinds(s.deaf).indexOf('framePrepare'),
        );
    });

    it('entidade inserida e removida no mesmo quadro não aparece; removida depois sai em removed', () => {
        const s = setup();
        const kept = new Heard();
        const keptId = s.scene.world.insert(kept);
        s.frame();
        s.deaf.seen.length = 0;
        const brief = new Heard();
        s.scene.world.insert(brief);
        s.scene.world.remove(brief);
        s.scene.world.remove(kept);
        s.frame();
        expect(s.deaf.seen.filter((e) => e.type === 'entitiesChanged')).toEqual([
            { type: 'entitiesChanged', slot: 'items', added: [], removed: [keptId] },
        ]);
    });
});
