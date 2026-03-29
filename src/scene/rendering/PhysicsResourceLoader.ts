import type { Entity }              from '../core/Entity';
import type { PhysicsResource }     from '../core/physics/PhysicsResource';
import type { GpuPipelineEventBus } from '../systems/gpu/GpuPipelineEventBus';
import type { ResourceManager }     from '../../core/interfaces/ResourceManager';
import type { GpuSimContext }       from '../systems/GpuSimContext';
import { ResourceState }            from '../core/ResourceState';
import { PhysicsDirtyFlag }         from '../core/physics/PhysicsDirtyFlag';
import { Loggable }                 from '../../core/debug/Loggable';
import { Logger }                   from '../../core/debug/Logger';
import { SceneLoader }              from './SceneLoader';
import { RigidBody }                from '../../elements/physics/RigidBody';
import { packRigidBody }            from '../../elements/physics/rigidbody/RigidBodyLayout';
import type { RigidBodyShapeInfo }  from '../../elements/physics/rigidbody/RigidBodyLayout';
import { RB_STRIDE_BYTES, RB_STRIDE_FLOATS } from '../../elements/physics/rigidbody/RigidBodyLayout';
import { RB_CONTACT_STRIDE_BYTES }  from '../../elements/physics/rigidbody/RBContactLayout';
import { RB_SIM_PARAMS_BYTE_SIZE }  from '../../elements/physics/rigidbody/SimParamsLayout';
import { RIGID_BODY_GLOBAL_BUFFER_SET } from '../../elements/physics/rigidbody/RigidBodyGlobalBufferSet';
import { SoftBody }                 from '../../elements/physics/SoftBody';
import { graphColorConstraints }    from '../../elements/physics/gpu/GraphColorSolver';
import { PARTICLE_STRIDE_BYTES as PARTICLE_STRIDE,
         PARTICLE_STRIDE_FLOATS,
         P_POS_X, P_POS_Y, P_POS_Z, P_INV_MASS,
         P_PRED_X, P_PRED_Y, P_PRED_Z,
         P_VEL_X, P_VEL_Y, P_VEL_Z } from '../../elements/physics/softbody/ParticleLayout';
import { CONSTRAINT_STRIDE_BYTES as CONSTRAINT_STRIDE,
         CONSTRAINT_STRIDE_WORDS,
         C_IDX_A, C_IDX_B, C_REST_LENGTH, C_COMPLIANCE } from '../../elements/physics/softbody/ConstraintLayout';

// Tamanhos em bytes de buffers auxiliares de SoftBody (sem struct WGSL espelhado)
const SIM_PARAMS_SIZE     = 48;
const COLOR_RANGE_SIZE    = 16;
const LAMBDA_STRIDE       = 4;
const JACOBI_ACCUM_STRIDE = 16;
const REST_POS_STRIDE     = 16;
const GOAL_POS_STRIDE     = 16;
const SHAPE_STATE_SIZE    = 16;

function isPhysicsResource(value: unknown): value is PhysicsResource {
    return typeof value === 'object' && value !== null &&
           'state' in value && 'physicType' in value && 'dirtyFlags' in value;
}

/**
 * Loader de ciclo de vida para componentes PhysicsResource.
 *
 * Responsabilidades:
 * - Uninitialized → registra no mundo físico + aloca buffers GPU por-instância (SoftBody)
 * - Dirty → atualização parcial via updateInWorld
 * - Disposed → desaloca buffers GPU + remove do mundo
 * - Emite eventos coalesced no GpuPipelineEventBus ao final de cada ciclo
 * - Quando há mudança estrutural de corpos rígidos e um ResourceManager foi injetado,
 *   realoca o buffer global de RigidBody diretamente (sem lag de 1 frame)
 *
 * Camada 2 — sem dependência de WebGPU direto (usa interfaces de ResourceManager).
 * Chamado no início de GpuPhysicsOrchestrator.step() antes do framePipeline.
 *
 * @typeParam TWorld — deve expor `getContext()` para acesso ao conjunto de corpos.
 */
