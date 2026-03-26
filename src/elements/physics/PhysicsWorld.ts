import { SimulationWorld }          from '../../scene/systems/SimulationWorld';
import type { Broadphase }          from '../../scene/systems/Broadphase';
import type { Entity }              from '../../scene/core/Entity';
import type { PhysicsBody }         from '../../scene/components/physics/PhysicsBody';
import type { Collider }            from '../../scene/components/physics/Collider';
import type { PhysicsSolver }       from '../../scene/systems/solvers/PhysicsSolver';
import type { Force }               from '../../scene/systems/forces/Force';
import type { Transform }           from '../../scene/math/Transform';
import type { PhysicsStageContext, BodyEntry, ColliderReg } from '../../scene/systems/PhysicsStageContext';
import { CollisionDispatcher }      from './collision/CollisionDispatcher';
import { AABBBroadphase }           from './AABBBroadphase';
import { ForceStage }               from './pipeline/shared/ForceStage';
import { BroadphaseStage }          from './pipeline/rigidbody/BroadphaseStage';
import { NarrowphaseStage }         from './pipeline/rigidbody/NarrowphaseStage';
import { CollisionResolutionStage } from './pipeline/rigidbody/CollisionResolutionStage';
import { IntegrationStage }         from './pipeline/rigidbody/IntegrationStage';
import { SleepStage }               from './pipeline/rigidbody/SleepStage';
import type { SleepStageOptions }   from './pipeline/rigidbody/SleepStage';
import { SyncStage }                from './pipeline/rigidbody/SyncStage';
import { GyroscopicStage }          from './pipeline/rigidbody/GyroscopicStage';
import { PredictiveContactStage }   from './pipeline/rigidbody/PredictiveContactStage';
import { PredictStage }             from './pipeline/rigidbody/xpbd/PredictStage';
import { SolveStage }               from './pipeline/rigidbody/xpbd/SolveStage';
import { VelocityRecoveryStage }    from './pipeline/rigidbody/xpbd/VelocityRecoveryStage';
import { ContactResponseStage }     from './pipeline/rigidbody/xpbd/ContactResponseStage';
import { createXPBDState }          from './pipeline/rigidbody/xpbd/XPBDState';
import { SoftBodyPredictStage }        from './pipeline/softbody/SoftBodyPredictStage';
import { DistanceConstraintStage }     from './pipeline/softbody/DistanceConstraintStage';
import { SoftBodyCollisionStage }      from './pipeline/softbody/SoftBodyCollisionStage';
import { SoftBodyVelocityUpdateStage }  from './pipeline/softbody/SoftBodyVelocityUpdateStage';
import { SoftBodyPositionCommitStage }  from './pipeline/softbody/SoftBodyPositionCommitStage';
import { SoftBodySyncStage }            from './pipeline/softbody/SoftBodySyncStage';
import { GpuParticleSimPipeline }       from './gpu/GpuParticleSimPipeline';
import type { GpuRigidBodyPipeline }    from './gpu/GpuRigidBodyPipeline';
import type { GpuLcpPipeline }          from './gpu/GpuLcpPipeline';
import { GpuSolverAdapter }             from './solvers/GpuSolverAdapter';
import { GpuLcpAdapter }                from './solvers/GpuLcpAdapter';
import { SolverRegistry }               from './solvers/SolverRegistry';
import { registerAllSolvers }            from './solvers/SolverRegistrations';
import type { RigidBodySimConfig }    from '../../scene/systems/simulation/RigidBodySimConfig';
import type { SoftBodySimConfig }     from '../../scene/systems/simulation/SoftBodySimConfig';
import type { CollisionSimConfig }    from '../../scene/systems/simulation/CollisionSimConfig';
import { ResolutionType }           from '../../scene/systems/resolution/ResolutionType';
import type { PhysicsStage }        from '../../scene/systems/PhysicsStage';
import { vec3, quat }               from 'gl-matrix';
import { Loggable }                 from '../../core/debug/Loggable';
import { Logger }                   from '../../core/debug/Logger';
import { LogCall }                  from '../../core/debug/LogCall';

