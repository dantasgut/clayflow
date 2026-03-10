/**
 * Tipos numéricos primitivos aceitos nos blocos Uniformes da WebGPU (WGSL std140).
 */
export type UniformType = 
    | 'f32'   // 1 float (Alinhamento 4 bytes)
    | 'i32'   // 1 int (Alinhamento 4 bytes)
    | 'u32'   // 1 uint (Alinhamento 4 bytes)
    | 'vec2f' // 2 floats (Alinhamento 8 bytes)
    | 'vec3f' // 3 floats (Alinhamento 16 bytes!) - Perigo comum no WGSL
    | 'vec4f' // 4 floats (Alinhamento 16 bytes)
    | 'mat4x4f'; // 16 floats (Alinhamento 16 bytes, total 64 bytes)

export interface UniformDescriptor {
    name: string;
    type: UniformType;
}

export interface ComputedUniformField extends UniformDescriptor {
    byteOffset: number;
    byteSize: number;
}

/**
 * Calculador Autônomo de std140 para WGSL Uniforms.
 * Previne "Memory Leaks de visualização" onde variáveis da CPU e GPU
 * saem de sintonia devido ao preenchimento invisível em blocos de 16 bytes.
 */
export class UniformSchema {
    public readonly fields: ComputedUniformField[];
    public readonly byteSize: number;

    constructor(descriptors: UniformDescriptor[]) {
        this.fields = [];
        let currentOffset = 0;

        for (const desc of descriptors) {
            const align = this.getAlignment(desc.type);
            const size = this.getSize(desc.type);

            // Regra crucial do std140: se o offset atual não é múltiplo do alinhamento exigido,
            // adicionamos buracos vazios (Padding) até ele se alinhar
            const padding = (align - (currentOffset % align)) % align;
            currentOffset += padding;

            this.fields.push({
                ...desc,
                byteOffset: currentOffset,
                byteSize: size
            });

            currentOffset += size;
        }

        // Adicional std140: O bloco inteiro deve ser múltiplo de 16
        const paddingEnd = (16 - (currentOffset % 16)) % 16;
        currentOffset += paddingEnd;

        this.byteSize = currentOffset;
    }

    private getAlignment(type: UniformType): number {
        switch (type) {
            case 'f32': case 'i32': case 'u32': return 4;
            case 'vec2f': return 8;
            // vec3f exige um alinhamento de 16 bytes na especificação WebGPU (std140 via SPIR-V/WGSL)
            case 'vec3f': case 'vec4f': case 'mat4x4f': return 16; 
            default: throw new Error(`[UniformSchema] Tipo Uniform desconhecido: ${type}`);
        }
    }

    private getSize(type: UniformType): number {
        switch (type) {
            case 'f32': case 'i32': case 'u32': return 4;
            case 'vec2f': return 8;
            case 'vec3f': return 12; // Repare que o vec3 ocupa fisicamente 12, mas exige alinhamento 16.
            case 'vec4f': return 16;
            case 'mat4x4f': return 64;
            default: throw new Error(`[UniformSchema] Tipo Uniform desconhecido: ${type}`);
        }
    }

    /**
     * Retorna a View Float32 perfeita para você espelhar dados nela
     */
    public createBufferPayload(): Float32Array {
        return new Float32Array(this.byteSize / 4);
    }
}