@Loggable('PhysicsResourceLoader')
export class PhysicsResourceLoader<TWorld extends { getContext(): Readonly<GpuSimContext> }>
    extends SceneLoader<TWorld> {

    declare private readonly log: Logger;

    private readonly eventBus: GpuPipelineEventBus;

    /** Injetado via `setResourceManager` — usado para alocar buffers GPU. */
    private _resourceManager?: ResourceManager;

    /**
     * Sinaliza que uma alocação inicial é necessária no próximo `load()`.
     * Setado em `setResourceManager` para garantir que o buffer global de RigidBody
     * seja criado mesmo quando todos os corpos já estão em `Ready`.
     */
    private _needsInitialAllocation = false;

    // Contadores de coalescing por ciclo de load
    private _uninitializedCount = 0;
    private _disposedCount      = 0;
    private _dirtyColliderFlags = 0; // OR acumulado de flags relevantes a collider
    private _dirtyBodyFlags     = 0; // OR acumulado de flags relevantes a body

    constructor(eventBus: GpuPipelineEventBus) {
        super();
        this.eventBus = eventBus;
    }

    /**
     * Injeta o ResourceManager para permitir a alocação de buffers GPU.
     * Chamado por GpuPhysicsOrchestrator.initializeResources() após a inicialização GPU.
     */
    public setResourceManager(rm: ResourceManager): void {
        this._resourceManager = rm;
        this._needsInitialAllocation = true;
    }

    /**
     * Sobrescreve load() para inicializar contadores, percorrer a cena e
     * emitir eventos coalesced (e realocar o buffer global se necessário) ao final do ciclo.
     */
    public override load(scene: { traverse: (cb: (entity: Entity) => void) => void }, world: TWorld): void {
        // Reinicia contadores
        this._uninitializedCount = 0;
        this._disposedCount      = 0;
        this._dirtyColliderFlags = 0;
        this._dirtyBodyFlags     = 0;

        scene.traverse((entity: Entity) => {
            if (!entity.visible) return;
            for (const resource of this.getResources(entity)) {
                this.process(resource, world);
            }
        });

        this._emitCoalescedEvents(world);
    }

    /**
     * Retorna os componentes físicos da entidade que implementam PhysicsResource.
     */
    protected override getResources(entity: Entity): Iterable<unknown> {
        const result: unknown[] = [];
        for (const physic of entity.getPhysics()) {
            if (isPhysicsResource(physic)) result.push(physic);
        }
        return result;
    }

    /**
     * Processa um PhysicsResource individual — switch por state.
     */
    protected override process(resource: unknown, world: TWorld): void {
        if (!isPhysicsResource(resource)) return;

        switch (resource.state) {
            case ResourceState.Uninitialized: {
                resource.registerInWorld?.(world);
                if (resource instanceof SoftBody && this._resourceManager) {
                    this._allocateSoftBodyBuffers(resource, this._resourceManager);
                }
                resource.state      = ResourceState.Ready;
                resource.dirtyFlags = PhysicsDirtyFlag.None;
                this._uninitializedCount++;
                break;
            }
            case ResourceState.Dirty: {
                const flags = resource.dirtyFlags;
                resource.updateInWorld?.(world);
                resource.dirtyFlags = PhysicsDirtyFlag.None;
                resource.state      = ResourceState.Ready;

                // Acumula flags para coalescing — collider: Shape | Material
                if (flags & (PhysicsDirtyFlag.Shape | PhysicsDirtyFlag.Material)) {
                    this._dirtyColliderFlags |= flags;
                }
                // Acumula flags para coalescing — body: Mass | Transform
                if (flags & (PhysicsDirtyFlag.Mass | PhysicsDirtyFlag.Transform)) {
                    this._dirtyBodyFlags |= flags;
                }
                break;
            }
            case ResourceState.Disposed: {
                if (resource instanceof SoftBody && this._resourceManager) {
                    this._disposeSoftBodyBuffers(resource, this._resourceManager);
                }
                resource.unregisterFromWorld?.(world);
                resource.state      = ResourceState.Destroyed;
                resource.dirtyFlags = PhysicsDirtyFlag.None;
                this._disposedCount++;
                break;
            }
            default:
                // Ready, Loading, Destroyed, GpuManaged — nenhuma ação
                break;
        }
    }

    // ------------------------------------------------------------------
    // Privado — emissão de eventos coalesced e alocação do batch global
    // ------------------------------------------------------------------

    private _emitCoalescedEvents(world: TWorld): void {
        const structuralChange = this._uninitializedCount > 0 || this._disposedCount > 0;

        // Realoca o buffer global de RigidBody se: mudança estrutural OU primeira alocação
        if ((structuralChange || this._needsInitialAllocation) && this._resourceManager) {
            this._needsInitialAllocation = false;
            this._allocateRigidBodyBatch(world, this._resourceManager);
        }

        if (structuralChange) {
            const changedCount = this._uninitializedCount + this._disposedCount;
            this.eventBus.emit('physics:bodies:changed',    { changedCount });
            this.eventBus.emit('physics:colliders:changed', { changedCount });
            return; // mudança estrutural já abrange tudo
        }

        if (this._dirtyColliderFlags !== 0) {
            this.eventBus.emit('physics:colliders:changed', { changedCount: 1 });
        }
        if (this._dirtyBodyFlags !== 0) {
            this.eventBus.emit('physics:bodies:changed', { changedCount: 1 });
        }
    }

    // ------------------------------------------------------------------
    // Privado — alocação/desalocação de buffers SoftBody (por instância)
    // ------------------------------------------------------------------

    private _allocateSoftBodyBuffers(body: SoftBody, rm: ResourceManager): void {
        const buffers  = rm.buffers;
        const uuid     = body.uuid;
        const pCount   = body.particles.length;
        const cCount   = body.constraints.length;
        const mass     = body.get<number>('mass') ?? 1.0;
        const invMassF = pCount > 0 ? pCount / mass : 0.0;

        // ── Particles ──────────────────────────────────────────────────────
        const particlesId = `gpu_particles_${uuid}`;
        buffers.createStorageBuffer(particlesId, Math.max(pCount, 1) * PARTICLE_STRIDE);
        if (pCount > 0) {
            const data = new Float32Array(pCount * PARTICLE_STRIDE_FLOATS);
            for (let i = 0; i < pCount; i++) {
                const p = body.particles[i]!;
                const b = i * PARTICLE_STRIDE_FLOATS;
                data[b + P_POS_X]    = p.x;  data[b + P_POS_Y]  = p.y;  data[b + P_POS_Z]  = p.z;
                data[b + P_INV_MASS] = p.w > 0 ? invMassF : 0.0;
                data[b + P_PRED_X]   = p.px; data[b + P_PRED_Y] = p.py; data[b + P_PRED_Z] = p.pz;
                data[b + P_VEL_X]    = p.vx; data[b + P_VEL_Y]  = p.vy; data[b + P_VEL_Z]  = p.vz;
            }
            buffers.writeBuffer(particlesId, data);
        }

        // ── Constraints + Graph Coloring ───────────────────────────────────
        const constraintsId = `gpu_constraints_${uuid}`;
        const colorRangeIds: string[] = [];
        const colorCounts:   number[] = [];
        buffers.createStorageBuffer(constraintsId, Math.max(cCount, 1) * CONSTRAINT_STRIDE);
        if (cCount > 0) {
            const { sortedConstraints, colorRanges } = graphColorConstraints(body.constraints, pCount);
            const raw = new ArrayBuffer(cCount * CONSTRAINT_STRIDE);
            const f32 = new Float32Array(raw);
            const u32 = new Uint32Array(raw);
            for (let k = 0; k < cCount; k++) {
                const c    = sortedConstraints[k]!;
                const base = k * CONSTRAINT_STRIDE_WORDS;
                u32[base + C_IDX_A]       = c.i;
                u32[base + C_IDX_B]       = c.j;
                f32[base + C_REST_LENGTH] = c.restLength;
                f32[base + C_COMPLIANCE]  = c.compliance;
            }
            buffers.writeBuffer(constraintsId, f32);
            const crBuf = new Uint32Array(4);
            for (let c = 0; c < colorRanges.length; c++) {
                const rangeId = `gpu_color_range_${uuid}_${c}`;
                buffers.createUniformBuffer(rangeId, COLOR_RANGE_SIZE);
                crBuf[0] = colorRanges[c]!.offset; crBuf[1] = colorRanges[c]!.count;
                crBuf[2] = 0; crBuf[3] = 0;
                buffers.writeBuffer(rangeId, crBuf);
                colorRangeIds.push(rangeId);
                colorCounts.push(colorRanges[c]!.count);
            }
        }

        // ── SimParams + Lambda + Jacobi ────────────────────────────────────
        const simParamsId   = `gpu_simparams_${uuid}`;
        const lambdaBufId   = `gpu_lambda_${uuid}`;
        const lambdaWarmId  = `gpu_lambda_warm_${uuid}`;
        const jacobiAccumId = `gpu_jacobi_accum_${uuid}`;
        buffers.createUniformBuffer(simParamsId,  SIM_PARAMS_SIZE);
        buffers.createStorageBuffer(lambdaBufId,   Math.max(cCount, 1) * LAMBDA_STRIDE);
        buffers.createStorageBuffer(lambdaWarmId,  Math.max(cCount, 1) * LAMBDA_STRIDE);
        buffers.createStorageBuffer(jacobiAccumId, Math.max(pCount, 1) * JACOBI_ACCUM_STRIDE);

        body.bufferSet = {
            particlesId, constraintsId, simParamsId,
            lambdaBufId, lambdaWarmId, jacobiAccumId,
            colorRangeIds, colorCounts,
        };

        if (body.get<boolean>('useShapeMatching')) {
            this._allocateSoftBodyShapeMatchingBuffers(body, rm, uuid, pCount);
        }

        this.log.debug(`SoftBody buffers alocados — particles:${pCount} constraints:${cCount} (uuid=${uuid})`);
    }

    private _allocateSoftBodyShapeMatchingBuffers(
        body:   SoftBody,
        rm:     ResourceManager,
        uuid:   string,
        pCount: number,
    ): void {
        const buffers = rm.buffers;
        let cmx = 0, cmy = 0, cmz = 0, freeCount = 0;
        for (const p of body.particles) {
            if (p.w > 0) { cmx += p.x; cmy += p.y; cmz += p.z; freeCount++; }
        }
        if (freeCount > 0) { cmx /= freeCount; cmy /= freeCount; cmz /= freeCount; }

        const restData = new Float32Array(Math.max(pCount, 1) * 4);
        for (let i = 0; i < pCount; i++) {
            const p = body.particles[i]!;
            restData[i * 4]     = p.x - cmx;
            restData[i * 4 + 1] = p.y - cmy;
            restData[i * 4 + 2] = p.z - cmz;
            restData[i * 4 + 3] = p.w > 0 ? 1.0 : 0.0;
        }
        const restPosId    = `gpu_rest_pos_${uuid}`;
        const goalPosId    = `gpu_goal_pos_${uuid}`;
        const shapeStateId = `gpu_shape_state_${uuid}`;
        buffers.createStorageBuffer(restPosId,    Math.max(pCount, 1) * REST_POS_STRIDE);
        buffers.createStorageBuffer(goalPosId,    Math.max(pCount, 1) * GOAL_POS_STRIDE);
        buffers.createStorageBuffer(shapeStateId, SHAPE_STATE_SIZE);
        if (pCount > 0) buffers.writeBuffer(restPosId, restData);
        buffers.writeBuffer(shapeStateId, new Float32Array([0, 0, 0, 1]));
        body.bufferSet!.restPosId    = restPosId;
        body.bufferSet!.goalPosId    = goalPosId;
        body.bufferSet!.shapeStateId = shapeStateId;
    }

    private _disposeSoftBodyBuffers(body: SoftBody, rm: ResourceManager): void {
        if (!body.bufferSet) return;
        const buffers = rm.buffers;
        const s = body.bufferSet;
        buffers.destroyBuffer(s.particlesId);
        buffers.destroyBuffer(s.constraintsId);
        buffers.destroyBuffer(s.simParamsId);
        buffers.destroyBuffer(s.lambdaBufId);
        buffers.destroyBuffer(s.lambdaWarmId);
        buffers.destroyBuffer(s.jacobiAccumId);
        for (const id of s.colorRangeIds) buffers.destroyBuffer(id);
        if (s.restPosId)    buffers.destroyBuffer(s.restPosId);
        if (s.goalPosId)    buffers.destroyBuffer(s.goalPosId);
        if (s.shapeStateId) buffers.destroyBuffer(s.shapeStateId);
        delete body.bufferSet;
        body.particles   = [];
        body.constraints = [];
    }

    // ------------------------------------------------------------------
    // Privado — alocação do batch global de RigidBody
    // ------------------------------------------------------------------

    /**
     * Aloca (ou realoca) o buffer global que agrega todos os RigidBodies ativos.
     * Em ECS: o Sistema que detém o conjunto deve ser o responsável pela alocação
     * do buffer agregado.
     */
    private _allocateRigidBodyBatch(world: TWorld, rm: ResourceManager): void {
        const ctx = world.getContext();

        const rigidBodies = [...ctx.bodies.values()]
            .filter(e => e.body.physicType === 'RigidBody' && e.body.currentState.canParticipateInGpuBatch())
            .map(e => e.body as unknown as RigidBody);

        const buffers      = rm.buffers;
        const n            = rigidBodies.length;
        const rbCount      = Math.max(n, 1);
        const colliderCount = ctx.colliders.size;
        const contactSlots  = Math.max(n * Math.max(colliderCount, 1), 1);
        const set           = RIGID_BODY_GLOBAL_BUFFER_SET;

        if (buffers.getBuffer(set.bodiesId))   buffers.destroyBuffer(set.bodiesId);
        if (buffers.getBuffer(set.contactsId)) buffers.destroyBuffer(set.contactsId);
        if (buffers.getBuffer(set.toUboMapId)) buffers.destroyBuffer(set.toUboMapId);
        if (!buffers.getBuffer(set.simParamsId)) {
            buffers.createUniformBuffer(set.simParamsId, RB_SIM_PARAMS_BYTE_SIZE);
        }

        buffers.createStorageBuffer(set.bodiesId,   rbCount      * RB_STRIDE_BYTES);
        buffers.createStorageBuffer(set.contactsId, contactSlots * RB_CONTACT_STRIDE_BYTES);
        buffers.createStorageBuffer(set.toUboMapId, rbCount      * 4);

        if (n > 0) {
            // Monta mapa body → shape primário a partir dos colliders registrados
            const bodyShapeMap = new Map<RigidBody, RigidBodyShapeInfo>();
            for (const { entity, collider } of ctx.colliders.values()) {
                const entry = ctx.entityBodies.get(entity.id);
                if (!entry) continue;
                const rb = entry.body as unknown as RigidBody;
                if (bodyShapeMap.has(rb)) continue;
                const desc = collider.packDescriptor();
                bodyShapeMap.set(rb, { shapeType: desc.shapeType, he: [desc.half[0], desc.half[1], desc.half[2]] });
            }

            const f32 = new Float32Array(n * RB_STRIDE_FLOATS);
            for (let i = 0; i < n; i++) {
                const body = rigidBodies[i]!;
                packRigidBody(body, f32, i * RB_STRIDE_FLOATS, bodyShapeMap.get(body));
                body.gpuRbIndex = i;
            }
            buffers.writeBuffer(set.bodiesId, f32);
        }

        this.eventBus.emit('physics:rb:reallocated', { bodyCount: n, colliderCount });
        this.log.debug(`RigidBody batch realocado — bodies:${n} colliders:${colliderCount}`);
    }
}
