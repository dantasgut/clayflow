import { mat4 } from 'gl-matrix';
import type { Component } from '../core/Component';
import type { Entity } from '../core/Entity';
import { ResourceType } from '../core/ResourceType';

/**
 * A Câmera Virtual. (Camada 2 - Representação)
 * Componente ECS Puro que calcula as matrizes de visão e projeção a partir do Transform da Entidade dona.
 */
export class Camera implements Component {
    public readonly layer = ResourceType.VISUAL_COMPONENT;
    public readonly type: string = 'Camera';

    // A matriz que transforma o mundo 3D chapado para a tela 2D (A Perspectiva)
    public projectionMatrix: mat4 = mat4.create();

    // A Inversa da WorldMatrix da câmera (Como a cena é vista do ponto de vista dela)
    public viewMatrix: mat4 = mat4.create();

    // Cache combinado para a GPU (Projection * View)
    public viewProjectionMatrix: mat4 = mat4.create();

    // Opcional: Referência à Entidade dona
    public owner: Entity | null = null;
    private _transformCallback: ((worldMatrix: mat4) => void) | null = null;

    constructor() {
        // No longer extends Entity, so no super() call
    }

    public onAttach(entity: Entity): void {
        this.owner = entity;
        this._transformCallback = (worldMatrix: mat4) => {
            this.updateViewMatrix(worldMatrix);
        };
        this.owner.transform.onUpdateMatrixCallbacks.push(this._transformCallback);
        // Atualiza a view matrix inicial baseada no transform atual da Entidade
        this.updateViewMatrix(this.owner.worldMatrix);
    }

    public onDetach(entity: Entity): void {
        if (this.owner && this._transformCallback) {
            const callbacks = this.owner.transform.onUpdateMatrixCallbacks;
            const index = callbacks.indexOf(this._transformCallback);
            if (index !== -1) {
                callbacks.splice(index, 1);
            }
        }
        this.owner = null;
        this._transformCallback = null;
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
