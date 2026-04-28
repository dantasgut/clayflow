import type { IndexBufferSpec } from '../specs/IndexBufferSpec';
import type { VertexBufferSpec } from '../specs/VertexBufferSpec';

export interface GeometryBinder {
    vertex(slot: number, spec: VertexBufferSpec, offset?: number, size?: number): this;
    index(spec: IndexBufferSpec, offset?: number, size?: number): this;
}
