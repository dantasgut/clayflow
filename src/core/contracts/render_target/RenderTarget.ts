import type { ProfilerTimestampWrites } from '../Profiler';
import type { ColorAttachment } from './ColorAttachment';
import type { DepthStencilAttachment } from './DepthStencilAttachment';

/**
 * Configuração de um render pass — color attachments + depth-stencil
 * + opções de query. Passado para `frame.render(target, body)` no início
 * de cada pass.
 */
export interface RenderTarget {
    /** Lista de color attachments (multi-render-target). 1+ attachment. */
    readonly colorAttachments: readonly ColorAttachment[];
    /** Depth-stencil attachment (opcional para passes color-only). */
    readonly depthStencilAttachment?: DepthStencilAttachment;
    /** Limite máximo de draw calls neste pass (validation hint). */
    readonly maxDrawCount?: number;
    /**
     * Opt-in: timestamp queries no início/fim do pass. O Profiler aloca o QuerySet;
     * o flow obtém os índices via `core.profiler.timestampWritesFor(first, last)`.
     * Ignorado se a feature `timestamp-query` não está habilitada no device.
     */
    readonly timestampWrites?: ProfilerTimestampWrites;
}
