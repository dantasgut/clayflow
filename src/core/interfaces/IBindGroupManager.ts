import { EngineBindGroup } from '../resources/EngineBindGroup';

export interface IBindGroupManager {
    getLayout(id: string, entries: GPUBindGroupLayoutEntry[]): GPUBindGroupLayout;
    getBindGroup(id: string, layoutId: string, entries: GPUBindGroupEntry[]): EngineBindGroup;
    clearCache(): void;
}
