import { WORKGROUP_SIZE as ENGINE_WORKGROUP_SIZE, NONE } from '../../scene/shaders/engineConstants';
import type { ComputePass } from '../../scene/contracts/gpu';
import type {
    AnyBufferSpec,
    EngineCore,
    Frame,
    StagingBufferSpec,
    StorageBufferSpec,
} from '../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../scene/contracts/ResourceDirectory';
import type { EventBus } from '../../scene/events/EventBus';
import {
    createComputeKernel,
    destroyComputeKernel,
    type ComputeKernel,
} from '../../scene/flows/createComputeKernel';
import { Flow } from '../../scene/flows/Flow';
import type { BindingSource, BoundFlow, TransitionContext } from '../../scene/flows/FlowBinding';
import type { FlowContext } from '../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../scene/flows/FlowTransitions';
import {
    slot,
    type EntitiesSlot,
    type EntityEntry,
    type SingletonSlot,
    type SlotMap,
} from '../../scene/flows/slots';
import type { WgslResource } from '../../scene/shaders/WgslResource';
import type { World } from '../../scene/world/World';
import type { EntityId } from '../../scene/world/EntityId';
import { PerStepUniforms } from '../gpu/compute/PerStepUniforms';
import { RadixSort } from '../gpu/compute/RadixSort';
import { Geometry } from '../geometry/Geometry';
import { Material } from '../material/Material';
import { StandardMaterial } from '../material/StandardMaterial';
import { MaterialFunction } from '../extension/MaterialFunction';
import type { WgslModule } from '../../scene/shaders/WgslModule';
import { renderableRecord } from '../scene/Renderable';
import { Transform } from '../scene/Transform';
import { RayScene, type RaySceneCapacity } from './RayScene';
import {
    RayAabbSchema,
    RayBuildParamsSchema,
    RayInstanceSourceSchema,
    RAY_WORDS,
    RayBvhSchema,
    RayGeometrySchema,
} from './schemas';
import {
    rayBounds,
    rayBuildResources as B,
    rayGather,
    rayInstances,
    rayLbvh,
    rayMorton,
    rayRefit,
    rayReorder,
    raySceneResources,
} from './shaders';
import { renderablesResource, worldsResource } from '../scene/resources';
import { standardMaterialsResource } from '../material/renderResources';

const WORKGROUP_SIZE = ENGINE_WORKGROUP_SIZE.value;
/** Tipos de primitiva (os `RAY_KIND_*` do WGSL). */
const KIND_TRIANGLES = 0;
/** Primitivas da hierarquia de cima (instâncias; não são reordenadas). */
const KIND_INSTANCES = 3;
/** Bits das chaves de Morton da hierarquia de cima (8 por eixo): 6 passadas da ordenação em vez de 8. */
const TLAS_KEY_BITS = 24;
/**
 * Triângulos consecutivos (em ordem de Morton) por folha das hierarquias de baixo: um oitavo dos nós de folhas de um
 * triângulo, menos memória e menos reajuste (1 milhão de triângulos em ≤ 1 ms), com caixas justas (vizinhos).
 */
const LEAF_SIZE = 8;
/** Quadros entre topologias novas da hierarquia de cima (nos outros, só as caixas são reajustadas). */
const TLAS_REBUILD_FRAMES = 8;

/** Slots do estágio da estrutura de raios. */
export interface RaySceneSlots extends SlotMap {
    /** A estrutura da cena (sem ela o estágio não faz nada). */
    readonly scene: SingletonSlot<false>;
    /** Tudo o que é desenhado: geometria, material e transformação, com o registro `Renderable` do forward. */
    readonly renderables: EntitiesSlot;
}

const slots: RaySceneSlots = {
    scene: slot.singleton(RayScene.schema),
    renderables: slot.entities({
        all: [Geometry, Material, Transform],
        record: renderableRecord,
    }),
};

type Ctx = TransitionContext<RaySceneSlots>;

/** Buffers de uma geometria ligados aos kernels de cópia (outros buffers = kernels refeitos). */
interface SourceBuffers {
    readonly vertices: AnyBufferSpec;
    readonly indices: AnyBufferSpec;
    readonly indirect: AnyBufferSpec | undefined;
}

