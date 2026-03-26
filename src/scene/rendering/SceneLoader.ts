import type { Scene }  from '../core/Scene';
import type { Entity } from '../core/Entity';

/**
 * Classe base abstrata para loaders que iteram a cena e processam recursos.
 * Fatoração comum entre ResourceLoader e PhysicsResourceLoader.
 *
 * Camada 2 — sem dependência de Camada 1 (WebGPU) ou Camada 3 (implementações).
 */
export abstract class SceneLoader<TManager> {

    public load(scene: Scene, manager: TManager): void {
        scene.traverse((entity: Entity) => {
            if (!entity.visible) return;
            for (const resource of this.getResources(entity)) {
                this.process(resource, manager);
            }
        });
    }

    /** Retorna os recursos relevantes de uma entidade. */
    protected abstract getResources(entity: Entity): Iterable<unknown>;

    /** Processa um recurso individual com o manager fornecido. */
    protected abstract process(resource: unknown, manager: TManager): void;
}
