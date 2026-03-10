import { Material } from '../../scene/components/Material';
import type { IResourceManager } from '../../core/interfaces/IResourceManager';

/**
 * Interface OCP para fabricação de Materiais (Camada 3).
 * Um Material Builder é responsável por registrar o Pipeline (Shader)
 * e alocar as variáveis Uniforms no BindGroup, retornando o Componente leve.
 */
export interface IMaterialBuilder {
    build(resourceManager: IResourceManager): Material;
}