export interface PhysicsWorldOptions {
    /** Estratégia de detecção de pares (broadphase). Default: AABBBroadphase. */
    broadphase?: Broadphase;
    /**
     * Número de substeps por frame de física.
     *
     * XPBD é teoricamente invariante ao número de substeps (compliance correto
     * escala com dt²), então reduzir substeps e compensar com mais iterações de
     * constraint é uma troca válida: menos overhead de predict/collision/velocity_update
     * por frame, com mesma qualidade de resolução de constraints.
     *
     * Regra prática:
     *   - substeps=4 + iterations=15 → equivalente a substeps=8 + iterations=10
     *     em qualidade, com ~30% menos dispatches totais por frame.
     *   - substeps=2 pode introduzir tunneling em colisões rápidas.
     *
     * Default: 4. (Anteriormente 8 — Otimização 3c)
     */
    substeps?: number;
    /**
     * Razão máxima entre o maior e o menor componente do tensor de inércia.
     * Limita instabilidade em corpos finos/longos. Default: 10.
     */
    inertiaTensorMaxRatio?: number;
    /** Configurações do gerenciador de sono. */
    sleep?: SleepStageOptions;
    /**
     * Configuração da simulação de corpos rígidos.
     * Ausência desabilita o pipeline RigidBody (útil para cenas só com SoftBody).
     */
    rigidBody?: RigidBodySimConfig;
    /**
     * Configuração da simulação de corpos deformáveis (XPBD SoftBody).
     * Presença deste objeto habilita o pipeline SoftBody no mesmo mundo.
     * Exemplo: `softBody: {}` usa todos os defaults.
     */
    softBody?: SoftBodySimConfig;
    /**
     * Configuração do pipeline de detecção de colisão.
     * Independente do tipo de corpo — aplica-se a RigidBody e SoftBody.
     * Ausência usa os defaults de cada estágio.
     */
    collision?: CollisionSimConfig;
}

/**
 * Implementação euclidiana do SimulationWorld (Mediator — GoF).
 *
 * Orquestra o pipeline de física composto por estágios independentes
 * (Pipeline pattern). Cada estágio encapsula uma fase única da simulação.
 *
 * ## Pipeline de Física — `step(scene, dt)`
 *
 * O frame dt é dividido em N substeps (padrão: 8) para estabilidade numérica.
 * O pipeline de substeps roda N vezes; SyncStage roda uma única vez ao final.
 *
 * ```mermaid
 * flowchart TD
 *     subgraph loop["🔁 loop substeps (N × substepDt, padrão N=8)"]
 *         F["1. ForceStage\nAcumula forças globais\nnetForce → velocity\nlinearDamping + angularDamping"]
 *         B["2. BroadphaseStage\nSincroniza worldMatrix\nDetecta pares AABB O(n²)"]
 *         N["3. NarrowphaseStage\nDispatcher por par de formas\nGera CollisionContacts"]
 *         R["4. CollisionResolutionStage\nImpulso normal + tangencial\nCorreção de penetração"]
 *         I["5. IntegrationStage\nvelocity → position\nangularVelocity → quaternion"]
 *         S["6. SleepStage\nCorpos lentos → sleep\nElimina micro-impulsos"]
 *         F --> B --> N --> R --> I --> S
 *     end
 *     Sync["7. SyncStage — 1× por frame\nbody.position/rotation → Transform visual"]
 *     loop --> Sync
 * ```
 *
 * ## Registro Event-Driven
 *
 * Modificações no grafo de cena (addChild / removeChild) durante step() são
 * diferidas em filas (`pendingAdd`, `pendingRemove`) e processadas no início
 * do próximo frame — evitando mutação de coleções durante a iteração do pipeline.
 *
 * @example
 * const world = new PhysicsWorld();
 * world.setSolver('RigidBody', new CPURigidBodySolver());
 * world.addForce(new ConstantForce('gravity', vec3.fromValues(0, -9.81, 0)));
 * world.setSubsteps(8);
 *
 * // No loop de render:
 * world.step(scene, dt);
 */
@Loggable('PhysicsWorld')
export class PhysicsWorld extends SimulationWorld {
    declare private readonly log: Logger;

    // Estado de simulação
    private readonly bodies:       Map<string, BodyEntry>   = new Map();
    private readonly entityBodies: Map<number, BodyEntry>   = new Map();
    private readonly colliders:    Map<number, ColliderReg> = new Map();
    private readonly solvers:      Map<string, PhysicsSolver> = new Map();
    private readonly globalForces: Map<string, Force>        = new Map();

    // Contexto compartilhado entre estágios
    private readonly context: PhysicsStageContext;

