/**
 * Recomposição de entidades inseridas (spec 017, FR-004): `World.attach`/`detach` trocam os recursos de uma entidade
 * viva — índices por schema, `resourcesChanged`, `entitiesRecomposed` — e a C2 reavalia os slots de entidades dos
 * Flows (a entidade entra, sai ou troca de entrada no mesmo `entitiesChanged`) e libera/aloca os recursos.
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
import type { EntityId } from '../world/EntityId';
import { ReuseError } from '../world/World';
import { Flow } from '../flows/Flow';
import type { BoundFlow, TransitionContext } from '../flows/FlowBinding';
import type { FlowTransitions } from '../flows/FlowTransitions';
import { slot } from '../flows/slots';
import { createScene } from '../SceneContext';
import { countingCore } from './helpers/countingCore';

abstract class Pooled extends Entity implements Resource {
    state: ResourceState = ResourceState.Uninitialized;
    abstract getDescriptors(): readonly GPUDescriptor[];
    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
const BodySchema = new StructSchema('RecomposeBody', { p: FieldType.vec4f });
const PaintSchema = new StructSchema('RecomposePaint', { c: FieldType.vec4f });
const GlossSchema = new StructSchema('RecomposeGloss', { g: FieldType.vec4f });
class Body extends Pooled {
    static readonly schema = BodySchema;
    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'body', role: 'storage-ro', storage: 'pool', schema: BodySchema }];
    }
}
abstract class Look extends Pooled {}
class Paint extends Look {
    static readonly schema = PaintSchema;
    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'look', role: 'storage-ro', storage: 'pool', schema: PaintSchema }];
    }
}
class Gloss extends Look {
    static readonly schema = GlossSchema;
    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'look', role: 'storage-ro', storage: 'pool', schema: GlossSchema }];
    }
}

const slots = {
    painted: slot.entities({ all: [Body, Paint] }),
    looks: slot.entities({ all: [Body, Look] }),
};
type Slots = typeof slots;

/** Guarda cada `entitiesChanged` por slot. */
class Watcher extends Flow<Slots, 'idle'> {
    readonly type = 'Watcher';
    readonly slots = slots;
    readonly changes: { slot: string; added: EntityId[]; removed: EntityId[] }[] = [];
    bound: BoundFlow<Slots> | undefined;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', TransitionContext<Slots>> = {
        '*': {
            slotsResolved: 'ignore',
            pipelinesCompiled: 'ignore',
            bindGroupReplaced: 'ignore',
            entitiesChanged: {
                to: 'idle',
                run: (e) => {
                    if (e.type !== 'entitiesChanged') return;
                    this.changes.push({
                        slot: e.slot,
                        added: [...e.added],
                        removed: [...e.removed],
                    });
                },
            },
        },
    };
    dispatch(_frame: Frame, bound: BoundFlow<Slots>): void {
        this.bound = bound;
    }
}

function setup() {
    const counting = countingCore();
    const scene = createScene({ core: counting.core });
    const flow = scene.flows.register(() => new Watcher(), { type: 'w', phase: 'forward' }).flow!;
    let n = 0;
    const frame = (): void => {
        scene.events.emit('frameTick', { dt: 1 / 60, realDt: 1 / 60, elapsed: 0, frame: ++n });
    };
    const events: string[] = [];
    scene.events.on('resourcesChanged', (e) =>
        events.push(`changed:+${e.added.length}-${e.removed.length}`),
    );
    scene.events.on('entitiesRecomposed', (e) =>
        events.push(`recomposed:${e.entityIds.join(',')}`),
    );
    return { scene, flow, frame, events, rs: scene.resourceSystem };
}

