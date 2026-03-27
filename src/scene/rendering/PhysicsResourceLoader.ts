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
import { PARTICLE_STRIDE_FLOATS }   from '../../elements/physics/softbody/ParticleLayout';
import { CONSTRAINT_STRIDE_BYTES }  from '../../elements/physics/softbody/ConstraintLayout';
import {
    buildSoftBodyBufferSet,
    buildColorRangeId,
    buildRestPosId,
    buildGoalPosId,
    buildShapeStateId,
    softBodyBufferSizes,
    SB_SIM_PARAMS_SIZE,
    SB_COLOR_RANGE_SIZE,
    SB_SHAPE_STATE_SIZE,
    packSoftBodyParticles,
    packSoftBodyConstraints,
    packColorRange,
    packRestPositions,
} from '../../elements/physics/softbody/SoftBodyBufferLayout';
import { GpuBufferRegistry }        from '../systems/gpu/GpuBufferRegistry';

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

    private readonly eventBus:  GpuPipelineEventBus;
    private readonly _registry: GpuBufferRegistry;

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
        this.eventBus  = eventBus;
        this._registry = new GpuBufferRegistry();
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
     * Livro de registros de buffers GPU alocados por este loader.
     * Útil para debugging, profiling e acesso a entradas por proprietário.
     */
    public get bufferRegistry(): GpuBufferRegistry {
        return this._registry;
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
        const pCount   = body.particles.length;
        const cCount   = body.constraints.length;
        const mass     = body.get<number>('mass') ?? 1.0;
        const invMassF = pCount > 0 ? pCount / mass : 0.0;
        const uuid     = body.uuid;

        const bufferSet = buildSoftBodyBufferSet(uuid);
        const sizes     = softBodyBufferSizes(pCount, cCount);
        const buffers   = rm.buffers;

        // ── Fase 1: Alocação (reserva espaço, sem dados) ─────────────────────
        buffers.createStorageBuffer(bufferSet.particlesId,   sizes.particlesBytes);
        buffers.createStorageBuffer(bufferSet.constraintsId, sizes.constraintsBytes);
        buffers.createUniformBuffer(bufferSet.simParamsId,   SB_SIM_PARAMS_SIZE);
        buffers.createStorageBuffer(bufferSet.lambdaBufId,   sizes.lambdaBytes);
        buffers.createStorageBuffer(bufferSet.lambdaWarmId,  sizes.lambdaWarmBytes);
        buffers.createStorageBuffer(bufferSet.jacobiAccumId, sizes.jacobiAccumBytes);

        this._registry.register({ id: bufferSet.particlesId,   type: 'storage', byteSize: sizes.particlesBytes,   domain: 'softbody', ownerUuid: uuid });
        this._registry.register({ id: bufferSet.constraintsId, type: 'storage', byteSize: sizes.constraintsBytes, domain: 'softbody', ownerUuid: uuid });
        this._registry.register({ id: bufferSet.simParamsId,   type: 'uniform', byteSize: SB_SIM_PARAMS_SIZE,     domain: 'softbody', ownerUuid: uuid });
        this._registry.register({ id: bufferSet.lambdaBufId,   type: 'storage', byteSize: sizes.lambdaBytes,      domain: 'softbody', ownerUuid: uuid });
        this._registry.register({ id: bufferSet.lambdaWarmId,  type: 'storage', byteSize: sizes.lambdaWarmBytes,  domain: 'softbody', ownerUuid: uuid });
        this._registry.register({ id: bufferSet.jacobiAccumId, type: 'storage', byteSize: sizes.jacobiAccumBytes, domain: 'softbody', ownerUuid: uuid });

        // ── Fase 2: Pack + Write (dados iniciais) ────────────────────────────
        if (pCount > 0) {
            const f32 = new Float32Array(pCount * PARTICLE_STRIDE_FLOATS);
            packSoftBodyParticles(body.particles, invMassF, f32);
            buffers.writeBuffer(bufferSet.particlesId, f32);
        }

        if (cCount > 0) {
            const { sortedConstraints, colorRanges } = graphColorConstraints(body.constraints, pCount);
            const raw = new ArrayBuffer(cCount * CONSTRAINT_STRIDE_BYTES);
            const f32 = new Float32Array(raw);
            const u32 = new Uint32Array(raw);
            packSoftBodyConstraints(sortedConstraints, f32, u32);
            buffers.writeBuffer(bufferSet.constraintsId, f32);

            const crBuf = new Uint32Array(4);
            for (let c = 0; c < colorRanges.length; c++) {
                const rangeId = buildColorRangeId(uuid, c);
                buffers.createUniformBuffer(rangeId, SB_COLOR_RANGE_SIZE);
                packColorRange(colorRanges[c]!.offset, colorRanges[c]!.count, crBuf);
                buffers.writeBuffer(rangeId, crBuf);
                bufferSet.colorRangeIds.push(rangeId);
                bufferSet.colorCounts.push(colorRanges[c]!.count);
                this._registry.register({ id: rangeId, type: 'uniform', byteSize: SB_COLOR_RANGE_SIZE, domain: 'softbody', ownerUuid: uuid });
            }
        }

        body.bufferSet = bufferSet;

        if (body.get<boolean>('useShapeMatching')) {
            this._allocateShapeMatchingBuffers(body, rm);
        }

        this.log.debug(`SoftBody alocado — particles:${pCount} constraints:${cCount} (uuid=${uuid})`);
    }

    private _allocateShapeMatchingBuffers(body: SoftBody, rm: ResourceManager): void {
        const pCount  = body.particles.length;
        const uuid    = body.uuid;
        const buffers = rm.buffers;
        const sizes   = softBodyBufferSizes(pCount, 0);

        const restPosId    = buildRestPosId(uuid);
        const goalPosId    = buildGoalPosId(uuid);
        const shapeStateId = buildShapeStateId(uuid);

        // ── Fase 1: Alocação ─────────────────────────────────────────────────
        buffers.createStorageBuffer(restPosId,    sizes.restPosBytes);
        buffers.createStorageBuffer(goalPosId,    sizes.goalPosBytes);
        buffers.createStorageBuffer(shapeStateId, SB_SHAPE_STATE_SIZE);

        this._registry.register({ id: restPosId,    type: 'storage', byteSize: sizes.restPosBytes,  domain: 'softbody', ownerUuid: uuid });
        this._registry.register({ id: goalPosId,    type: 'storage', byteSize: sizes.goalPosBytes,  domain: 'softbody', ownerUuid: uuid });
        this._registry.register({ id: shapeStateId, type: 'storage', byteSize: SB_SHAPE_STATE_SIZE, domain: 'softbody', ownerUuid: uuid });

        // ── Fase 2: Pack + Write ─────────────────────────────────────────────
        if (pCount > 0) {
            const restData = new Float32Array(Math.max(pCount, 1) * 4);
            packRestPositions(body.particles, restData);
            buffers.writeBuffer(restPosId, restData);
        }
        buffers.writeBuffer(shapeStateId, new Float32Array([0, 0, 0, 1]));

        body.bufferSet!.restPosId    = restPosId;
        body.bufferSet!.goalPosId    = goalPosId;
        body.bufferSet!.shapeStateId = shapeStateId;
    }

    private _disposeSoftBodyBuffers(body: SoftBody, rm: ResourceManager): void {
        const ids = this._registry.unregisterByOwner(body.uuid);
        for (const id of ids) rm.buffers.destroyBuffer(id);
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

        const buffers       = rm.buffers;
        const n             = rigidBodies.length;
        const rbCount       = Math.max(n, 1);
        const colliderCount = ctx.colliders.size;
        const contactSlots  = Math.max(n * Math.max(colliderCount, 1), 1);
        const set           = RIGID_BODY_GLOBAL_BUFFER_SET;

        // Destrói buffers redimensionáveis e remove entradas antigas do registro
        if (buffers.getBuffer(set.bodiesId))   { buffers.destroyBuffer(set.bodiesId);   this._registry.unregister(set.bodiesId); }
        if (buffers.getBuffer(set.contactsId)) { buffers.destroyBuffer(set.contactsId); this._registry.unregister(set.contactsId); }
        if (buffers.getBuffer(set.toUboMapId)) { buffers.destroyBuffer(set.toUboMapId); this._registry.unregister(set.toUboMapId); }

        // SimParams é estável — cria apenas uma vez
        if (!buffers.getBuffer(set.simParamsId)) {
            buffers.createUniformBuffer(set.simParamsId, RB_SIM_PARAMS_BYTE_SIZE);
            this._registry.register({ id: set.simParamsId, type: 'uniform', byteSize: RB_SIM_PARAMS_BYTE_SIZE, domain: 'rigidbody' });
        }

        const bodiesByte   = rbCount      * RB_STRIDE_BYTES;
        const contactsByte = contactSlots * RB_CONTACT_STRIDE_BYTES;
        const mapByte      = rbCount      * 4;

        buffers.createStorageBuffer(set.bodiesId,   bodiesByte);
        buffers.createStorageBuffer(set.contactsId, contactsByte);
        buffers.createStorageBuffer(set.toUboMapId, mapByte);

        this._registry.register({ id: set.bodiesId,   type: 'storage', byteSize: bodiesByte,   domain: 'rigidbody' });
        this._registry.register({ id: set.contactsId, type: 'storage', byteSize: contactsByte, domain: 'rigidbody' });
        this._registry.register({ id: set.toUboMapId, type: 'storage', byteSize: mapByte,      domain: 'rigidbody' });

        if (n > 0) {
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
