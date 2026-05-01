export interface RenderState {
    viewport(
        x: number,
        y: number,
        width: number,
        height: number,
        minDepth: number,
        maxDepth: number,
    ): this;
    scissor(x: number, y: number, width: number, height: number): this;
    blendConstant(color: readonly [number, number, number, number]): this;
    stencilReference(reference: number): this;
}