    // Pipeline de substeps, frame e sincronização
    private readonly substepPipeline: PhysicsStage[];
    private readonly framePipeline:   PhysicsStage[] = [];
    /** Referência direta ao pipeline GPU de RigidBody SI/XPBD (null se backend!=gpu/si). */
    private gpuRbPipeline: GpuRigidBodyPipeline | null = null;
    /** Referência direta ao pipeline GPU LCP (null se resolutionType!=LCP). */
    private gpuLcpPipeline: GpuLcpPipeline | null = null;
    private readonly syncStage:       SyncStage;
    private readonly collisionDispatcher: CollisionDispatcher;

    // Event-driven com fila de pendências
    private readonly connectedScenes = new Set<Entity>();
    private readonly pendingAdd:    Entity[] = [];
    private readonly pendingRemove: Entity[] = [];
    private readonly onChildAdded:   (e: any) => void;
    private readonly onChildRemoved: (e: any) => void;

    private substeps: number = 8;
    private readonly inertiaTensorMaxRatio: number;
    private readonly softBodyBackend: 'cpu' | 'gpu';
    private readonly softBodyUseShapeMatching: boolean;
    private readonly softBodyShapeStiffness: number;
    private readonly softBodyUseJacobiSolve: boolean;
    private readonly rigidBodyBackend: 'cpu' | 'gpu';

    constructor(options: PhysicsWorldOptions = {}) {
        super();
        // Registra todos os solvers disponíveis no SolverRegistry (idempotente)
        registerAllSolvers();

        // Re-registra as factories GPU com closures que capturam globalForces e getSubsteps.
        // Necessário porque SolverFactory recebe apenas RigidBodySimConfig; os parâmetros
        // adicionais são injetados via closure aqui, antes de qualquer registry.create().
        // Executado após registerAllSolvers() para sobrescrever as factories default.
        const registry = SolverRegistry.getInstance();
        registry.register('gpu_si',  (cfg) => new GpuSolverAdapter(cfg, this.globalForces, () => this.substeps));
        registry.register('gpu_lcp', (cfg) => new GpuLcpAdapter(cfg,    this.globalForces, () => this.substeps));

        const broadphase = options.broadphase ?? new AABBBroadphase();
        this.inertiaTensorMaxRatio      = options.inertiaTensorMaxRatio ?? 10;
        this.softBodyBackend            = options.softBody?.backend            ?? 'cpu';
        this.softBodyUseShapeMatching   = options.softBody?.useShapeMatching   ?? false;
        this.softBodyShapeStiffness     = options.softBody?.shapeStiffness     ?? 0.5;
        this.softBodyUseJacobiSolve     = options.softBody?.useJacobiSolve     ?? false;
        this.rigidBodyBackend           = options.rigidBody?.backend           ?? 'cpu';
        // Otimização 3c: substeps 8→4, compensado por mais iterações de constraint nos pipelines GPU
        this.substeps = options.substeps ?? 4;

        this.context = {
            bodies:       this.bodies,
            entityBodies: this.entityBodies,
            colliders:    this.colliders,
            candidatePairs: [],
            contacts:     [],
        };

        const rb  = options.rigidBody;
        const sb  = options.softBody;
        const col = options.collision;

        this.collisionDispatcher = new CollisionDispatcher(col?.narrowphase);

        // ── Estágios de SoftBody ───────────────────────────────────────────────
        // Acrescentados ao final de qualquer pipeline RigidBody quando `softBody`
        // está presente. Operam exclusivamente sobre physicType='SoftBody'.
        const softBodyStages: PhysicsStage[] = sb ? [
            new SoftBodyPredictStage(),
            new DistanceConstraintStage(sb.iterations ?? 10),
            new SoftBodyCollisionStage(sb.restitution ?? 0.05),
            new SoftBodyVelocityUpdateStage(),
            new SoftBodyPositionCommitStage(),
            new SoftBodySyncStage(),
        ] : [];

        // ── Pipeline RigidBody ────────────────────────────────────────────────
        const resType      = rb?.resolution?.type ?? ResolutionType.SEQUENTIAL_IMPULSE;
        const gyroscopicStage = rb?.gyroscopic ? [new GyroscopicStage()] : [];
        const predictiveStage = col?.predictiveContacts
            ? [new PredictiveContactStage(this.collisionDispatcher, col.predictiveContactsThreshold)]
            : [];

        if (!rb) {
            // ── SoftBody exclusivo (sem RigidBody) ────────────────────────────
            this.substepPipeline = [
                new ForceStage(this.globalForces, this.solvers),
                ...softBodyStages,
            ];
        } else if (resType === ResolutionType.XPBD) {
            // ── XPBD RigidBody + SoftBody opcional ────────────────────────────
            const xpbdState = createXPBDState();
            this.substepPipeline = [
                new ForceStage(this.globalForces, this.solvers),
                ...gyroscopicStage,
                new PredictStage(xpbdState),
                new BroadphaseStage(broadphase),
                new NarrowphaseStage(this.collisionDispatcher),
                ...predictiveStage,
                new SolveStage(xpbdState, rb.resolution),
                new VelocityRecoveryStage(xpbdState),
                new ContactResponseStage(xpbdState, rb.resolution),
                ...softBodyStages,
                new SleepStage(options.sleep),
            ];
        } else {
            // ── SI (Sequential Impulse — padrão) + SoftBody opcional ──────────
            this.substepPipeline = [
                new ForceStage(this.globalForces, this.solvers),
                ...gyroscopicStage,
                new BroadphaseStage(broadphase),
                new NarrowphaseStage(this.collisionDispatcher),
                ...predictiveStage,
                new CollisionResolutionStage(rb.resolution),
                new IntegrationStage(),
                ...softBodyStages,
                new SleepStage(options.sleep),
            ];
        }

        this.syncStage = new SyncStage();

        // ── Pipeline GPU (frame-level, não por substep) ───────────────────────
        // GpuParticleSimPipeline executa uma vez por frame e manuseia internamente
        // todos os substeps via compute shaders. Ativo apenas quando backend='gpu'.
        if (sb?.backend === 'gpu') {
            this.framePipeline.push(
                new GpuParticleSimPipeline(
                    this.globalForces,
                    () => this.substeps,
                    sb.restitution  ?? 0.05,
                    sb.iterations   ?? 15,  // Otimização 3c: 10→15 (compensa substeps 8→4)
                    sb.profilerLogInterval ?? 60,
                ),
            );
        }

        // GpuRigidBodyPipeline — pipeline GPU SI/XPBD, frame-level.
        // Criado via SolverRegistry para encapsular a instanciação e permitir
        // substituição/mock em testes. Ativo quando backend='gpu' e tipo != LCP.
        if (rb?.backend === 'gpu' && resType !== ResolutionType.LCP) {
            const adapter = registry.create('gpu_si', rb) as GpuSolverAdapter;
            this.gpuRbPipeline = adapter.getPipeline();
            this.framePipeline.push(this.gpuRbPipeline);
        }

        // GpuLcpPipeline — pipeline LCP/PGS separado, frame-level.
        // Criado via SolverRegistry. Ativo quando backend='gpu' e tipo === LCP.
        if (rb?.backend === 'gpu' && resType === ResolutionType.LCP) {
            const adapter = registry.create('gpu_lcp', rb) as GpuLcpAdapter;
            this.gpuLcpPipeline = adapter.getPipeline();
            this.framePipeline.push(this.gpuLcpPipeline);
        }

        this.onChildAdded   = (e: { child: Entity }) => this.pendingAdd.push(e.child);
        this.onChildRemoved = (e: { child: Entity }) => this.pendingRemove.push(e.child);
    }

