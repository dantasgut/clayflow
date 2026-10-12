import type { Frame, RenderTarget } from '../../core/contracts/index';
import { LegacyFlow as Flow } from './LegacyFlow';

/** Base de migração (spec 006) do contrato anterior de render — sai com o último estágio migrado. */
export abstract class LegacyRenderFlow extends Flow {
    abstract resolveTarget(): RenderTarget;
    abstract recordRenderPass(frame: Frame, target: RenderTarget): void;

    override dispatch(frame: Frame): void {
        const target = this.resolveTarget();
        this.recordRenderPass(frame, target);
    }
}
