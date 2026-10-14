import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { WireframeMaterialSchema } from './WireframeMaterialSchema';
import { wire } from './shaders';
import { Material } from './Material';

/** Dado de um `WireframeMaterial` (layout de `WireframeMaterial.schema`). */
export interface WireframeMaterialData {
    color: number[];
    lineWidth: number;
    _pad0: number;
    _pad1: number;
    _pad2: number;
}

/**
 * Material de arame (spec 008; o desenho do legado na arquitetura atual): desenha as **arestas da geometria** (descritor
 * `wireEdges`, em espaço de objeto — as de feição, sem as diagonais de faces planas) como linhas de `lineWidth` pixels,
 * com borda suavizada. Sem iluminação e sem sombra (`castsShadow` falso por padrão).
 */
export class WireframeMaterial extends Material<WireframeMaterialData> {
    /** StructSchema do WireframeMaterial (cor + espessura em pixels). */
    static readonly schema = WireframeMaterialSchema;

    constructor(values: Partial<Pick<WireframeMaterialData, 'color' | 'lineWidth'>> = {}) {
        super();
        this.data = {
            color: values.color ?? [1, 1, 1, 1],
            lineWidth: values.lineWidth ?? 2,
            _pad0: 0,
            _pad1: 0,
            _pad2: 0,
        };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'material',
                role: 'storage-ro',
                schema: WireframeMaterial.schema,
                storage: 'pool',
            },
        ];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [
            {
                id: 'pipeline_wireframe',
                role: 'render',
                shader: wire,
                entryPoints: ['vs_main', 'fs_main'],
                consumes: [
                    'CameraMatrices',
                    'WorldTransform',
                    'Renderable',
                    'RenderInstance',
                    WireframeMaterial.schema.name,
                ],
                topology: 'line-list',
            },
        ];
    }
}
