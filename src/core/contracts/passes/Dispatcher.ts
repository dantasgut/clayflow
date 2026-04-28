import type { IndirectBufferSpec } from '../specs/IndirectBufferSpec';

export interface Dispatcher {
    workgroups(x: number, y?: number, z?: number): this;
    workgroupsIndirect(spec: IndirectBufferSpec, offset?: number): this;
}