/** Hierarquia de baixo de um conteúdo de geometria. */
interface Blas {
    readonly key: string;
    readonly geometry: Geometry;
    /** Primitivas (capacidade de triângulos). */
    readonly count: number;
    /** Folhas (`LEAF_SIZE` triângulos cada). */
    readonly leaves: number;
    readonly vertexCount: number;
    /** Índices `uint16`. */
    readonly u16: boolean;
    /** Contagem só na GPU (registro indireto): a topologia muda com a produção — reconstrói em vez de reajustar. */
    readonly indirect: boolean;
    /** Entidades que a usam. */
    readonly users: Set<EntityId>;
    /** Faixas na estrutura (relativas ao início de cada pool). */
    nodeBase: number;
    primBase: number;
    vertexBase: number;
    /** Índice nos registros de hierarquia e na caixa do conjunto. */
    index: number;
    /** Construída alguma vez com os dados atuais. */
    built: boolean;
    /** O que gravar neste quadro (decidido no `framePrepare`). */
    action: 'build' | 'refit' | 'none';
    /** Buffers ligados aos kernels de cópia. */
    sources: SourceBuffers | undefined;
    gatherVertices: ComputeKernel | undefined;
    gatherTriangles: ComputeKernel | undefined;
}

/** Kernels genéricos (ligados aos temporários e aos pools, os mesmos para todas as hierarquias). */
interface SharedKernels {
    readonly bounds: ComputeKernel;
    readonly morton: ComputeKernel;
    readonly lbvh: ComputeKernel;
    readonly leaves: ComputeKernel;
    readonly clear: ComputeKernel;
    readonly leavesTriangles: ComputeKernel;
    readonly leavesAabbs: ComputeKernel;
    readonly climb: ComputeKernel;
    readonly reorderGather: ComputeKernel;
    readonly reorderStore: ComputeKernel;
    readonly instances: ComputeKernel;
}

/** Temporários da construção. */
interface Scratch {
    /** Primitivas comportadas (caixas, chaves, valores, contadores). */
    readonly prims: number;
    /** Hierarquias comportadas (caixa do conjunto). */
    readonly slots: number;
    /** Nós comportados (pais). */
    readonly nodes: number;
    /** Instâncias comportadas (origens). */
    readonly instances: number;
    readonly aabbs: StorageBufferSpec;
    readonly bounds: StorageBufferSpec;
    readonly keys: StorageBufferSpec;
    readonly values: StorageBufferSpec;
    readonly parents: StorageBufferSpec;
    readonly counters: StorageBufferSpec;
    /** Caixas do reajuste (seis palavras atômicas por nó). */
    readonly boxes: StorageBufferSpec;
    /** Triângulos permutados (reordenação na ordem das folhas). */
    readonly tris: StorageBufferSpec;

    readonly sources: StorageBufferSpec;
}

/** Instância de um quadro: a hierarquia, os slots e o material (bit `StandardMaterial` + índice da função). */
interface Instance {
    readonly blas: Blas;
    readonly renderable: number;
    readonly world: number;
    readonly material: number;
}

/** Material de uma entidade: `StandardMaterial` (o slot aponta o pool dele) e a função `material`, se houver. */
interface EntityMaterial {
    readonly standard: boolean;
    readonly fn: MaterialFunction | undefined;
}

