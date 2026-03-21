import { Entity }                  from '../core/Entity';
import { Scene }                   from '../core/Scene';
import type { ExtractionStrategy } from './strategies/ExtractionStrategy';
import { LightExtractionStrategy } from './strategies/LightExtractionStrategy';
import { MeshExtractionStrategy }  from './strategies/MeshExtractionStrategy';
import type { RenderCommand, RenderQueue, RenderLight } from './RenderQueue';
import { Float32Pool }             from './Float32Pool';
import { vec3 }                    from 'gl-matrix';
import { Loggable }                from '../../core/debug/Loggable';
import { Logger }                  from '../../core/debug/Logger';

/**
 * O Funil (Extrator de Cena).
 * Percorre a Scene orientada a objetos (Camada 2) e gera Arrays Lineares (DoD)
 * para a Camada 3 consumir.
 */
@Loggable('RenderExtractor')
export class RenderExtractor implements RenderQueue {
    declare private readonly log: Logger;
    public readonly opaqueGroups: Map<string, RenderCommand[]> = new Map();
    public readonly transparentList: RenderCommand[] = [];
    public readonly lights: RenderLight[] = [];

    private strategies: ExtractionStrategy[] = [];
    private pool = new Float32Pool();

    constructor() {
        // Registra as estratégias nativas da engine por padrão
        this.addStrategy(new LightExtractionStrategy());
        this.addStrategy(new MeshExtractionStrategy());
    }

    public addStrategy(strategy: ExtractionStrategy): void {
        this.strategies.push(strategy);
    }

    public removeStrategy(strategy: ExtractionStrategy): void {
        const index = this.strategies.indexOf(strategy);
        if (index !== -1) {
            this.strategies.splice(index, 1);
        }
    }

    public clear(): void {
        this.opaqueGroups.clear();
        this.transparentList.length = 0;
        this.lights.length = 0;
        this.pool.reset();
    }

    public acquireFloat32(size: number): Float32Array {
        return this.pool.acquire(size);
    }

    /**
     * O Método Mestre cego. Passa o Rodo na Cena através de Estratégias.
     * Deve ser chamado sempre que uma RenderPass for iniciar.
     */
    public extract(scene: Scene, cameraWorldPos?: vec3): void {
        this.clear();

        // Garante que a matemática global está 100% calculada
        scene.preRenderUpdate();

        scene.traverse((entity: Entity) => {
            if (!entity.visible) return;

            // O Extrator simplesmente cede a Entidade para todos os especialistas registrados
            for (let i = 0; i < this.strategies.length; i++) {
                this.strategies[i]!.extract(entity, this as RenderQueue, cameraWorldPos);
            }
        });

        // Ordenar os transparentes Back-to-Front
        if (this.transparentList.length > 0) {
            this.transparentList.sort((a, b) => b.distanceToCamera - a.distanceToCamera);
        }

        const opaque = [...this.opaqueGroups.values()].reduce((s, g) => s + g.length, 0);
        this.log.debug(`Extração — opaque:${opaque} transparent:${this.transparentList.length} lights:${this.lights.length}`);
    }
}
