import type { IComponent } from '../core/Entity';

/**
 * Componente Lógico (ECS) representando a aparência (Shader + Material Data) do Nó.
 * Guarda a Hash pro PipelineManager (Camada 1) e Dicionário de Cores para o Extrator montar o GPUBindGroup.
 */
export class Material implements IComponent {
    public readonly type: string = 'Material';
    
    // O Mestre: O ID do Shader que este material usará (Ex: "ThickLineShader", "ParametricGridDefault")
    public shaderId: string;
    
    // Se False, desenha Frente-Pra-Trás (Fast Z-Testing). Se True, desenha Trás-Pra-Frente (Blending).
    public transparent: boolean = false;
    
    // Lista de Bind Groups customizáveis (ex: textura_01, cor_difusa) associados a esta instância de material
    public bindGroupIds: string[] = [];

    // Estratégia de Cull Mode (Face Traseira) e Topology (Lines, Triangles)
    public doubleSided: boolean = false;
    public topology: GPUPrimitiveTopology = 'triangle-list';

    constructor(shaderId: string) {
        this.shaderId = shaderId;
    }
}
