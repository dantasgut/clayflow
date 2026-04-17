import { Material } from '../../scene/components/Material';

export interface StandardMaterialOptions {
    color?: [number, number, number, number];
    emissive?: [number, number, number];
    roughness?: number;
    metallic?: number;
}

/**
 * Material Padrão Simples da Camada 3.
 * É um Builder que configura as propriedades iniciais na RAM.
 */
export class StandardMaterial extends Material {
    public color: [number, number, number, number];
    public emissive: [number, number, number];
    public roughness: number;
    public metallic: number;

    constructor(options: StandardMaterialOptions = {}) {
        super();
        this.color = options.color || [1.0, 1.0, 1.0, 1.0];
        this.emissive = options.emissive || [0.0, 0.0, 0.0];
        this.roughness = options.roughness !== undefined ? options.roughness : 0.5;
        this.metallic = options.metallic !== undefined ? options.metallic : 0.0;
        
        this.buildUniforms();
    }

    private buildUniforms(): void {
        this.shaderId = 'std_pipeline_hash'; 
        
        // Float32Array: Vec4 (Color) + Vec3 (Emissive) + 1 PAD + float (R) + float (M) + 2 PAD = 12 floats
        const uniformData = new Float32Array([
            ...this.color,                    // offset 0: vec4 color
            ...this.emissive, 1.0,            // offset 4: vec3 emissive (com 1.0 de padding pq std140 precisa alinhar a 16bytes)
            this.roughness, this.metallic, 0, 0 // offset 8: floats
        ]);

        // Define a Regra Lógica (Schema) para a Camada 1 criar o BindGroupLayout
        this.bindGroupSchema = [
            {
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: { type: 'uniform' }
            }
        ];

        this.rawUniforms.set('std_mat_buf', uniformData);
    }
}