    public get dispatcher(): CollisionDispatcher {
        return this.collisionDispatcher;
    }

    /**
     * Despacha passes compute de sincronização GPU→UBO no encoder do renderer.
     * Chamado pelo renderer APÓS uploadObjectMatrices e ANTES do render pass.
     */
    public override encodeSyncPasses(
        commandEncoder:  GPUCommandEncoder,
        entityIdToSlot:  Map<number, number>,
        objectUboBuffer: GPUBuffer,
    ): void {
        this.gpuRbPipeline?.syncToRenderer(commandEncoder, entityIdToSlot, objectUboBuffer);
        this.gpuLcpPipeline?.syncToRenderer(commandEncoder, entityIdToSlot, objectUboBuffer);
    }

    public setSubsteps(n: number): void {
        this.substeps = Math.max(1, n);
    }

    // ------------------------------------------------------------------
    // SimulationWorld — vínculo com a cena (event-driven)
    // ------------------------------------------------------------------

    @LogCall('info', function(this: PhysicsWorld) {
        return `Cena conectada — bodies:${this.bodies.size} colliders:${this.colliders.size}`;
    })
    public connectScene(scene: Entity): void {
        if (this.connectedScenes.has(scene)) return;
        this.connectedScenes.add(scene);
        scene.addEventListener('child_added',   this.onChildAdded);
        scene.addEventListener('child_removed', this.onChildRemoved);
        scene.traverse(entity => {
            if (entity === scene) return;
            this.registerEntity(entity);
        });
    }

