/**
 * GpuPhysicsOrchestrator — orquestrador de física GPU-only.
 *
 * Substitui `PhysicsWorld` no modo GPU-only: sem pipeline CPU, sem SolverRegistry,
 * sem broadphase JavaScript. Toda a simulação ocorre nos `PhysicsComputePass`
 * registrados no `GpuComputePassRegistry`.
 *
 * ## Responsabilidades
 *   1. Conectar/desconectar cenas (event-driven via `child_added`/`child_removed`).
 *   2. Executar `PhysicsResourceLoader.load()` no início de cada frame.
 *   3. Delegar o tick de simulação para `GpuComputePassRegistry.executeAll()`.
 *   4. Encorajar passes que suportam `syncToRenderer` via `encodeSyncPasses`.
 *
 * ## O que NÃO faz (diferença de PhysicsWorld)
 *   - Nenhum substep JavaScript — substeps são internos a cada `PhysicsComputePass`.
 *   - Nenhum solver CPU — `setSolver` é no-op com aviso.
 *   - Nenhum broadphase JS — narrowphase é totalmente GPU.
 *   - Nenhuma força aplicada em JS — `addForce` armazena, mas a injeção
 *     nos passes deve ser feita pelo chamador na construção dos passes.
 *   - Nenhuma alocação direta de buffer global — delegada ao `PhysicsResourceLoader`.
 *
 * Arquitetura: Layer 3 — `src/scene/rendering`.
 * Depende de: `GpuComputePassRegistry`, `PhysicsResourceLoader`, `GpuPipelineEventBus`.
 */

import { SimulationWorld }          from '../systems/SimulationWorld';
import type { Entity }              from '../core/Entity';
import type { PhysicsBody }         from '../components/physics/PhysicsBody';
import type { Collider }            from '../components/physics/Collider';
import type { PhysicsSolver }       from '../systems/solvers/PhysicsSolver';
import type { Force }               from '../systems/forces/Force';
import type { Transform }           from '../math/Transform';
import type { GpuSimContext, BodyEntry, ColliderReg } from '../systems/GpuSimContext';
import type { GpuPipelineEventBus } from '../systems/gpu/GpuPipelineEventBus';
import { DefaultGpuPipelineEventBus } from '../systems/gpu/DefaultGpuPipelineEventBus';
import type { PhysicsSceneConfig }  from '../systems/PhysicsSceneConfig';
import { GpuComputePassRegistry }   from '../systems/gpu/GpuComputePassRegistry';
import type { ResourceManager }     from '../../core/interfaces/ResourceManager';
import { PhysicsResourceLoader }    from './PhysicsResourceLoader';
import type { RigidBody }           from '../../elements/physics/RigidBody';
import { PhysicsBodyState }         from '../core/physics/PhysicsBodyState';
import { vec3 }                     from 'gl-matrix';
import { Loggable }                 from '../../core/debug/Loggable';
import { Logger }                   from '../../core/debug/Logger';

// Interface mínima para passes que suportam sincronização com o renderer
interface SyncablePass {
    syncToRenderer(
        commandEncoder:  GPUCommandEncoder,
        entityIdToSlot:  Map<number, number>,
        objectUboBuffer: GPUBuffer,
    ): void;
}

function isSyncable(pass: unknown): pass is SyncablePass {
    return typeof (pass as SyncablePass).syncToRenderer === 'function';
}

@Loggable('GpuPhysicsOrchestrator')
export class GpuPhysicsOrchestrator extends SimulationWorld {
    declare private readonly log: Logger;

    /** Barramento de eventos — exposto para integração com o renderer. */
    public readonly eventBus: GpuPipelineEventBus;

    private readonly registry:   GpuComputePassRegistry;
    private readonly resLoader:  PhysicsResourceLoader<GpuPhysicsOrchestrator>;
    private readonly config:     PhysicsSceneConfig;

    // Contexto de simulação — compartilhado com os passes
    private readonly bodies:       Map<string, BodyEntry>   = new Map();
    private readonly entityBodies: Map<number, BodyEntry>   = new Map();
    private readonly colliders:    Map<number, ColliderReg> = new Map();

