import type { IndirectBufferSpec } from '../specs/IndirectBufferSpec';

export interface Drawer {
    vertices(count: number, instances?: number, firstVertex?: number, firstInstance?: number): this;
    indexed(
        count: number,
        instances?: number,
        firstIndex?: number,
        baseVertex?: number,
        firstInstance?: number,
    ): this;
    indirect(spec: IndirectBufferSpec, offset?: number): this;
    indexedIndirect(spec: IndirectBufferSpec, offset?: number): this;
}
