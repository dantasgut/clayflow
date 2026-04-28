import type { TextureViewSpec } from '../specs/TextureViewSpec';

export interface ColorAttachment {
    readonly view: TextureViewSpec;
    readonly resolveTarget?: TextureViewSpec;
    readonly clearValue?: readonly [r: number, g: number, b: number, a: number];
    readonly loadOp: 'load' | 'clear';
    readonly storeOp: 'store' | 'discard';
    readonly depthSlice?: number;
}
