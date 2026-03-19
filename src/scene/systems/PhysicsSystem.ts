import type { Scene } from '../core/Scene';
import type { Entity } from '../core/Entity';
import type { PhysicsBody } from '../components/physics/PhysicsBody';
import { PhysicsWorld } from './PhysicsWorld';

/**
 * Sistema de Física e Dinâmica (Camada 2).
 *
 * Orquestra a extração de corpos físicos da cena e delega toda
 * a simulação ao PhysicsWorld (Mediator), que por sua vez usa os
 * solvers registrados (Bridge) e despacha eventos (Observer).
 *
 * @example
 * const physics = new PhysicsSystem(world);
 * physics.update(scene, encoder, dt);
 */
export class PhysicsSystem {
    private readonly _world: PhysicsWorld;

    constructor(world: PhysicsWorld) {
        this._world = world;
    }

    public get world(): PhysicsWorld {
        return this._world;
    }

    /**
     * Extrai corpos físicos da cena, registra os novos no PhysicsWorld
     * e avança a simulação por `dt` segundos.
     */
    public update(scene: Scene, encoder: GPUCommandEncoder, dt: number): void {
        this._world.clear();

        scene.traverse((entity: Entity) => {
            if (!entity.visible) return;
            for (const physic of entity.getPhysics()) {
                this._world.register(entity, physic as unknown as PhysicsBody);
            }
        });

        this._world.step(encoder, dt);
    }
}