describe('World.attach/detach (spec 017)', () => {
    it('attach: o recurso entra na cena, nos índices e na entidade; eventos na ordem', () => {
        const s = setup();
        const body = new Body();
        const id = s.scene.world.insert(body);
        s.events.length = 0;
        const paint = new Paint();
        s.scene.world.attach(body, paint);
        expect(body.attached).toContain(paint);
        expect(s.scene.world.resourcesOf(id)).toContain(paint);
        expect(s.scene.world.entityIdOfResource(paint)).toBe(id);
        expect(s.scene.world.queryBySchema(PaintSchema)).toEqual([id]);
        expect(s.events).toEqual(['changed:+1-0', `recomposed:${id}`]);
        expect(s.rs.poolSlotOf(PaintSchema.name, id)).toBeDefined();
    });

    it('detach: o recurso sai da cena e dos índices; o slot de pool é liberado', () => {
        const s = setup();
        const paint = new Paint();
        const body = new Body().add(paint);
        const id = s.scene.world.insert(body);
        s.events.length = 0;
        expect(s.scene.world.detach(body, paint)).toBe(true);
        expect(body.attached).not.toContain(paint);
        expect(s.scene.world.resourcesOf(id)).not.toContain(paint);
        expect(s.scene.world.entityIdOfResource(paint)).toBeUndefined();
        expect(s.scene.world.queryBySchema(PaintSchema)).toEqual([]);
        expect(s.scene.world.queryBySchema(BodySchema)).toEqual([id]);
        expect(s.events).toEqual(['changed:+0-1', `recomposed:${id}`]);
        expect(s.rs.poolSlotOf(PaintSchema.name, id)).toBeUndefined();
        // Desanexado, pode ir para outra entidade.
        const other = new Body();
        s.scene.world.insert(other);
        expect(() => {
            s.scene.world.attach(other, paint);
        }).not.toThrow();
    });

    it('attach de recurso já na cena: ReuseError; entidade não inserida: erro; detach de não-filho: false', () => {
        const s = setup();
        const paint = new Paint();
        const a = new Body().add(paint);
        s.scene.world.insert(a);
        const b = new Body();
        s.scene.world.insert(b);
        expect(() => {
            s.scene.world.attach(b, paint);
        }).toThrow(ReuseError);
        expect(() => {
            s.scene.world.attach(new Body(), new Paint());
        }).toThrow(/não é uma entidade inserida/);
        expect(s.scene.world.detach(b, paint)).toBe(false);
    });

    it('slots de entidades: trocar o material faz a entidade sair de um conjunto e trocar de entrada no outro', () => {
        const s = setup();
        const paint = new Paint();
        const body = new Body().add(paint);
        const id = s.scene.world.insert(body);
        s.frame();
        expect(s.flow.bound!.slots.painted.entries.map((e) => e.entityId)).toEqual([id]);
        s.flow.changes.length = 0;
        // Troca no mesmo quadro: Paint → Gloss.
        s.scene.world.detach(body, paint);
        const gloss = new Gloss();
        s.scene.world.attach(body, gloss);
        s.frame();
        expect(s.flow.bound!.slots.painted.entries).toEqual([]);
        expect(s.flow.bound!.slots.looks.entries.map((e) => e.get(Look))).toEqual([gloss]);
        const bySlot = Object.fromEntries(s.flow.changes.map((c) => [c.slot, c]));
        expect(bySlot.painted).toEqual({ slot: 'painted', added: [], removed: [id] });
        // `looks`: saiu (sem Look) e voltou (com Gloss) no mesmo quadro — o Flow vê saída e entrada.
        expect(bySlot.looks).toEqual({ slot: 'looks', added: [id], removed: [id] });
    });

    it('entidade que entrou no quadro e foi recomposta continua só como entrada', () => {
        const s = setup();
        const paint = new Paint();
        const body = new Body().add(paint);
        const id = s.scene.world.insert(body);
        s.scene.world.detach(body, paint);
        s.scene.world.attach(body, new Gloss());
        s.frame();
        const looks = s.flow.changes.find((c) => c.slot === 'looks');
        expect(looks).toEqual({ slot: 'looks', added: [id], removed: [] });
        expect(s.flow.changes.find((c) => c.slot === 'painted')).toBeUndefined();
    });
});
