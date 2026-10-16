import { WORKGROUP_SIZE as ENGINE_WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import type {
    AnyBufferSpec,
    EngineCore,
    Frame,
    StagingBufferSpec,
    StorageBufferSpec,
} from '../../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../../scene/contracts/ResourceDirectory';
import {
    createComputeKernel,
    destroyComputeKernel,
    type ComputeKernel,
} from '../../../scene/flows/createComputeKernel';
import { Flow } from '../../../scene/flows/Flow';
import type { BoundFlow, TransitionContext } from '../../../scene/flows/FlowBinding';
import type { FlowContext } from '../../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../../scene/flows/FlowTransitions';
import { slot, type EntitiesSlot, type SlotMap } from '../../../scene/flows/slots';
import type { EntityId } from '../../../scene/world/EntityId';
import { PerStepUniforms } from '../../gpu/compute/PerStepUniforms';
import { SurfaceGeometry } from '../../geometry/SurfaceGeometry';
import { SoftBody } from '../bodies/SoftBody';
import { SoftSurfaceParamsSchema } from '../schemas/softSurface';
import { softFaceNormals, softVertexWrite } from '../shaders/softSurface';

const WORKGROUP_SIZE = ENGINE_WORKGROUP_SIZE.value;

/** Slots do estágio de superfície de corpos moles. */
export interface SoftSurfaceSlots extends SlotMap {
    /** Corpos moles com superfície; o estágio é o escritor dos vértices dela. */
    readonly surfaces: EntitiesSlot;
}

const slots: SoftSurfaceSlots = {
    surfaces: slot.entities({
        all: [SoftBody, SurfaceGeometry],
        owns: [[SurfaceGeometry, 'vertices']],
    }),
};

type Ctx = TransitionContext<SoftSurfaceSlots>;

/** Superfície de um corpo: as normais de face (buffer do estágio) e os dois kernels ligados aos buffers dela. */
interface Surface {
    readonly entity: EntityId;
    readonly body: SoftBody;
    readonly geometry: SurfaceGeometry;
    readonly faces: StorageBufferSpec;
    /** Pool de partículas ligado aos kernels (recriados quando o pool cresce). */
    particles: StorageBufferSpec;
    normals: ComputeKernel;
    vertices: ComputeKernel;
}

/**
 * SoftSurfaceFlow — vértices da superfície dos corpos moles na GPU (spec 008, research R5): a cada quadro, por corpo,
 * `soft_face_normals` (normal de cada triângulo a partir das posições da faixa do corpo no pool de partículas) e
 * `soft_vertex_write` (posição e normal média das faces adjacentes no vertex buffer da `SurfaceGeometry`). A geometria
 * é desenhada pelo forward e pela sombra como qualquer outra; a CPU não envia vértices depois da inserção.
 *
 * Fase `transform` (depois da física, antes da sombra e do forward). O estágio declara a posse dos vértices (`owns`). Os
 * kernels são criados quando o corpo entra e recriados quando o pool de partículas cresce (detectado em
 * `framePrepare`); os parâmetros (uma região por corpo, offset dinâmico) são escritos quando os corpos mudam.
 */
export class SoftSurfaceFlow extends Flow<SoftSurfaceSlots, 'idle'> {
    readonly type = 'SoftSurfaceFlow';
    readonly slots = slots;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly core: EngineCore;
    private readonly resources: ResourceDirectory;
    private readonly params: PerStepUniforms;
    private readonly surfaces = new Map<EntityId, Surface>();
    private order: Surface[] = [];
    private paramsDirty = false;

    constructor(ctx: FlowContext) {
        super();
        this.core = ctx.core;
        this.resources = ctx.resources;
        this.params = new PerStepUniforms(ctx.core, {
            discriminator: 'soft_surface_params',
            schema: SoftSurfaceParamsSchema,
        });
        this.params.reserve(1);
        this.transitions = {
            '*': {
                slotsResolved: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.track(
                            c.bound.slots.surfaces.entries.map((e) => e.entityId),
                            [],
                            c,
                        );
                    },
                },
                entitiesChanged: {
                    to: 'idle',
                    run: (e, c) => {
                        if (e.type === 'entitiesChanged') this.track(e.added, e.removed, c);
                    },
                },
                slotLost: 'ignore',
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
                poolReallocated: 'ignore',
                framePrepare: {
                    to: 'idle',
                    run: () => {
                        this.refreshPools();
                        this.writeParams();
                    },
                },
            },
        };
    }

    /** Grava, por corpo, as normais de face e depois os vértices. */
    dispatch(frame: Frame, _bound: BoundFlow<SoftSurfaceSlots>): void {
        this.order.forEach((surface, region) => {
            const offset = [this.params.offset(region)];
            frame.compute('SoftSurfaceFlow.face_normals', (pass) => {
                pass.bind
                    .setPipeline(surface.normals.pipeline)
                    .setBindGroup(0, surface.normals.bindGroups[0]!, offset);
                pass.dispatch.invocations(surface.geometry.triangleCount, WORKGROUP_SIZE);
            });
            frame.compute('SoftSurfaceFlow.vertex_write', (pass) => {
                pass.bind
                    .setPipeline(surface.vertices.pipeline)
                    .setBindGroup(0, surface.vertices.bindGroups[0]!, offset);
                pass.dispatch.invocations(surface.geometry.vertexCount, WORKGROUP_SIZE);
            });
        });
    }

    /** Libera kernels, normais de face e parâmetros. */
    override dispose(): void {
        for (const surface of this.surfaces.values()) this.release(surface);
        this.surfaces.clear();
        this.params.dispose();
    }

    /** Corpos que entraram (normais de face e kernels criados) e saíram (liberados). */
    private track(added: readonly EntityId[], removed: readonly EntityId[], ctx: Ctx): void {
        for (const id of removed) {
            const surface = this.surfaces.get(id);
            if (surface === undefined) continue;
            this.release(surface);
            this.surfaces.delete(id);
        }
        for (const id of added) {
            const entry = ctx.bound.slots.surfaces.entry(id);
            if (entry === undefined || this.surfaces.has(id)) continue;
            const body = entry.get(SoftBody);
            const geometry = entry.get(SurfaceGeometry);
            const particles = this.poolOf(body);
            if (particles === undefined) continue;
            const faces = this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `soft_surface_faces:${id}`,
                byteSize: geometry.triangleCount * 16,
            });
            this.surfaces.set(id, {
                entity: id,
                body,
                geometry,
                faces,
                particles,
                ...this.kernels(id, geometry, faces, particles),
            });
        }
        // Os kernels ligam a região de parâmetros: com mais corpos o buffer pode crescer, e todos são religados.
        if (this.params.reserve(Math.max(1, this.surfaces.size))) {
            for (const surface of this.surfaces.values()) this.rebuild(surface);
        }
        this.paramsDirty = true;
    }

    /** Kernels do corpo: normais de face e escrita de vértices, ligados aos buffers dele. */
    private kernels(
        id: EntityId,
        geometry: SurfaceGeometry,
        faces: StorageBufferSpec,
        particles: StorageBufferSpec,
    ): Pick<Surface, 'normals' | 'vertices'> {
        const surface = this.params.source();
        return {
            normals: createComputeKernel(this.core, {
                discriminator: `soft_surface_normals:${id}`,
                shader: softFaceNormals,
                entryPoint: 'soft_face_normals_main',
                bindings: {
                    surface,
                    particles,
                    indices: this.geometryBuffer(geometry, 'indices'),
                    face_normals: faces,
                },
            }),
            vertices: createComputeKernel(this.core, {
                discriminator: `soft_surface_vertices:${id}`,
                shader: softVertexWrite,
                entryPoint: 'soft_vertex_write_main',
                bindings: {
                    surface,
                    particles,
                    adjacency: this.geometryBuffer(geometry, 'adjacency'),
                    face_normals: faces,
                    vertices: this.geometryBuffer(geometry, 'vertices'),
                },
            }),
        };
    }

    /** Recria os kernels do corpo (pool de partículas ou parâmetros recriados). */
    private rebuild(surface: Surface): void {
        destroyComputeKernel(this.core, surface.normals);
        destroyComputeKernel(this.core, surface.vertices);
        Object.assign(
            surface,
            this.kernels(surface.entity, surface.geometry, surface.faces, surface.particles),
        );
    }

    /** Recria os kernels dos corpos cujo pool de partículas cresceu (buffer recriado pela C2). */
    private refreshPools(): void {
        for (const surface of this.surfaces.values()) {
            const particles = this.poolOf(surface.body);
            if (particles === undefined || particles === surface.particles) continue;
            surface.particles = particles;
            this.rebuild(surface);
            this.paramsDirty = true;
        }
    }

    /** Uma região por corpo: início da faixa, layout do registro e tamanho da malha — escritas quando os corpos mudam. */
    private writeParams(): void {
        if (!this.paramsDirty) return;
        this.paramsDirty = false;
        this.order = [...this.surfaces.values()];
        this.order.forEach((surface, region) => {
            const schema = surface.body.particleSchema;
            const poolKey = this.resources.poolKeyForResource(surface.body)!;
            const range = this.resources.poolRangeOf(poolKey, surface.entity);
            this.params.write(region, {
                first: range?.first ?? 0,
                strideVec4: schema.stride / 16,
                posOffsetVec4: schema.offsetOf('pos') / 16,
                vertexCount: surface.geometry.vertexCount,
                triangleCount: surface.geometry.triangleCount,
            });
        });
        this.params.flush(this.order.length);
    }

    /** Buffer alocado pela C2 para o descritor da geometria. */
    private geometryBuffer(
        geometry: SurfaceGeometry,
        descId: string,
    ): Exclude<AnyBufferSpec, StagingBufferSpec> {
        const buffer = this.resources.bufferOf(geometry, descId);
        if (buffer === undefined || buffer.subkind === 'staging') {
            throw new Error(`SoftSurfaceFlow: a superfície não tem o buffer '${descId}' alocado.`);
        }
        return buffer;
    }

    /** Buffer do pool de partículas do corpo. */
    private poolOf(body: SoftBody): StorageBufferSpec | undefined {
        const poolKey = this.resources.poolKeyForResource(body);
        return poolKey === undefined ? undefined : this.resources.poolBufferSpec(poolKey);
    }

    private release(surface: Surface): void {
        destroyComputeKernel(this.core, surface.normals);
        destroyComputeKernel(this.core, surface.vertices);
        this.core.destroy(surface.faces);
    }
}
