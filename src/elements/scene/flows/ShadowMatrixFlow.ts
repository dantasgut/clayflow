import type { WgslResource } from '../../../scene/shaders/WgslResource';
import type { BindingSource } from '../../../scene/flows/FlowBinding';
import { WORKGROUP_SIZE as ENGINE_WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import type {
    EngineCore,
    Frame,
    StorageBufferSpec,
    UniformBufferSpec,
} from '../../../scene/contracts/gpu';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { Flow } from '../../../scene/flows/Flow';
import type { BoundFlow, TransitionContext } from '../../../scene/flows/FlowBinding';
import type { FlowContext } from '../../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../../scene/flows/FlowTransitions';
import { slot, type EntitiesSlot, type PoolSlot, type SlotMap } from '../../../scene/flows/slots';
import { Geometry } from '../../geometry/Geometry';
import { DirectionalLight } from '../DirectionalLight';
import { Light } from '../Light';
import { ShadowMap } from '../ShadowMap';
import { Transform } from '../Transform';
import {
    ShadowBoundsGroupSchema,
    ShadowBoundsInstanceSchema,
    ShadowMatrixInstanceSchema,
    ShadowMatrixParamsSchema,
    shadowRecord,
} from './ShadowMatrixSchemas';
import { shadowBounds, shadowMatrix, shadowMatrixResources } from './shaders';

const WORKGROUP_SIZE = ENGINE_WORKGROUP_SIZE.value;

/** Slots do estágio da matriz de sombra. */
export interface ShadowMatrixSlots extends SlotMap {
    /** Pool `Light` (direção da luz). */
    readonly lights: PoolSlot<false>;
    /** Pool `ShadowMatrix` (saída). */
    readonly matrices: PoolSlot<false>;
    /** Luzes direcionais com mapa de sombra: registro `ShadowRecord` e a lista das vivas (grupo único). */
    readonly casters: EntitiesSlot;
    /**
     * Entidades com geometria (spec 034), em grupos pela geometria (a chave de conteúdo: as instâncias de um grupo têm a
     * mesma caixa de objeto), com o slot da matriz de mundo de cada uma — a caixa da cena.
     */
    readonly scene: EntitiesSlot;
}

const slots: ShadowMatrixSlots = {
    lights: slot.pool(Light.schema.name),
    matrices: slot.pool(ShadowMap.matrixSchema.name),
    casters: slot.entities({
        all: [DirectionalLight, ShadowMap],
        record: shadowRecord,
        groups: { schema: ShadowMatrixInstanceSchema, key: () => 'casters', instance: 'record' },
    }),
    scene: slot.entities({
        all: [Geometry, Transform],
        groups: {
            schema: ShadowBoundsInstanceSchema,
            key: (entry) => entry.get(Geometry).contentKey ?? `entity:${entry.entityId}`,
            instance: [Transform, 'world'],
            // A chave é só da geometria: o envio do `Transform` (pose, escala) não a muda.
            rekeyOn: { [Transform.schema.name]: [] },
        },
    }),
};

type Ctx = TransitionContext<ShadowMatrixSlots>;

/**
 * Estágio da matriz de sombra (spec 007, research R11) — produz, na GPU, a matriz luz-vista-projeção de cada
 * `DirectionalLight` que projeta sombra a partir da direção dela (pool `Light`), no pool `ShadowMatrix` (segundo
 * descritor do `ShadowMap`, mesmo slot), que o estágio de sombra e o render principal leem. A CPU não calcula a
 * matriz nem acompanha mudanças da luz: a direção chega ao pool pelo envio da C2 e o kernel a lê.
 *
 * A caixa da projeção é a da cena (spec 034, L6): antes da matriz, `shadow_bounds` reduz na GPU a caixa de mundo das
 * entidades com geometria (a caixa de objeto de cada uma, `Geometry.boundsSchema`, pela matriz de mundo); o mapa cobre o
 * que existe em vez de ±10 m fixos. Sem geometria, ou com uma caixa desconhecida (vértices da GPU), a caixa fixa.
 *
 * Fase `transform`, depois do `CameraFlow`. Roda todo quadro com luzes que projetam (poucas threads).
 */
export class ShadowMatrixFlow extends Flow<ShadowMatrixSlots, 'idle'> {
    readonly type = 'ShadowMatrixFlow';
    readonly slots = slots;
    override readonly pipelines: readonly PipelineDescriptor[] = [
        {
            id: 'shadow_bounds',
            role: 'compute',
            shader: shadowBounds,
            entryPoints: ['shadow_bounds_main'],
        },
        {
            id: 'shadow_matrix',
            role: 'compute',
            shader: shadowMatrix,
            entryPoints: ['shadow_matrix_main'],
        },
    ];
    /** Recurso privado: parâmetros do estágio (`ShadowMatrixParams`). */
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource>;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly core: EngineCore;
    private readonly params: UniformBufferSpec;
    /** A caixa da cena reduzida no quadro (`shadow_bounds.wgsl`: 8 palavras). */
    private readonly sceneBounds: StorageBufferSpec;
    /** A tabela dos grupos de geometria (`ShadowBoundsGroup`), reescrita quando a composição muda. */
    private boundsGroups: StorageBufferSpec;
    private groupCapacity = 16;
    private count = 0;
    private sceneCount = 0;
    private groupsWritten = '';
    private written = '';

    constructor(ctx: FlowContext) {
        super();
        this.core = ctx.core;
        this.params = ctx.core.create<UniformBufferSpec>({
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: 'shadow_matrix_params',
            byteSize: ShadowMatrixParamsSchema.stride,
        });
        this.sceneBounds = ctx.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: 'shadow_scene_bounds',
            byteSize: 32,
        });
        this.boundsGroups = this.groupTable(this.groupCapacity);
        this.bindings = new Map<WgslResource, BindingSource>([
            [shadowMatrixResources.params, this.params],
            [shadowMatrixResources.sceneBounds, this.sceneBounds],
            [shadowMatrixResources.boundsGroups, this.boundsGroups],
        ]);
        this.transitions = {
            '*': {
                slotsResolved: 'ignore',
                slotLost: 'ignore',
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
                poolReallocated: 'ignore',
                entitiesChanged: 'ignore',
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.writeParams(c);
                    },
                },
            },
        };
    }

    /** Grava o cálculo das matrizes das luzes vivas. */
    dispatch(frame: Frame, bound: BoundFlow<ShadowMatrixSlots>): void {
        if (this.count === 0) return;
        const b = bound.compute('shadow_bounds');
        const p = bound.compute('shadow_matrix');
        // A caixa da cena do quadro (zero = nada ainda) e, com ela, a matriz de cada luz.
        frame.clear(this.sceneBounds);
        frame.compute('ShadowMatrixFlow', (pass) => {
            if (this.sceneCount > 0) {
                pass.bind.setPipeline(b.spec);
                b.bindTo(pass.bind);
                pass.dispatch.invocations(this.sceneCount, WORKGROUP_SIZE);
            }
            pass.bind.setPipeline(p.spec);
            p.bindTo(pass.bind);
            pass.dispatch.invocations(this.count, WORKGROUP_SIZE);
        });
    }

    /** Libera o uniform de parâmetros, a caixa da cena e a tabela dos grupos. */
    override dispose(): void {
        this.core.destroy(this.params);
        this.core.destroy(this.sceneBounds);
        this.core.destroy(this.boundsGroups);
    }

    private groupTable(capacity: number): StorageBufferSpec {
        return this.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: `shadow_bounds_groups:${capacity}`,
            byteSize: capacity * ShadowBoundsGroupSchema.stride,
        });
    }

    /**
     * A tabela dos grupos (caixa de objeto da geometria e segmento na lista), reescrita só quando os grupos mudam;
     * crescida (e religada) quando passam da capacidade.
     */
    private writeGroups(ctx: Ctx): number {
        const groups = ctx.bound.slots.scene.groups;
        const key = groups.map((g) => `${g.key}:${g.first}:${g.count}`).join('|');
        if (key === this.groupsWritten) return groups.length;
        if (groups.length > this.groupCapacity) {
            while (this.groupCapacity < groups.length) this.groupCapacity *= 2;
            this.core.destroy(this.boundsGroups);
            this.boundsGroups = this.groupTable(this.groupCapacity);
            ctx.bind(new Map([[shadowMatrixResources.boundsGroups, this.boundsGroups]]));
        }
        const stride = ShadowBoundsGroupSchema.stride;
        const bytes = new Uint8Array(Math.max(1, groups.length) * stride);
        groups.forEach((g, k) => {
            const b = g.representative.get(Geometry).bounds;
            const packed = ShadowBoundsGroupSchema.pack({
                boundsMin: b === undefined ? [0, 0, 0, 1] : [...b.min, 0],
                boundsMax: b === undefined ? [0, 0, 0, 0] : [...b.max, 0],
                first: g.first,
                count: g.count,
            });
            bytes.set(
                new Uint8Array(packed.buffer, packed.byteOffset, packed.byteLength),
                k * stride,
            );
        });
        this.core.write(this.boundsGroups, bytes);
        this.groupsWritten = key;
        return groups.length;
    }

    /** Início e tamanho da lista, escritos quando mudam. */
    private writeParams(ctx: Ctx): void {
        const list = ctx.bound.slots.casters.groups[0];
        this.count = list?.count ?? 0;
        const first = list?.first ?? 0;
        const sceneGroups = this.writeGroups(ctx);
        this.sceneCount = ctx.bound.slots.scene.groups.reduce((n, g) => n + g.count, 0);
        const key = `${first}:${this.count}:${sceneGroups}:${this.sceneCount}`;
        if (key === this.written) return;
        this.core.write(
            this.params,
            ShadowMatrixParamsSchema.pack({
                first,
                count: this.count,
                sceneGroups,
                sceneCount: this.sceneCount,
            }),
        );
        this.written = key;
    }
}
