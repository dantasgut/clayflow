import type { Scene }  from '../../scene/core/Scene';
import type { Camera } from '../../elements/cameras/Camera';

/**
 * Contrato abstrato (Camada 4) para qualquer tipo de Motor de Apresentação.
 * Separa a lógica da Cena da API gráfica final.
 *
 * O usuário nunca toca na Camada 1 (WebGPUEngineCore, device, queue, etc.).
 * Toda a inicialização de hardware é feita aqui dentro.
 */
export interface Renderer {
    /**
     * Inicializa o backend gráfico e adquire o device da GPU.
     * Deve ser chamado uma vez antes do primeiro render().
     * @param canvas O elemento <canvas> do DOM.
     */
    initialize(canvas: HTMLCanvasElement): Promise<void>;

    /**
     * Ciclo principal: renderiza a cena pela perspectiva da câmera.
     */
    render(scene: Scene, camera: Camera): Promise<void>;

    /**
     * Define o tamanho físico da tela de saída.
     */
    setSize(width: number, height: number): void;

    /**
     * Define a cor de fundo.
     */
    setClearColor(r: number, g: number, b: number, a: number): void;
}
