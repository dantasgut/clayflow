import type { Entity } from '../core/Entity';
import type { PhysicsBody } from '../components/physics/PhysicsBody';
import type { Collider } from '../components/physics/Collider';
import type { PhysicsSolver } from './solvers/PhysicsSolver';
import type { Force } from './forces/Force';
import type { ResourceManager } from '../../core/interfaces/ResourceManager';

/**
 * Contrato abstrato de um mundo de simulação física.
 *
 * Não faz suposições sobre algoritmo de simulação, broadphase ou espaço.
 * Registro de corpos é event-driven via connectScene/disconnectScene.
 *
 * Implementações concretas:
 *   - `PhysicsWorld`            — configurador de mundo, registro de forças globais.
 *   - `GpuPhysicsOrchestrator`  — orquestrador GPU-only via PhysicsComputePass.
 *
 * @example
 * const world = new GpuPhysicsOrchestrator(config, registry, eventBus, loader);
 * world.connectScene(scene);
 * // No loop de render:
 * world.step(scene, dt);
 */
export abstract class SimulationWorld {
    // ------------------------------------------------------------------
    // Vínculo com a cena — registro event-driven
    // ------------------------------------------------------------------

    /**
     * Conecta o mundo a uma cena: observa child_added e child_removed
     * para registrar/remover corpos e colliders automaticamente.
     * Também registra todos os physics components já presentes na cena.
     */
    public abstract connectScene(scene: Entity): void;

    /** Remove a observação da cena e limpa todos os registros. */
    public abstract disconnectScene(scene: Entity): void;

    // ------------------------------------------------------------------
    // Configuração de simulação
    // ------------------------------------------------------------------

    /**
     * Associa um solver ao tipo de corpo (estratégia por physicType).
     * Em modo GPU-only, implementações podem tratar este método como no-op.
     */
    public abstract setSolver(physicType: string, solver: PhysicsSolver): void;
    public abstract removeSolver(physicType: string): void;

    /** Registra uma força global aplicada a todos os corpos a cada step. */
    public abstract addForce(force: Force): void;
    public abstract removeForce(id: string): void;

    // ------------------------------------------------------------------
    // Passo de simulação
    // ------------------------------------------------------------------

    /**
     * Avança a simulação por `dt` segundos.
     * A implementação decide o pipeline interno (broadphase, narrowphase, integração).
     */
    public abstract step(scene: Entity, dt: number): void;

    /**
     * Opcional — chamado pelo renderer uma vez, após a inicialização do engine GPU
     * (dentro de `initGPUResources`), antes do primeiro `step()`.
     * Injeta o `ResourceManager` para que o mundo possa alocar buffers globais
     * sem acessar o singleton `WebGPUEngineCore` diretamente.
     * Implementado por `GpuPhysicsOrchestrator`; no-op em mundos puramente CPU.
     */
    public initializeResources?(resourceManager: ResourceManager): void;

    /**
     * Opcional — despachado pelo renderer APÓS uploadObjectMatrices e ANTES do render pass.
     * Permite que passes GPU escrevam diretamente no UBO de modelo, sem CPU readback.
     * Implementado por `GpuPhysicsOrchestrator`; no-op em `PhysicsWorld`.
     */
    public encodeSyncPasses?(
        commandEncoder:  GPUCommandEncoder,
        entityIdToSlot:  Map<number, number>,
        objectUboBuffer: GPUBuffer,
    ): void;
}
