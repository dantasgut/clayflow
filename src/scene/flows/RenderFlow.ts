import type { Frame, TextureViewSpec } from '../../core/contracts/index';
import { Flow } from './Flow';
import type { BoundTarget, SlotMap, TargetSlot } from './slots';

/** Slots de um `RenderFlow`: incluem o alvo de render (`target`). */
export type RenderSlotMap = SlotMap & { readonly target: TargetSlot };

/**
 * Flow de render: o alvo (`slots.target`) é um slot como os demais — o canvas do quadro, a cor da cena
 * (`FrameTargets`) ou a profundidade de um `ShadowMap` —, resolvido pela C2 e recriado com o canvas (FR-005).
 */
export abstract class RenderFlow<
    TSlots extends RenderSlotMap = RenderSlotMap,
    S extends string = string,
> extends Flow<TSlots, S> {
    /** View de cor do alvo resolvido neste quadro (`frame.canvasView` para o canvas). */
    protected colorView(frame: Frame, target: BoundTarget): TextureViewSpec {
        return target.color === 'canvas' ? frame.canvasView : target.color;
    }
}
