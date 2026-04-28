import type { VertexAttribute } from './VertexAttribute';

export interface VertexBufferLayout {
    readonly arrayStride: number;
    readonly stepMode?: 'vertex' | 'instance';
    readonly attributes: readonly VertexAttribute[];
}
