import { WebGPUContext } from '../context/WebGPUContext';
import { EngineBindGroup } from './EngineBindGroup';
import type { BindGroupManager } from '../interfaces/BindGroupManager';

/**
 * Cache dinâmico para evitar a recriação de lixo de memória de GPUBindGroup todo frame.
 */
export class WebGPUBindGroupManager implements BindGroupManager {
    private context: WebGPUContext;
    private bindGroupLayouts: Map<string, GPUBindGroupLayout>;
    private bindGroups: Map<string, EngineBindGroup>;

    constructor() {
        this.context = WebGPUContext.getInstance();
        this.bindGroupLayouts = new Map();
        this.bindGroups = new Map();
    }

    public getLayout(id: string, entries: GPUBindGroupLayoutEntry[]): GPUBindGroupLayout {
        if (!this.bindGroupLayouts.has(id)) {
            const layout = this.context.device.createBindGroupLayout({
                label: `BindGroupLayout_${id}`,
                entries: entries
            });
            this.bindGroupLayouts.set(id, layout);
        }
        return this.bindGroupLayouts.get(id)!;
    }

    public getBindGroup(id: string, layoutId: string, entries: GPUBindGroupEntry[]): EngineBindGroup {
        // Implementação simplificada de Hash (idealmente validaria o conteúdo das entries)
        const hashId = `${layoutId}_${id}`;

        if (!this.bindGroups.has(hashId)) {
            const layout = this.bindGroupLayouts.get(layoutId);
            if (!layout) {
                throw new Error(`BindGroupLayout ${layoutId} não encontrado antes de criar o BindGroup.`);
            }

            const rawBindGroup = this.context.device.createBindGroup({
                label: `BindGroup_${hashId}`,
                layout: layout,
                entries: entries
            });
            const engineBg = new EngineBindGroup(`BindGroup_${hashId}`, rawBindGroup, layoutId);
            this.bindGroups.set(hashId, engineBg);
        }

        return this.bindGroups.get(hashId)!;
    }

    public clearCache(): void {
        this.bindGroups.clear();
        this.bindGroupLayouts.clear();
    }
}
