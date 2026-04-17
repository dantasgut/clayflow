/**
 * PhysicsWorld — facade do mundo de física GPU-only.
 *
 * Ponto de entrada público para a simulação física. Delega internamente para
 * `GpuPhysicsOrchestrator` criado via `createGpuPhysicsWorld(config)`.
 *
 * ## Uso típico
 *
 * ```typescript
 * const world = new PhysicsWorld({
 *     substeps: 4,
 *     rigidBody: { iterations: 10 },
 *     softBody:  { iterations: 15, restitution: 0.05 },
 * });
 * world.addForce(new ConstantForce('gravity', new Float32Array([0, -9.81, 0])));
 *
 * const renderer = new WebGPURenderer(world);
 * await renderer.initialize(canvas);
 * ```
 *
 * ## Arquitetura
 *
 * `PhysicsWorld` (Layer 3, facade) → `GpuPhysicsOrchestrator` (Layer 2, simulação).
 * O renderer chama `world.step()` e `world.encodeSyncPasses()` a cada frame.
 * Toda a lógica de simulação e registro de entidades vive no orchestrator.
 *
 * `setSolver` é no-op com aviso: a engine é GPU-only, sem solvers CPU.
 */

import { SimulationWorld }         from '../../scene/systems/SimulationWorld';
import type { Entity }             from '../../scene/core/Entity';
import type { PhysicsSolver }      from '../../scene/systems/solvers/PhysicsSolver';
import type { Force }              from '../../scene/systems/forces/Force';
import type { PhysicsSceneConfig } from '../../scene/systems/PhysicsSceneConfig';
import type { ResourceManager }    from '../../core/interfaces/ResourceManager';
import { GpuPhysicsOrchestrator }  from '../../scene/rendering/GpuPhysicsOrchestrator';
import { createGpuPhysicsWorld }   from './createGpuPhysicsWorld';
import { Loggable }                from '../../core/debug/Loggable';
import { Logger }                  from '../../core/debug/Logger';

export type { PhysicsSceneConfig as PhysicsWorldOptions };

@Loggable('PhysicsWorld')
export class PhysicsWorld extends SimulationWorld {
    declare private readonly log: Logger;

    private readonly orchestrator: GpuPhysicsOrchestrator;

    /** Barramento de eventos — exposto para integração com o renderer. */
    public get eventBus() { return this.orchestrator.eventBus; }

    constructor(config: PhysicsSceneConfig = {}) {
        super();
        this.orchestrator = createGpuPhysicsWorld(config);
    }

    // ── SimulationWorld — inicialização de recursos GPU ───────────────────────

    public override initializeResources(resourceManager: ResourceManager): void {
        this.orchestrator.initializeResources(resourceManager);
    }

    // ── SimulationWorld — vínculo com a cena ──────────────────────────────────

    public override connectScene(scene: Entity): void {
        this.orchestrator.connectScene(scene);
    }

    public override disconnectScene(scene: Entity): void {
        this.orchestrator.disconnectScene(scene);
    }

    // ── SimulationWorld — passo de simulação ──────────────────────────────────

    public step(scene: Entity, dt: number): void {
        this.orchestrator.step(scene, dt);
    }

    // ── SimulationWorld — sync GPU → renderer ─────────────────────────────────

    public override encodeSyncPasses(
        commandEncoder:  GPUCommandEncoder,
        entityIdToSlot:  Map<number, number>,
        objectUboBuffer: GPUBuffer,
    ): void {
        this.orchestrator.encodeSyncPasses(commandEncoder, entityIdToSlot, objectUboBuffer);
    }

    // ── Configuração ──────────────────────────────────────────────────────────

    public addForce(force: Force): void {
        this.orchestrator.addForce(force);
    }

    public removeForce(id: string): void {
        this.orchestrator.removeForce(id);
    }

    /** No-op — engine GPU-only não usa solvers CPU. */
    public setSolver(_physicType: string, _solver: PhysicsSolver): void {
        this.log.warn('setSolver() ignorado: engine é GPU-only. Configure os passes via PhysicsSceneConfig.');
    }

    public removeSolver(_physicType: string): void { /* no-op */ }
}
