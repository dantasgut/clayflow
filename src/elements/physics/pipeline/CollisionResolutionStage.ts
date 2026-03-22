import type { PhysicsStage }        from '../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext } from '../../../scene/systems/PhysicsStageContext';
import type { CollisionResolver }   from '../../../scene/systems/resolution/CollisionResolver';
import type { ResolutionConfig }    from '../../../scene/systems/resolution/ResolutionConfig';
import { ResolutionType }           from '../../../scene/systems/resolution/ResolutionType';
import { ImpulseResolver }          from '../resolution/ImpulseResolver';
import { SequentialImpulseResolver } from '../resolution/SequentialImpulseResolver';

/**
 * Estágio 4 do pipeline de física — Resolução de colisões (Strategy — GoF).
 *
 * Recebe `ResolutionConfig`, instancia o `CollisionResolver` adequado e
 * delega a ele a resolução de todos os contatos do frame.
 *
 * O resolver é um detalhe de implementação interno — não há API pública
 * que o usuário precise acessar, ao contrário do CollisionDispatcher.
 */
export class CollisionResolutionStage implements PhysicsStage {
    private readonly resolver: CollisionResolver;

    constructor(config: ResolutionConfig = {}) {
        switch (config.type ?? ResolutionType.SEQUENTIAL_IMPULSE) {
            case ResolutionType.IMPULSE:
                this.resolver = new ImpulseResolver(config);
                break;
            default:
                this.resolver = new SequentialImpulseResolver(config);
        }
    }

    public execute(context: PhysicsStageContext, dt: number): void {
        this.resolver.resolve(context, dt);
    }
}
