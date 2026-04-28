import type { Frame, RenderTarget } from '../../core/contracts/index';
import { Flow } from './Flow';

export abstract class RenderFlow extends Flow {
    abstract resolveTarget(): RenderTarget;
    abstract recordRenderPass(frame: Frame, target: RenderTarget): void;

    override dispatch(frame: Frame): void {
        const target = this.resolveTarget();
        this.recordRenderPass(frame, target);
    }
}
