import type { ColorAttachment } from './ColorAttachment';
import type { DepthStencilAttachment } from './DepthStencilAttachment';

export interface RenderTarget {
    readonly colorAttachments: readonly ColorAttachment[];
    readonly depthStencilAttachment?: DepthStencilAttachment;
    readonly maxDrawCount?: number;
}
