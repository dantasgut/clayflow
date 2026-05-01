import type { ProfilerTimestampWrites } from '../Profiler';
import type { ColorAttachment } from './ColorAttachment';
import type { DepthStencilAttachment } from './DepthStencilAttachment';

export interface RenderTarget {
    readonly colorAttachments: readonly ColorAttachment[];
    readonly depthStencilAttachment?: DepthStencilAttachment;
    readonly maxDrawCount?: number;
    /**
     * Opt-in: timestamp queries no início/fim do pass. O Profiler aloca o QuerySet;
     * o flow obtém os índices via `core.profiler.timestampWritesFor(first, last)`.
     * Ignorado se a feature `timestamp-query` não está habilitada no device.
     */
    readonly timestampWrites?: ProfilerTimestampWrites;
}
