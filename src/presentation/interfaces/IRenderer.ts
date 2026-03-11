import type { Scene } from '../../scene/core/Scene';
import type { Camera } from '../../scene/cameras/Camera';

/**
 * Contrato abstrato (Camada 4) para qualquer tipo de Motor de Apresentação.
 * Separa a lógica da Cena da API gráfica final.
 */
export interface IRenderer {
    /**
     * Ciclo principal: Renderiza a Cena dada a perspectiva da Câmera.
     * @param scene A árvore de entidades (Camada 2).
     * @param camera O observador e projetor.
     */
    render(scene: Scene, camera: Camera): Promise<void>;
    
    /**
     * Define o tamanho físico da tela de saída.
     */
    setSize(width: number, height: number): void;
    
    /**
     * Define a cor base de limpeza do fundo.
     */
    setClearColor(r: number, g: number, b: number, a: number): void;
}
