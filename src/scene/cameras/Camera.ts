import { Entity } from '../core/Entity';
import { mat4 } from 'gl-matrix';

/**
 * A Câmera Virtual. (Camada 2 - Representação)
 * Estende Entity para podermos movê-la e rotacioná-la pelo mundo livremente.
 */
export class Camera extends Entity {
    public isCamera: boolean = true;

    // A matriz que transforma o mundo 3D chapado para a tela 2D (A Perspectiva)
    public projectionMatrix: mat4 = mat4.create();

    // A Inversa da WorldMatrix da câmera (Como a cena é vista do ponto de vista dela)
    public viewMatrix: mat4 = mat4.create();

    // Cache combinado para a GPU (Projection * View)
    public viewProjectionMatrix: mat4 = mat4.create();

    constructor() {
        super();

        // Em vez de sobrescrever o método do Grafo, a Câmera apenas "escuta" o Transform dela.
        this.transform.onUpdateMatrixCallbacks.push((worldMatrix: mat4) => {
            this.updateViewMatrix(worldMatrix);
        });
    }

    /**
     * Atualiza a Matriz de Perspectiva (Fov, Aspect Ratio, Near, Far)
     */
    public setPerspective(fovY: number, aspect: number, near: number, far: number): void {
        mat4.perspective(this.projectionMatrix, fovY, aspect, near, far);
    }

    /**
     * Atualiza a Matriz Ortográfica (Câmera 2D/Isométrica sem distorção de profundidade)
     */
    public setOrthographic(left: number, right: number, bottom: number, top: number, near: number, far: number): void {
        mat4.ortho(this.projectionMatrix, left, right, bottom, top, near, far);
    }

    /**
     * Chamado automaticamente pelo evento do Transform sempre que a matriz global da câmera for atualizada.
     */
    private updateViewMatrix(worldMatrix: mat4): void {
        // A View Matrix é a inversa da posição global da câmera.
        mat4.invert(this.viewMatrix, worldMatrix);

        // Multiplica Projection * View para o Shader já receber mastigado
        mat4.multiply(this.viewProjectionMatrix, this.projectionMatrix, this.viewMatrix);
    }
}