    public disconnectScene(scene: Entity): void {
        if (!this.connectedScenes.has(scene)) return;
        this.connectedScenes.delete(scene);
        scene.removeEventListener('child_added',   this.onChildAdded);
        scene.removeEventListener('child_removed', this.onChildRemoved);
        this.bodies.clear();
        this.entityBodies.clear();
        this.colliders.clear();
    }

    // ------------------------------------------------------------------
    // SimulationWorld — configuração
    // ------------------------------------------------------------------

    public setSolver(physicType: string, solver: PhysicsSolver): void {
        this.solvers.set(physicType, solver);
    }

    public removeSolver(physicType: string): void {
        this.solvers.delete(physicType);
    }

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

        // Processa pendências antes de qualquer fase
        for (const e of this.pendingRemove) this.unregisterEntity(e);
        for (const e of this.pendingAdd)    this.registerEntity(e);
        this.pendingRemove.length = 0;
        this.pendingAdd.length    = 0;

        // Notifica estágios do início do frame (warm starting, caches, etc.)
        for (const stage of this.substepPipeline) {
            stage.beginFrame?.();
        }

        // Pipeline de frame (GPU) — executa antes do loop de substeps CPU
        // GpuParticleSimPipeline manuseia internamente os substeps e o vertex write
        for (const stage of this.framePipeline) {
            stage.execute(this.context, dt);
        }

        // Executa pipeline N vezes com substep dt
        const substepDt = dt / this.substeps;
        for (let i = 0; i < this.substeps; i++) {
            for (const stage of this.substepPipeline) {
                stage.execute(this.context, substepDt);
            }
        }

        // Sincronização física → visual — uma única vez por frame
        this.syncStage.execute(this.context, dt);
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
                if (transform && !body.has('position')) {
                    body.set('position', vec3.clone(transform.position));
                }
                if (transform && !body.has('rotation')) {
                    body.set('rotation', quat.clone(transform.rotation));
                }
                // Marca SoftBodies para o pipeline GPU quando backend='gpu'
                if (this.softBodyBackend === 'gpu' && body.physicType === 'SoftBody') {
                    body.set('gpuSimulated', true);
                    if (this.softBodyUseShapeMatching) {
                        body.set('useShapeMatching', true);
                        body.set('shapeStiffness',   this.softBodyShapeStiffness);
                    }
                    if (this.softBodyUseJacobiSolve) {
                        body.set('useJacobiSolve', true);
                    }
                }
                // Marca RigidBodies para o pipeline GPU quando backend='gpu'
                if (this.rigidBodyBackend === 'gpu' && body.physicType === 'RigidBody') {
                    body.set('gpuSimulated', true);
                }
                this.bodies.set(body.uuid, entry);
                this.entityBodies.set(entity.id, entry);
            }
        }
        // Seed inertia tensor from collider shape (needs both body and collider registered)
        const bodyEntry     = this.entityBodies.get(entity.id);
        const colliderEntry = this.colliders.get(entity.id);
        if (bodyEntry && colliderEntry && !bodyEntry.body.get<boolean>('isKinematic')) {
            const mass = bodyEntry.body.get<number>('mass') ?? 1.0;
            const [Ix, Iy, Iz] = colliderEntry.collider.computeInertiaTensor(mass);
            // Limita a razão máxima entre componentes do tensor de inércia.
            // Corpos muito finos/longos (ex: bastão 0.2×4×0.2) têm Iy ≈ Ix/50,
            // gerando velocidades angulares 50× maiores nesse eixo por qualquer torque.
            // Ratio 10:1 é o padrão de motores como Bullet e PhysX para estabilidade.
            const maxI = Math.max(Ix, Iy, Iz, 1e-6);
            const minI = maxI / this.inertiaTensorMaxRatio;
            bodyEntry.body.set('inertiaTensor', vec3.fromValues(
                Math.max(Ix, minI),
                Math.max(Iy, minI),
                Math.max(Iz, minI),
            ));
        }
    }

    private unregisterEntity(entity: Entity): void {
        this.colliders.delete(entity.id);
        this.entityBodies.delete(entity.id);
        for (const physic of entity.getPhysics()) {
            if (physic.physicType !== 'Collider') {
                this.bodies.delete((physic as unknown as PhysicsBody).uuid);
            }
        }
    }
}
