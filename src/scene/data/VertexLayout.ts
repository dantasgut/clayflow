/**
 * Tamanhos primitivos de dados permitidos em nossos atributos de Vértice.
 * Convertendo a tipagem WebGPU para os byteLengths correspondentes em Float32Array
 */
export type VertexFormatType = 
    | 'float32'   // 1 float (4 bytes)
    | 'float32x2' // 2 floats (8 bytes) - ex: UVs
    | 'float32x3' // 3 floats (12 bytes) - ex: Posições 3D, Normais
    | 'float32x4' // 4 floats (16 bytes) - ex: Cores RGBA
    | 'uint32'
    | 'int32';

export interface VertexAttributeDescriptor {
    name: string;        // O nome lógico pro usuário cruzar no Shader
    format: VertexFormatType;
    shaderLocation: number; // O @location() no WGSL
}

export interface ComputedVertexAttribute extends VertexAttributeDescriptor {
    byteOffset: number; // Calculado magicamente pela classe
}

/**
 * Calculador Dinâmico de Layout Geomêtrico.
 * Remove a necessidade de hardcodar `stride` e matematícas de offset nos Arrays.
 */
export class VertexLayout {
    public readonly attributes: ComputedVertexAttribute[];
    public readonly stride: number;
    
    constructor(descriptors: VertexAttributeDescriptor[]) {
        this.attributes = [];
        let currentOffset = 0;

        for (const desc of descriptors) {
            this.attributes.push({
                ...desc,
                byteOffset: currentOffset
            });

            currentOffset += this.getSizeFromFormat(desc.format);
        }

        this.stride = currentOffset;
    }

    private getSizeFromFormat(format: VertexFormatType): number {
        switch (format) {
            case 'float32':
            case 'uint32':
            case 'int32':
                return 4;
            case 'float32x2':
                return 8;
            case 'float32x3':
                return 12;
            case 'float32x4':
                return 16;
            default:
                throw new Error(`[VertexLayout] Formato de atributo desconhecido: ${format}`);
        }
    }

    /**
     * Gera o Layout nativo para ser inserido direto na criação da Pipeline WebGPU
     */
    public getGPUVertexBufferLayout(stepMode: GPUVertexStepMode = 'vertex'): GPUVertexBufferLayout {
        return {
            arrayStride: this.stride,
            stepMode: stepMode,
            attributes: this.attributes.map(attr => ({
                format: attr.format as GPUVertexFormat,
                offset: attr.byteOffset,
                shaderLocation: attr.shaderLocation
            }))
        };
    }
}
