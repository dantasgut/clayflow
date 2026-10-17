import { Entity } from '../../../scene/contracts/Entity';
import { ResourceState } from '../../../scene/contracts/ResourceState';
import type { Resource } from '../../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';

/** Lado da tabela DFG (texels por eixo). */
export const PBR_DFG_SIZE = 32;

/**
 * Tabelas pré-integradas do sombreamento físico (Camada 3, spec 011): a DFG `rgba16float` 32×32 — por (n·v, rugosidade),
 * o especular de F0 = 1 separado em E = F0·A + B e o albedo do sheen — que compensa o múltiplo espalhamento e fecha a
 * energia entre as camadas. Gerada na GPU uma vez pelo `PbrTablesFlow` (sem arquivo binário) e lida pelo avaliador do
 * fechamento (`pbr_dfg`, `pbr_sampler`). Uma por cena, inserida pelos estágios padrão.
 */
export class PbrTables extends Entity<Record<string, never>> implements Resource {
    /** Identidade das tabelas na cena (o World indexa pelo schema); sem dados de CPU. */
    static readonly schema = new StructSchema('PbrTables', { _unused: FieldType.u32 });

    state: ResourceState = ResourceState.Uninitialized;

    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'dfg',
                role: 'storage-texture',
                textureShape: {
                    format: 'rgba16float',
                    width: PBR_DFG_SIZE,
                    height: PBR_DFG_SIZE,
                    access: 'write-only',
                },
            },
            {
                id: 'sampler',
                role: 'sampler',
                samplerShape: {
                    magFilter: 'linear',
                    minFilter: 'linear',
                    addressModeU: 'clamp-to-edge',
                    addressModeV: 'clamp-to-edge',
                },
            },
        ];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