    private readonly context: GpuSimContext = {
        bodies:       this.bodies,
        entityBodies: this.entityBodies,
        colliders:    this.colliders,
    };

    // Forças globais — referência compartilhada com os passes registrados.
    // Pode ser injetada externamente (factory) para que passes vejam as mesmas forças.
    private readonly globalForces: Map<string, Force>;

    // Cenas conectadas e filas de pendências (mesmo padrão de PhysicsWorld)
    private readonly connectedScenes = new Set<Entity>();
    private readonly pendingAdd:    Entity[] = [];
    private readonly pendingRemove: Entity[] = [];
    private readonly onChildAdded:   (e: any) => void;
    private readonly onChildRemoved: (e: any) => void;

    private readonly inertiaTensorMaxRatio: number;

    constructor(
        config:       PhysicsSceneConfig,
        registry:     GpuComputePassRegistry,
        eventBus?:    GpuPipelineEventBus,
        resLoader?:   PhysicsResourceLoader<GpuPhysicsOrchestrator>,
        globalForces?: Map<string, Force>,
    ) {
        super();
        this.config       = config;
        this.registry     = registry;
        this.eventBus     = eventBus  ?? new DefaultGpuPipelineEventBus();
        this.resLoader    = resLoader ?? new PhysicsResourceLoader<GpuPhysicsOrchestrator>(this.eventBus);
        this.globalForces = globalForces ?? new Map();

        this.inertiaTensorMaxRatio = config.inertiaTensorMaxRatio ?? 10;

        this.onChildAdded   = (e: { child: Entity }) => this.pendingAdd.push(e.child);
        this.onChildRemoved = (e: { child: Entity }) => this.pendingRemove.push(e.child);
    }

    // ------------------------------------------------------------------
    // SimulationWorld — inicialização de recursos GPU
    // ------------------------------------------------------------------

    /**
     * Injeta o ResourceManager no loader, habilitando a alocação do buffer
     * global de RigidBody a partir do próximo `step()`.
     */
    public override initializeResources(resourceManager: ResourceManager): void {
        this.resLoader.setResourceManager(resourceManager);
    }

    // ------------------------------------------------------------------
    // SimulationWorld — vínculo com a cena
    // ------------------------------------------------------------------

    public connectScene(scene: Entity): void {
        if (this.connectedScenes.has(scene)) return;
        this.connectedScenes.add(scene);
        scene.addEventListener('child_added',   this.onChildAdded);
        scene.addEventListener('child_removed', this.onChildRemoved);
        scene.traverse(entity => {
            if (entity === scene) return;
            this.registerEntity(entity);
        });
        this.log.info(`Cena conectada — bodies:${this.bodies.size} colliders:${this.colliders.size}`);
    }

    public disconnectScene(scene: Entity): void {
        if (!this.connectedScenes.has(scene)) return;
        this.connectedScenes.delete(scene);
        scene.removeEventListener('child_added',   this.onChildAdded);
        scene.removeEventListener('child_removed', this.onChildRemoved);
        this.bodies.clear();
        this.entityBodies.clear();
        this.colliders.clear();
        this.registry.disposeAll();
        this.log.info('Cena desconectada — registry descartado.');
    }

    // ------------------------------------------------------------------
    // SimulationWorld — configuração
    // ------------------------------------------------------------------

    /** GPU-only: solvers por tipo de corpo não se aplicam. No-op com aviso. */
    public setSolver(_physicType: string, _solver: PhysicsSolver): void {
        this.log.warn('setSolver() não tem efeito no GpuPhysicsOrchestrator (GPU-only).');
    }

    public removeSolver(_physicType: string): void { /* no-op */ }

    public addForce(force: Force): void {
        this.globalForces.set(force.id, force);
    }

    public removeForce(id: string): void {
        this.globalForces.delete(id);
    }

    // ------------------------------------------------------------------
    // SimulationWorld — passo de simulação
    // ------------------------------------------------------------------

