import { EngineBindGroup } from '../resources/EngineBindGroup';

export interface BindGroupManager {
    getLayout(id: string, entries: GPUBindGroupLayoutEntry[]): GPUBindGroupLayout;
    getBindGroup(id: string, layoutId: string, entries: GPUBindGroupEntry[]): EngineBindGroup;
    clearCache(): void;
}
