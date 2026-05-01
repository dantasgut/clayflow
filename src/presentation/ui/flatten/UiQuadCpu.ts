/**
 * Quadrilátero plano em coordenadas de tela, intermediário entre o `UiTree`
 * (modelo) e o GPU buffer (`UiGpuPipeline`). Gerado por `UiFlattener` /
 * `UiTextLayout`.
 *
 * Layout binário em GPU (16 floats / 64B por quad — ver UiGpuPipeline.upload):
 *   rect.xy = position, rect.zw = size
 *   color.rgba
 *   uv.xy = top-left, uv.zw = bottom-right (coordenadas normalizadas 0..1)
 *   textured: 0 = cor sólida, 1 = sample no atlas
 */
export interface UiQuadCpu {
    rect: [number, number, number, number];
    color: [number, number, number, number];
    uv: [number, number, number, number];
    textured: number;
}
