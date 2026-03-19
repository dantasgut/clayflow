import type { Entity } from '../core/Entity';
import type { PhysicsBody } from '../components/physics/PhysicsBody';
import type { PhysicsSolver } from './solvers/PhysicsSolver';
import { vec3 } from 'gl-matrix';

interface BodyEntry {
    entity: Entity;
    body: PhysicsBody;
}

/**
 * Mediador central da simulação física (Mediator — GoF).
 *
 * Responsabilidades:
 *  1. Registro e remoção de corpos físicos
 *  2. Associação de PhysicsSolver por tipo de corpo (Bridge)
 *  3. Coordenação do passo de simulação (broadphase → solver → events)
 *  4. Despacho de eventos de colisão/deformação via Observer
 *
 * Os sistemas externos (PhysicsSystem, WebGPURenderer) só falam com
 * PhysicsWorld — nunca acessam solvers ou corpos diretamente.
 *
 * @example
 * const world = new PhysicsWorld();
 * world.setSolver('RigidBody', new CPURigidBodySolver());
 * world.setSolver('SoftBody', new GPUSpringMassSolver(compute));
 *
 * world.register(meshEntity, rigidBody);
 *
 * // No loop de render:
 * world.step(encoder, deltaTime);
 */
export class PhysicsWorld {
    private readonly _bodies: Map<string, BodyEntry> = new Map();
    private readonly _solvers: Map<string, PhysicsSolver> = new Map();

    public gravity: vec3 = vec3.fromValues(0, -9.81, 0);

    // ------------------------------------------------------------------
    // Registro de solvers (Bridge)
    // ------------------------------------------------------------------

    public setSolver(physicType: string, solver: PhysicsSolver): void {
        this._solvers.set(physicType, solver);
    }

    public removeSolver(physicType: string): void {
        this._solvers.delete(physicType);
    }

    // ------------------------------------------------------------------
    // Registro de corpos
    // ------------------------------------------------------------------

    public register(entity: Entity, body: PhysicsBody): void {
        this._bodies.set(body.uuid, { entity, body });
    }

    public unregister(bodyUuid: string): void {
        this._bodies.delete(bodyUuid);
    }

    public clear(): void {
        this._bodies.clear();
    }

    // ------------------------------------------------------------------
    // Passo de simulação (Mediator coordena tudo)
    // ------------------------------------------------------------------

    /**
     * Avança a simulação por `dt` segundos.
     * Fase 1: broadphase AABB stub (extensível)
     * Fase 2: solver por tipo de corpo
     * Fase 3: detecção de colisão e despacho de eventos Observer
     */
    public step(encoder: GPUCommandEncoder, dt: number): void {
        const entries = Array.from(this._bodies.values());

        // Fase 1: broadphase — pares candidatos a colisão (stub para expansão futura)
        const collisionPairs = this._broadphase(entries);

        // Fase 2: integração via solver registrado para cada tipo
        for (const { body, entity } of entries) {
            const solver = this._solvers.get(body.physicType);
            if (solver) {
                solver.solve(body, encoder, dt);
            }

            // Evento de deformação para SoftBody (Observer)
            if (body.physicType === 'SoftBody') {
                entity.dispatchEvent({ type: 'deformation', body, energy: 0 });
            }
        }

        // Fase 3: narrowphase e despacho de colisão (Observer)
        for (const [a, b] of collisionPairs) {
            this._resolveCollision(a, b);
        }
    }

    // ------------------------------------------------------------------
    // Privado
    // ------------------------------------------------------------------

    /**
     * Broadphase stub — retorna pares candidatos.
     * Substituir por BVH ou spatial hashing quando necessário.
     */
    private _broadphase(entries: BodyEntry[]): Array<[BodyEntry, BodyEntry]> {
        // Stub: sem broadphase real ainda — retorna vazio
        void entries;
        return [];
    }

    /**
     * Narrowphase + impulso + despacho Observer de 'collision'.
     */
    private _resolveCollision(a: BodyEntry, b: BodyEntry): void {
        // Stub: point de contato e impulso calculados pelo narrowphase real
        const contactPoint = vec3.create();
        const impulse = 0;

        a.entity.dispatchEvent({
            type: 'collision',
            other: b.entity,
            contactPoint,
            impulse
        });

        b.entity.dispatchEvent({
            type: 'collision',
            other: a.entity,
            contactPoint,
            impulse
        });
    }
}
