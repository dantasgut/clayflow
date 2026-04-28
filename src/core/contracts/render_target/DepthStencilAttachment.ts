import type { TextureViewSpec } from '../specs/TextureViewSpec';

export interface DepthStencilAttachment {
    readonly view: TextureViewSpec;
    readonly depthClearValue?: number;
    readonly depthLoadOp?: 'load' | 'clear';
    readonly depthStoreOp?: 'store' | 'discard';
    readonly depthReadOnly?: boolean;
    readonly stencilClearValue?: number;
    readonly stencilLoadOp?: 'load' | 'clear';
    readonly stencilStoreOp?: 'store' | 'discard';
    readonly stencilReadOnly?: boolean;
}