/** Bit das instâncias com `StandardMaterial` (o `GI_HIT_STANDARD` do WGSL). */
const MATERIAL_STANDARD = 0x80000000;
/** Funções que leem derivadas de tela só valem no desenho (nos acertos, as constantes). */
const FRAGMENT_ONLY = /\b(dpdx|dpdy|fwidth)\w*\s*\(/;

/** Pools da estrutura (chaves) e os seus buffers ligados. */
const POOLS = [RayGeometrySchema, RayBvhSchema] as const;

/** Palavras por caixa do conjunto (mínimo e máximo em ordem de u32, com folga para 8). */
const BOUNDS_WORDS = 8;

/**
 * RaySceneFlow — constrói e mantém a estrutura de raios da cena na GPU (spec 033, R1). Por conteúdo de geometria, uma
 * hierarquia de baixo: os vértices e os triângulos copiados para os pools da `RayScene`, as caixas, os códigos de
 * Morton ordenados pela ordenação radix, a hierarquia LBVH e as caixas de baixo para cima. Geometria escrita na GPU
 * (superfícies, grafos, corpos moles) é reajustada nos quadros em que o seu produtor a marca (`produced('vertices')`):
 * caixas novas na mesma topologia; com a contagem só na GPU (registro indireto), reconstruída. Por quadro, a hierarquia
 * de cima sobre as instâncias (as matrizes de mundo lidas na GPU). Nenhuma leitura de volta.
 *
 * Fase `transform`, depois dos estágios que escrevem geometria (registrado depois deles: o `framePrepare` deles vem
 * antes). Sem `RayScene` na cena o estágio fica pendente e não custa nada.
 */
export class RaySceneFlow extends Flow<RaySceneSlots, 'idle'> {
    readonly type = 'RaySceneFlow';
    readonly slots = slots;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly core: EngineCore;
    private readonly resources: ResourceDirectory;
    private readonly world: World;
    private readonly events: EventBus;
    private readonly params: PerStepUniforms;
    private readonly blas = new Map<string, Blas>();
    private readonly blasOf = new Map<EntityId, Blas>();
    private readonly materialOf = new Map<EntityId, EntityMaterial>();
    /** Módulos das funções na ordem dos índices gravados (outros módulos = refaz). */
    private functionModules: readonly WgslModule[] = [];
    private instances: Instance[] = [];
    private order: Blas[] = [];
    private scratch: Scratch | undefined;
    private sort: RadixSort | undefined;
    private sortCapacity = 0;
    private shared: SharedKernels | undefined;
    /** Buffers dos pools ligados aos kernels (outro buffer = kernels refeitos). */
    private pools: readonly (StorageBufferSpec | undefined)[] = [];
    private scene: RayScene | undefined;
    /** O conjunto mudou: refaz o leiaute, os registros e as origens das instâncias. */
    private layoutDirty = true;
    /** Primeiro quadro depois de uma realocação: toda hierarquia é reconstruída. */
    private rebuildAll = true;
    private unsupported = false;

    constructor(ctx: FlowContext) {
        super();
        this.core = ctx.core;
        this.resources = ctx.resources;
        this.world = ctx.world;
        this.events = ctx.events;
        this.params = new PerStepUniforms(ctx.core, {
            discriminator: 'ray_build_params',
            schema: RayBuildParamsSchema,
        });
        this.params.reserve(2);
        this.transitions = {
            '*': {
                slotsResolved: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.track(c.bound.slots.renderables.entries, []);
                    },
                },
                entitiesChanged: {
                    to: 'idle',
                    run: (e, c) => {
                        if (e.type !== 'entitiesChanged') return;
                        const set = c.bound.slots.renderables;
                        this.track(
                            e.added.map((id) => set.entry(id)).filter((x) => x !== undefined),
                            e.removed,
                        );
                    },
                },
                slotChanged: 'ignore',
                slotLost: 'ignore',
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
                poolReallocated: 'ignore',
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.prepare(c.bound.slots.scene.resource as RayScene);
                    },
                },
            },
        };
    }

    /** Grava as hierarquias de baixo pendentes ou produzidas e a hierarquia de cima. */
    dispatch(frame: Frame, _bound: BoundFlow<RaySceneSlots>): void {
        const scratch = this.scratch;
        const shared = this.shared;
        if (scratch === undefined || shared === undefined || this.unsupported) return;
        frame.clear(scratch.bounds);
        const work = this.order.filter(
            (b) =>
                b.action !== 'none'
                && b.gatherVertices !== undefined
                && b.gatherTriangles !== undefined,
        );
        this.lastFrame = {
            built: 0,
            refit: 0,
            instances: this.instances.length,
            tlasRebuilt: false,
        };
        // Hierarquias de baixo num passe só (os despachos do mesmo passe já se ordenam pelas escritas).
        if (work.length > 0) {
            frame.compute('RaySceneFlow.blas', (pass) => {
                for (const b of work) {
                    const build = b.action === 'build';
                    const offset = [this.params.offset(b.index)];
                    this.run(pass, b.gatherVertices!, offset, b.vertexCount);
                    if (build) {
                        this.run(pass, b.gatherTriangles!, offset, b.count);
                        this.run(pass, shared.bounds, offset, b.count);
                        this.recordHierarchy(
                            frame,
                            pass,
                            shared,
                            scratch,
                            offset,
                            b.count,
                            b.leaves,
                            32,
                        );
                        this.run(pass, shared.reorderGather, offset, b.count);
                        this.run(pass, shared.reorderStore, offset, b.count);
                    }
                    this.run(pass, shared.leavesTriangles, offset, b.leaves);
                    this.run(pass, shared.clear, offset, b.leaves - 1);
                    this.run(pass, shared.climb, offset, b.leaves);
                    b.built = true;
                    if (build) this.lastFrame.built++;
                    else this.lastFrame.refit++;
                }
            });
        }
        this.rebuildAll = false;
        // Hierarquia de cima (região depois das de baixo), refeita a cada quadro.
        const n = this.instances.length;
        if (n === 0) return;
        const offset = [this.params.offset(this.order.length)];
        // Topologia nova quando o conjunto muda e a cada `TLAS_REBUILD_FRAMES` quadros (as instâncias que andam muito
        // afrouxam as caixas); nos outros, só as caixas são reajustadas.
        const rebuild = this.tlasStale || this.tlasAge >= TLAS_REBUILD_FRAMES;
        frame.compute('RaySceneFlow.tlas', (pass) => {
            this.run(pass, shared.instances, offset, n);
            if (rebuild)
                this.recordHierarchy(frame, pass, shared, scratch, offset, n, n, TLAS_KEY_BITS);
            this.run(pass, shared.clear, offset, n - 1);
            this.run(pass, shared.leavesAabbs, offset, n);
            this.run(pass, shared.climb, offset, n);
        });
        this.tlasStale = rebuild ? false : this.tlasStale;
        this.tlasAge = rebuild ? 0 : this.tlasAge + 1;
        this.lastFrame.tlasRebuilt = rebuild;
    }

    /** O que o último quadro gravou (para testes e depuração): construções, reajustes e instâncias. */
    lastFrame: { built: number; refit: number; instances: number; tlasRebuilt: boolean } = {
        built: 0,
        refit: 0,
        instances: 0,
        tlasRebuilt: false,
    };
    /** A topologia da hierarquia de cima não vale (o conjunto de instâncias mudou). */
    private tlasStale = true;
    /** Quadros desde a última topologia nova da hierarquia de cima. */
    private tlasAge = 0;

    /** Libera kernels, temporários, a ordenação e os parâmetros. */
    override dispose(): void {
        for (const b of this.blas.values()) this.releaseGather(b);
        this.blas.clear();
        this.blasOf.clear();
        this.releaseShared();
        this.releaseScratch();
        this.sort?.destroy();
        this.params.dispose();
    }

    /** Morton → ordenação (chaves de `bits` bits) → hierarquia (nós internos e folhas), no passe aberto. */
    private recordHierarchy(
        frame: Frame,
        pass: ComputePass,
        shared: SharedKernels,
        scratch: Scratch,
        offset: number[],
        count: number,
        leaves: number,
        bits: number,
    ): void {
        this.run(pass, shared.morton, offset, count);
        this.sort!.record(frame, { keys: scratch.keys, values: scratch.values, count, bits, pass });
        if (leaves > 1) this.run(pass, shared.lbvh, offset, leaves - 1);
        this.run(pass, shared.leaves, offset, leaves);
    }

    private run(pass: ComputePass, kernel: ComputeKernel, offset: number[], count: number): void {
        if (count <= 0) return;
        pass.bind.setPipeline(kernel.pipeline);
        kernel.bindTo(pass.bind, { draw: offset });
        pass.dispatch.invocations(count, WORKGROUP_SIZE);
    }

    /** Entidades que entraram (hierarquia do conteúdo criada ou compartilhada) e saíram (liberada sem usuários). */
    private track(added: readonly EntityEntry[], removed: readonly EntityId[]): void {
        for (const id of removed) {
            const b = this.blasOf.get(id);
            if (b === undefined) continue;
            this.blasOf.delete(id);
            this.materialOf.delete(id);
            b.users.delete(id);
            if (b.users.size === 0) {
                this.releaseGather(b);
                this.blas.delete(b.key);
            }
        }
        for (const entry of added) {
            const geometry = entry.get(Geometry);
            // Só triângulos indexados entram (nuvens de pontos e arames não são superfícies).
            if (geometry.indexCount < 3 || this.blasOf.has(entry.entityId)) continue;
            const key = geometry.contentKey ?? `entity:${entry.entityId}`;
            let b = this.blas.get(key);
            if (b === undefined) {
                b = {
                    key,
                    geometry,
                    count: Math.floor(geometry.indexCount / 3),
                    leaves: Math.ceil(Math.floor(geometry.indexCount / 3) / LEAF_SIZE),
                    vertexCount: geometry.vertexCount,
                    u16: geometry.indexFormat === 'uint16',
                    indirect: geometry.getDescriptors().some((d) => d.role === 'indirect'),
                    users: new Set(),
                    nodeBase: 0,
                    primBase: 0,
                    vertexBase: 0,
                    index: 0,
                    built: false,
                    action: 'none',
                    sources: undefined,
                    gatherVertices: undefined,
                    gatherTriangles: undefined,
                };
                this.blas.set(key, b);
            }
            b.users.add(entry.entityId);
            this.blasOf.set(entry.entityId, b);
            this.materialOf.set(entry.entityId, {
                standard: entry.get(Material) instanceof StandardMaterial,
                fn: entry.resources.find(
                    (r): r is MaterialFunction => r instanceof MaterialFunction,
                ),
            });
        }
        this.layoutDirty = true;
    }

    /** Antes da gravação: capacidades, faixas, registros, temporários, kernels e parâmetros. */
    private prepare(scene: RayScene): void {
        if (this.unsupported) return;
        if (scene !== this.scene) {
            this.scene = scene;
            this.layoutDirty = true;
            this.rebuildAll = true;
        }
        if (this.functionsChanged()) this.layoutDirty = true;
        if (this.layoutDirty) this.layout(scene);
        const pools = POOLS.map((s) => this.resources.poolBufferSpec(s.name));
        if (pools.some((p) => p === undefined)) return;
        if (pools.some((p, k) => p !== this.pools[k])) {
            // Pools realocados: o conteúdo de GPU se perdeu e os kernels ligam os buffers novos.
            this.pools = pools;
            this.releaseShared();
            for (const b of this.blas.values()) this.releaseGather(b);
            this.rebuildAll = true;
            this.layoutDirty = true;
            this.layout(scene);
        }
        if (this.rebuildAll) for (const b of this.blas.values()) b.built = false;
        this.ensureScratch();
        if (this.unsupported) return;
        this.ensureKernels();
        if (this.decide()) this.layout(scene);
        this.writeParams(scene);
    }

    /**
     * O que cada hierarquia grava neste quadro: construção (nova, topologia ou buffers novos, contagem só na GPU
     * produzida), reajuste (produzida, mesma topologia) ou nada. Geometria escrita na GPU entra depois da primeira
     * produção. Devolve `true` quando o conjunto de hierarquias prontas mudou (refaz as instâncias).
     */
    private decide(): boolean {
        let changed = false;
        for (const b of this.order) {
            const wasReady = b.built || b.action === 'build';
            const gpuWritten = this.resources.hasGpuWriter(b.geometry, 'vertices');
            const produced = this.resources.isProduced(b.geometry, 'vertices');
            if (b.gatherVertices === undefined || (gpuWritten && !b.built && !produced))
                b.action = 'none';
            else if (!b.built || (produced && b.indirect)) b.action = 'build';
            else b.action = produced ? 'refit' : 'none';
            const ready = b.built || b.action === 'build';
            if (ready !== wasReady) changed = true;
        }
        return changed;
    }

    /** Faixas das hierarquias, capacidades, uniform da estrutura, registros de hierarquia e origens das instâncias. */
    private layout(scene: RayScene): void {
        this.layoutDirty = false;
        this.order = [...this.blas.values()];
        let vertices = 0;
        let triangles = 0;
        let nodes = 0;
        this.order.forEach((b, i) => {
            b.index = i;
            b.vertexBase = vertices;
            b.primBase = triangles;
            b.nodeBase = nodes;
            vertices += b.vertexCount;
            triangles += b.count;
            nodes += 2 * b.leaves - 1;
        });
        const functions = this.composeFunctions(scene);
        this.instances = [];
        for (const [id, b] of this.blasOf) {
            if (!b.built && b.action !== 'build') continue;
            const renderable = this.recordSlotOf(id);
            if (renderable === undefined) continue;
            const world = this.resources.poolSlotOf(Transform.worldSchema.name, id) ?? NONE.value;
            const m = this.materialOf.get(id);
            const composite = m?.fn?.composite?.module;
            const index = composite === undefined ? -1 : functions.indexOf(composite);
            const material = (m?.standard === true ? MATERIAL_STANDARD : 0) | (index + 1);
            this.instances.push({ blas: b, renderable, world, material: material >>> 0 });
        }
        // Capacidades por todas as instâncias (prontas ou não): ficar pronta não realoca os pools.
        const tlasNodes = Math.max(1, 2 * this.blasOf.size - 1);
        const needed: RaySceneCapacity = {
            vertices: Math.max(1, vertices),
            triangles: Math.max(1, triangles),
            spheres: 1,
            nodes: nodes + tlasNodes,
            blas: Math.max(1, this.order.length),
            instances: Math.max(1, this.blasOf.size),
        };
        if (scene.reserve(needed)) this.rebuildAll = true;
        const sceneId = this.world.entityIdOfResource(scene);
        const first = (schema: { readonly name: string }): number =>
            (sceneId === undefined
                ? undefined
                : this.resources.poolRangeOf(schema.name, sceneId)?.first) ?? 0;
        const info = scene.data;
        // Regiões nos dois pools (palavras): vértices, triângulos e esferas; nós, hierarquias e instâncias.
        const cap = scene.data;
        info.vertexFirst = first(RayGeometrySchema);
        info.triangleFirst = info.vertexFirst + RAY_WORDS.vertex * cap.vertices;
        info.sphereFirst = info.triangleFirst + RAY_WORDS.triangle * cap.triangles;
        info.nodeFirst = first(RayBvhSchema);
        info.blasFirst = info.nodeFirst + RAY_WORDS.node * cap.nodes;
        info.instanceFirst = info.blasFirst + RAY_WORDS.blas * cap.blas;
        info.instanceCount = this.instances.length;
        this.tlasStale = true;
        info.tlasRoot = nodes;
        this.writeRecords(scene);
    }

    /**
     * As funções `material` das entidades (a versão renomeada, uma por código) publicadas na `RayScene` para quem
     * sombreia os acertos; as que leem derivadas de tela ficam de fora (as constantes valem nos acertos).
     */
    private composeFunctions(scene: RayScene): readonly WgslModule[] {
        const list: { module: WgslModule; fn: MaterialFunction }[] = [];
        for (const m of this.materialOf.values()) {
            const composite = m.fn?.composite;
            if (composite === undefined || m.fn === undefined || FRAGMENT_ONLY.test(m.fn.code))
                continue;
            if (!list.some((e) => e.module === composite.module))
                list.push({ module: composite.module, fn: m.fn });
        }
        const modules = list.map((e) => e.module);
        if (
            modules.length !== this.functionModules.length
            || modules.some((m, k) => m !== this.functionModules[k])
        ) {
            this.functionModules = modules;
            scene.materialFunctions = list.map(({ fn }) => ({
                ...fn.composite!,
                returnsClosure: fn.returnsClosure,
            }));
            scene.materialRevision++;
        }
        return modules;
    }

    /** O código de alguma função `material` mudou desde o leiaute (refaz os índices). */
    private functionsChanged(): boolean {
        let k = 0;
        const seen = new Set<WgslModule>();
        for (const m of this.materialOf.values()) {
            const composite = m.fn?.composite?.module;
            if (
                composite === undefined
                || m.fn === undefined
                || FRAGMENT_ONLY.test(m.fn.code)
                || seen.has(composite)
            )
                continue;
            seen.add(composite);
            if (this.functionModules[k++] !== composite) return true;
        }
        return k !== this.functionModules.length;
    }

    /** Slot do registro `Renderable` da entidade (o `firstInstance` do desenho). */
    private recordSlotOf(id: EntityId): number | undefined {
        return this.resources.poolSlotOf(renderableRecord.schema.name, id);
    }

    /** Registros de hierarquia (CPU conhece as faixas) e origens das instâncias, escritos quando o conjunto muda. */
    private writeRecords(scene: RayScene): void {
        const blasPool = this.resources.poolBufferSpec(RayBvhSchema.name);
        if (blasPool !== undefined && this.order.length > 0) {
            const words = new Uint32Array(this.order.length * 8);
            this.order.forEach((b, i) => {
                words.set(
                    [
                        b.nodeBase,
                        b.primBase,
                        b.count,
                        KIND_TRIANGLES,
                        b.vertexBase,
                        NONE.value,
                        LEAF_SIZE,
                        0,
                    ],
                    i * 8,
                );
            });
            this.core.write(blasPool, words, scene.data.blasFirst * RayBvhSchema.stride);
        }
        this.ensureScratch();
        if (this.scratch !== undefined && this.instances.length > 0) {
            const words = new Uint32Array(this.instances.length * 8);
            this.instances.forEach((inst, i) => {
                words.set(
                    [
                        inst.blas.index,
                        inst.renderable,
                        inst.world,
                        KIND_TRIANGLES,
                        inst.material,
                        0,
                        0,
                        0,
                    ],
                    i * 8,
                );
            });
            this.core.write(this.scratch.sources, words);
        }
    }

    /** Temporários pelo maior conjunto de primitivas, de hierarquias, de nós e de instâncias (crescem por dobra). */
    private ensureScratch(): void {
        const scene = this.scene;
        if (scene === undefined) return;
        const prims = Math.max(1, this.blasOf.size, ...this.order.map((b) => b.count));
        const slotCount = this.order.length + 1;
        const nodes = scene.data.nodes;
        const instances = Math.max(1, this.blasOf.size);
        const s = this.scratch;
        if (
            s !== undefined
            && s.prims >= prims
            && s.slots >= slotCount
            && s.nodes >= nodes
            && s.instances >= instances
        )
            return;
        const limit = this.core.capabilities().limits.maxStorageBufferBindingSize ?? 134217728;
        const grown = (current: number, needed: number): number => {
            let c = Math.max(1, current);
            while (c < needed) c *= 2;
            return c;
        };
        const next = {
            prims: grown(s?.prims ?? 1024, prims),
            slots: grown(s?.slots ?? 16, slotCount),
            nodes: grown(s?.nodes ?? 4096, nodes),
            instances: grown(s?.instances ?? 64, instances),
        };
        if (
            next.prims * RayAabbSchema.stride > limit
            || next.nodes * RAY_WORDS.node * RayBvhSchema.stride > limit
        ) {
            this.unsupported = true;
            this.events.emit('globalIlluminationUnsupported', {
                reason: `estrutura de raios acima do limite de binding do dispositivo (${limit} bytes)`,
            });
            return;
        }
        this.releaseShared();
        this.releaseScratch();
        const storage = (name: string, bytes: number): StorageBufferSpec =>
            this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `ray_scene:${name}`,
                byteSize: Math.max(16, bytes),
            });
        this.scratch = {
            ...next,
            aabbs: storage('aabbs', next.prims * RayAabbSchema.stride),
            bounds: storage('bounds', next.slots * BOUNDS_WORDS * 4),
            keys: storage('keys', next.prims * 4),
            values: storage('values', next.prims * 4),
            parents: storage('parents', next.nodes * 4),
            counters: storage('counters', next.prims * 2 * 4),
            boxes: storage('boxes', next.prims * 2 * 6 * 4),
            tris: storage('tris', next.prims * RAY_WORDS.triangle * RayGeometrySchema.stride),
            sources: storage('sources', next.instances * RayInstanceSourceSchema.stride),
        };
        if (this.sortCapacity < next.prims) {
            this.sort?.destroy();
            this.sort = new RadixSort(this.core, {
                discriminator: 'ray_scene_sort',
                capacity: next.prims,
                withValues: true,
            });
            this.sortCapacity = next.prims;
        }
        this.rebuildAll = true;
        this.layoutDirty = true;
    }

    /** Kernels genéricos e de cópia que faltam (ou cujos buffers mudaram). */
    private ensureKernels(): void {
        const scratch = this.scratch!;
        const [geometry, bvh] = this.pools as StorageBufferSpec[];
        // Ordenações por quadro: uma por hierarquia construída mais a de cima.
        this.sort!.prepare(scratch.keys, scratch.values, this.order.length + 1);
        if (this.params.reserve(this.order.length + 1)) this.releaseShared();
        const build = this.params.source();
        if (this.shared === undefined) {
            const worlds = this.resources.poolBufferSpec(Transform.worldSchema.name);
            const renderables = this.resources.poolBufferSpec(renderableRecord.schema.name);
            const materials = this.resources.poolBufferSpec(StandardMaterial.schema.name);
            const kernel = (
                name: string,
                shader: Parameters<typeof createComputeKernel>[1]['shader'],
                entryPoint: string,
                bindings: [WgslResource, BindingSource][],
            ): ComputeKernel =>
                createComputeKernel(this.core, {
                    discriminator: `ray_scene:${name}`,
                    shader,
                    entryPoint,
                    bindings: new Map<WgslResource, BindingSource>([[B.build, build], ...bindings]),
                });
            this.shared = {
                bounds: kernel('bounds', rayBounds, 'ray_bounds_triangles_main', [
                    [raySceneResources.geometry, geometry!],
                    [B.aabbs, scratch.aabbs],
                    [B.bounds, scratch.bounds],
                ]),
                morton: kernel('morton', rayMorton, 'ray_morton_main', [
                    [B.aabbsRead, scratch.aabbs],
                    [B.boundsRead, scratch.bounds],
                    [B.keys, scratch.keys],
                    [B.values, scratch.values],
                ]),
                lbvh: kernel('lbvh', rayLbvh, 'ray_lbvh_main', [
                    [B.keysRead, scratch.keys],
                    [B.bvhOut, bvh!],
                    [B.parents, scratch.parents],
                ]),
                leaves: kernel('leaves', rayLbvh, 'ray_lbvh_leaves_main', [
                    [B.valuesRead, scratch.values],
                    [B.bvhOut, bvh!],
                    [B.parents, scratch.parents],
                ]),
                clear: kernel('counters_clear', rayRefit, 'ray_counters_clear_main', [
                    [B.counters, scratch.counters],
                ]),
                leavesTriangles: kernel('leaves_triangles', rayRefit, 'ray_leaves_triangles_main', [
                    [raySceneResources.geometry, geometry!],
                    [B.bvhOut, bvh!],
                ]),
                leavesAabbs: kernel('leaves_aabbs', rayRefit, 'ray_leaves_aabbs_main', [
                    [B.aabbsRead, scratch.aabbs],
                    [B.bvhOut, bvh!],
                ]),
                reorderGather: kernel('reorder_gather', rayReorder, 'ray_reorder_gather_main', [
                    [B.valuesRead, scratch.values],
                    [B.geometryOut, geometry!],
                    [B.tris, scratch.tris],
                ]),
                reorderStore: kernel('reorder_store', rayReorder, 'ray_reorder_store_main', [
                    [B.geometryOut, geometry!],
                    [B.tris, scratch.tris],
                ]),
                climb: kernel('climb', rayRefit, 'ray_climb_main', [
                    [B.bvhOut, bvh!],
                    [B.parentsRead, scratch.parents],
                    [B.counters, scratch.counters],
                    [B.boxes, scratch.boxes],
                ]),
                instances: kernel('instances', rayInstances, 'ray_instances_main', [
                    [B.instanceSources, scratch.sources],
                    [worldsResource, worlds ?? scratch.sources],
                    [renderablesResource, renderables ?? scratch.sources],
                    [standardMaterialsResource, materials ?? scratch.sources],
                    [B.bvhOut, bvh!],
                    [B.aabbs, scratch.aabbs],
                    [B.bounds, scratch.bounds],
                ]),
            };
        }
        for (const b of this.order) this.ensureGather(b, build, geometry!);
    }

    /** Kernels de cópia da geometria (refeitos quando os buffers dela mudam). */
    private ensureGather(b: Blas, build: BindingSource, geometry: StorageBufferSpec): void {
        const src = this.sourcesOf(b.geometry);
        if (src === undefined) return;
        const same =
            b.sources?.vertices === src.vertices
            && b.sources.indices === src.indices
            && b.sources.indirect === src.indirect;
        if (same && b.gatherVertices !== undefined) return;
        if (!same) b.built = false;
        this.releaseGather(b);
        b.sources = src;
        const asSource = (buf: AnyBufferSpec): BindingSource =>
            buf as Exclude<AnyBufferSpec, StagingBufferSpec>;
        b.gatherVertices = createComputeKernel(this.core, {
            discriminator: `ray_scene:gather_vertices:${b.key}`,
            shader: rayGather,
            entryPoint: 'ray_gather_vertices_main',
            bindings: new Map<WgslResource, BindingSource>([
                [B.build, build],
                [B.srcVertices, asSource(src.vertices)],
                [B.geometryOut, geometry],
            ]),
        });
        const entry = b.indirect
            ? 'ray_gather_triangles_indirect_main'
            : b.u16
              ? 'ray_gather_triangles_u16_main'
              : 'ray_gather_triangles_u32_main';
        b.gatherTriangles = createComputeKernel(this.core, {
            discriminator: `ray_scene:gather_triangles:${b.key}`,
            shader: rayGather,
            entryPoint: entry,
            bindings: new Map<WgslResource, BindingSource>([
                [B.build, build],
                [B.srcIndices, asSource(src.indices)],
                ...(b.indirect && src.indirect !== undefined
                    ? ([[B.srcIndirect, asSource(src.indirect)]] as [WgslResource, BindingSource][])
                    : []),
                [B.geometryOut, geometry],
            ]),
        });
    }

    /** Buffers alocados da geometria (vértices, índices e o registro indireto, quando há). */
    private sourcesOf(geometry: Geometry): SourceBuffers | undefined {
        const vertices = this.resources.bufferOf(geometry, 'vertices');
        const indices = this.resources.bufferOf(geometry, 'indices');
        if (vertices === undefined || indices === undefined) return undefined;
        if (vertices.subkind === 'staging' || indices.subkind === 'staging') return undefined;
        const indirect = this.resources.bufferOf(geometry, 'indirect');
        return { vertices, indices, indirect };
    }

    /** Uma região por hierarquia de baixo (faixas) e a da hierarquia de cima, escritas a cada quadro. */
    private writeParams(scene: RayScene): void {
        const info = scene.data;
        this.order.forEach((b, region) => {
            this.params.write(region, {
                count: b.count,
                slot: region,
                nodeFirst: info.nodeFirst,
                nodeBase: b.nodeBase,
                primFirst: info.triangleFirst,
                primBase: b.primBase,
                vertexFirst: info.vertexFirst,
                vertexBase: b.vertexBase,
                vertexCount: b.vertexCount,
                kind: KIND_TRIANGLES,
                keyShift: 0,
                leaves: b.leaves,
                leafSize: LEAF_SIZE,
            });
        });
        this.params.write(this.order.length, {
            count: this.instances.length,
            slot: this.order.length,
            nodeFirst: info.nodeFirst,
            nodeBase: info.tlasRoot,
            primFirst: info.instanceFirst,
            primBase: 0,
            // Instâncias: o início da faixa de hierarquias de baixo (o registro da hierarquia de cada instância).
            first: info.blasFirst,
            keyShift: 30 - TLAS_KEY_BITS,
            kind: KIND_INSTANCES,
            leaves: this.instances.length,
            leafSize: 1,
        });
        this.params.flush(this.order.length + 1);
    }

    private releaseGather(b: Blas): void {
        if (b.gatherVertices !== undefined) destroyComputeKernel(this.core, b.gatherVertices);
        if (b.gatherTriangles !== undefined) destroyComputeKernel(this.core, b.gatherTriangles);
        b.gatherVertices = undefined;
        b.gatherTriangles = undefined;
        b.sources = undefined;
    }

    private releaseShared(): void {
        const s = this.shared;
        if (s === undefined) return;
        for (const k of [
            s.bounds,
            s.morton,
            s.lbvh,
            s.leaves,
            s.clear,
            s.leavesTriangles,
            s.leavesAabbs,
            s.climb,
            s.reorderGather,
            s.reorderStore,
            s.instances,
        ])
            destroyComputeKernel(this.core, k);
        this.shared = undefined;
    }

    private releaseScratch(): void {
        const s = this.scratch;
        if (s === undefined) return;
        for (const b of [
            s.aabbs,
            s.bounds,
            s.keys,
            s.values,
            s.parents,
            s.counters,
            s.boxes,
            s.tris,
            s.sources,
        ])
            this.core.destroy(b);
        this.scratch = undefined;
    }
}
