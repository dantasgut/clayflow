import type { ColorAttachment, Frame, TextureViewSpec } from '../../core/contracts/index';
import { Flow } from './Flow';
import type { BoundTarget, SlotMap, TargetSlot } from './slots';

/** Slots de um `RenderFlow`: incluem o alvo de render (`target`). */
export type RenderSlotMap = SlotMap & {
    /** Alvo de render (canvas, cor da cena, profundidade). */
    readonly target: TargetSlot;
};

/**
 * Flow de render: o alvo (`slots.target`) é um slot como os demais — o canvas do quadro, a cor da cena
 * (`FrameTargets`) ou a profundidade de um `ShadowMap` —, resolvido pela C2 e recriado com o canvas (FR-005).
 */
export abstract class RenderFlow<
    TSlots extends RenderSlotMap = RenderSlotMap,
    S extends string = string,
> extends Flow<TSlots, S> {
    /** View de cor do alvo resolvido neste quadro (`frame.canvasView` para o canvas; `undefined` sem cor). */
    protected colorView(frame: Frame, target: BoundTarget): TextureViewSpec | undefined {
        if (target.color === 'none') return undefined;
        return target.color === 'canvas' ? frame.canvasView : target.color;
    }

    /**
     * Anexo de cor do alvo (spec 008): com amostras (MSAA), desenha na textura de amostras — guardada, para um passe
     * seguinte carregar — e resolve na cor; sem elas, desenha direto na cor. `undefined` sem cor.
     */
    protected colorAttachment(
        frame: Frame,
        target: BoundTarget,
        load:
            | { readonly loadOp: 'load' }
            | {
                  readonly loadOp: 'clear';
                  readonly clearValue: readonly [number, number, number, number];
              },
    ): ColorAttachment | undefined {
        const color = this.colorView(frame, target);
        if (color === undefined) return undefined;
        if (target.samples === undefined) return { view: color, storeOp: 'store', ...load };
        return { view: target.samples, resolveTarget: color, storeOp: 'store', ...load };
    }
}
