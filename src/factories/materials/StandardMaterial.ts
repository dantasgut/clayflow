import { Material } from '../../scene/components/Material';
import type { IResourceManager } from '../../core/interfaces/IResourceManager';
import type { IMaterialBuilder } from './IMaterialBuilder';

export interface StandardMaterialOptions {
    color?: [number, number, number, number];
    emissive?: [number, number, number];
    roughness?: number;
    metallic?: number;
}

/**
 * Material Padrão Simples da Camada 3.
 * Configura cor e propriedades para renderização clássica (PBR básico ou unlit).
 */
export class StandardMaterial implements IMaterialBuilder {
    public color: [number, number, number, number];
    public emissive: [number, number, number];
    public roughness: number;
    public metallic: number;

    constructor(options: StandardMaterialOptions = {}) {
        this.color = options.color || [1.0, 1.0, 1.0, 1.0];
        this.emissive = options.emissive || [0.0, 0.0, 0.0];
        this.roughness = options.roughness !== undefined ? options.roughness : 0.5;
        this.metallic = options.metallic !== undefined ? options.metallic : 0.0;
    }

    public build(resourceManager: IResourceManager): Material {
        // [1] SOLICITA O PIPELINE (WebGPU Shader) na Camada 1
        // (Assumindo que resourceManager.pipelines gerencia isso via hashes)
        const pipelineId = 'std_pipeline_hash'; 
        
        // [2] ALOCA UM UNIFORM BUFFER para as propriedades deste material
        // Float32Array: Vec4 (Color) + Vec3 (Emissive) + 1 PAD + float (R) + float (M) + 2 PAD = 12 floats
        const uniformData = new Float32Array([
            ...this.color,                    // offset 0: vec4 color
            ...this.emissive, 1.0,            // offset 4: vec3 emissive (com 1.0 de padding pq std140 precisa alinhar a 16bytes)
            this.roughness, this.metallic, 0, 0 // offset 8: floats
        ]);

        const uniformBuffer = resourceManager.buffers.createUniformBuffer('std_mat_buf', uniformData.byteLength);
        resourceManager.buffers.writeBuffer('std_mat_buf', uniformData);

        // [3] CRIA O BIND GROUP ESTRUTURAL
        // Vincula o uniform buffer na signature do Shader
        const bindGroup = resourceManager.bindings.getBindGroup('std_mat_bg', pipelineId, [
            { binding: 0, resource: { buffer: uniformBuffer.native } }
        ]);

        // Retorna a entidade lógica abstrata pra Camada 2
        const mat = new Material(pipelineId);
        mat.bindGroupIds.push(bindGroup.id);
        return mat;
    }
}
