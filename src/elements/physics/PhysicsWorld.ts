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
import { ForceStage }               from './pipeline/ForceStage';
import { BroadphaseStage }          from './pipeline/BroadphaseStage';
import { NarrowphaseStage }         from './pipeline/NarrowphaseStage';
import { CollisionResolutionStage } from './pipeline/CollisionResolutionStage';
import { IntegrationStage }         from './pipeline/IntegrationStage';
import { SleepStage }               from './pipeline/SleepStage';
import { SyncStage }                from './pipeline/SyncStage';
import type { PhysicsStage }        from '../../scene/systems/PhysicsStage';
import { vec3, quat }               from 'gl-matrix';
import { Loggable }                 from '../../core/debug/Loggable';
import { Logger }                   from '../../core/debug/Logger';
import { LogCall }                  from '../../core/debug/LogCall';

export interface PhysicsWorldOptions {
    broadphase?: Broadphase;
    restitution?: number;
    restitutionThreshold?: number;
    friction?: number;
}

/**
 * Implementação euclidiana do SimulationWorld (Mediator — GoF).
 *
 * Orquestra o pipeline de física composto por estágios independentes
 * (Pipeline pattern). Cada estágio encapsula uma fase única da simulação.
 *
 * Registro event-driven com fila de pendências — modificações no grafo de cena
 * durante step() são diferidas para o início do próximo frame.
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

    // Pipeline de substeps e sincronização
    private readonly substepPipeline: PhysicsStage[];
    private readonly syncStage:       SyncStage;
    private readonly collisionDispatcher: CollisionDispatcher;

    // Event-driven com fila de pendências
    private readonly connectedScenes = new Set<Entity>();
    private readonly pendingAdd:    Entity[] = [];
    private readonly pendingRemove: Entity[] = [];
    private readonly onChildAdded:   (e: any) => void;
    private readonly onChildRemoved: (e: any) => void;

    private substeps: number = 8;

    constructor(options: PhysicsWorldOptions = {}) {
        super();

        const broadphase = options.broadphase ?? new AABBBroadphase();

        this.context = {
            bodies:       this.bodies,
            entityBodies: this.entityBodies,
            colliders:    this.colliders,
            candidatePairs: [],
            contacts:     [],
        };

        this.collisionDispatcher = new CollisionDispatcher();

        this.substepPipeline = [
            new ForceStage(this.globalForces, this.solvers),
            new BroadphaseStage(broadphase),
            new NarrowphaseStage(this.collisionDispatcher),
            new CollisionResolutionStage({
                restitution:          options.restitution          ?? 0.3,
                restitutionThreshold: options.restitutionThreshold ?? 1.0,
                friction:             options.friction             ?? 0.5,
            }),
            new IntegrationStage(),
            new SleepStage(),
        ];

        this.syncStage = new SyncStage();

        this.onChildAdded   = (e: { child: Entity }) => this.pendingAdd.push(e.child);
        this.onChildRemoved = (e: { child: Entity }) => this.pendingRemove.push(e.child);
    }

    public get dispatcher(): CollisionDispatcher {
        return this.collisionDispatcher;
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
            bodyEntry.body.set('inertiaTensor', vec3.fromValues(Ix, Iy, Iz));
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