    public step(scene: Entity, dt: number): void {
        if (dt <= 0) return;

        if (!this.connectedScenes.has(scene)) this.connectScene(scene);

        // Processa pendências antes do pipeline
        for (const e of this.pendingRemove) this.unregisterEntity(e);
        for (const e of this.pendingAdd)    this.registerEntity(e);
        this.pendingRemove.length = 0;
        this.pendingAdd.length    = 0;

        // Ciclo de vida dos PhysicsResources (Uninitialized/Dirty/Disposed).
        // Se houver mudança estrutural e o ResourceManager foi injetado,
        // o loader realoca o buffer global de RigidBody diretamente.
        this.resLoader.load(scene, this);

        // Delega execução de todos os passes registrados
        void this.registry.executeAll(this.context, dt);
    }

    // ------------------------------------------------------------------
    // Sync GPU → renderer
    // ------------------------------------------------------------------

    public override encodeSyncPasses(
        commandEncoder:  GPUCommandEncoder,
        entityIdToSlot:  Map<number, number>,
        objectUboBuffer: GPUBuffer,
    ): void {
        for (const pass of this.registry.activePasses) {
            if (isSyncable(pass)) {
                pass.syncToRenderer(commandEncoder, entityIdToSlot, objectUboBuffer);
            }
        }
    }

    // ------------------------------------------------------------------
    // Acesso ao contexto (leitura)
    // ------------------------------------------------------------------

    public getContext(): Readonly<GpuSimContext> {
        return this.context;
    }

    public getGlobalForces(): ReadonlyMap<string, Force> {
        return this.globalForces;
    }

    // ------------------------------------------------------------------
    // Privado — registro por entidade
    // ------------------------------------------------------------------

    private registerEntity(entity: Entity): void {
        for (const physic of entity.getPhysics()) {
            if (physic.physicType === 'Collider') {
                this.colliders.set(entity.id, { entity, collider: physic as unknown as Collider });
            } else {
                const body  = physic as unknown as PhysicsBody;
                const entry = { entity, body };

                const transform = entity.getComponent<Transform>('Transform');

                if (body.physicType === 'RigidBody') {
                    const rb = body as unknown as RigidBody;
                    if (!rb.simState) {
                        rb.initSimState(
                            transform?.position ?? [0, 0, 0],
                            transform?.rotation ?? [0, 0, 0, 1],
                        );
                    }
                }

                if (body.bodyState === PhysicsBodyState.Inactive) {
                    const rb = body as unknown as RigidBody;
                    body.transitionTo(
                        (body.physicType === 'RigidBody' && rb.isKinematic)
                            ? PhysicsBodyState.Kinematic
                            : PhysicsBodyState.Active,
                    );
                }

                this.bodies.set(body.uuid, entry);
                this.entityBodies.set(entity.id, entry);
            }
        }

        // Seed do tensor de inércia para RigidBody a partir do collider
        const bodyEntry     = this.entityBodies.get(entity.id);
        const colliderEntry = this.colliders.get(entity.id);
        if (bodyEntry && colliderEntry && bodyEntry.body.physicType === 'RigidBody'
            && bodyEntry.body.bodyState !== PhysicsBodyState.Kinematic) {
            const rb   = bodyEntry.body as unknown as RigidBody;
            const mass = rb.material.mass;
            const [Ix, Iy, Iz] = colliderEntry.collider.computeInertiaTensor(mass);
            const maxI = Math.max(Ix, Iy, Iz, 1e-6);
            const minI = maxI / this.inertiaTensorMaxRatio;
            if (rb.simState) {
                rb.simState.inertiaTensor = vec3.fromValues(
                    Math.max(Ix, minI),
                    Math.max(Iy, minI),
                    Math.max(Iz, minI),
                );
            }
        }
    }

    private unregisterEntity(entity: Entity): void {
        this.colliders.delete(entity.id);
        const bodyEntry = this.entityBodies.get(entity.id);
        if (bodyEntry) {
            bodyEntry.body.transitionTo(PhysicsBodyState.Removed);
        }
        this.entityBodies.delete(entity.id);
        for (const physic of entity.getPhysics()) {
            if (physic.physicType !== 'Collider') {
                this.bodies.delete((physic as unknown as PhysicsBody).uuid);
            }
        }
    }
}
