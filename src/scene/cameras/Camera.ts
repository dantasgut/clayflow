import { mat4 } from 'gl-matrix';
import type { Component } from '../core/Component';
import type { Entity } from '../core/Entity';
import { ResourceType } from '../core/ResourceType';
import type { Transform } from '../math/Transform';

/**
 * A Câmera Virtual. (Camada 2 - Representação)
 * Componente ECS Puro que calcula as matrizes de visão e projeção a partir do Transform da Entidade dona.
 */
export class Camera implements Component {
    public readonly layer = ResourceType.VISUAL_COMPONENT;
    public readonly type: string = 'Camera';

    public projectionMatrix: mat4 = mat4.create();
    public viewMatrix: mat4 = mat4.create();
    public viewProjectionMatrix: mat4 = mat4.create();

    public owner: Entity | null = null;
    private _unsubscribeTransform: (() => void) | null = null;

    public onAttach(entity: Entity): void {
        this.owner = entity;
        const transform = entity.getComponent<Transform>('Transform');
        if (transform) {
            this._unsubscribeTransform = transform.onMatrixUpdate((worldMatrix) => {
                this._updateViewMatrix(worldMatrix);
            });
            this._updateViewMatrix(transform.worldMatrix);
        }
    }

    public onDetach(_entity: Entity): void {
        this._unsubscribeTransform?.();
        this._unsubscribeTransform = null;
        this.owner = null;
    }

    /**
     * Perspectiva com Z-range [0, 1] correto para WebGPU.
     */
    public setPerspective(fovY: number, aspect: number, near: number, far: number): void {
        mat4.perspectiveZO(this.projectionMatrix, fovY, aspect, near, far);
    }

    public setOrthographic(left: number, right: number, bottom: number, top: number, near: number, far: number): void {
        mat4.orthoZO(this.projectionMatrix, left, right, bottom, top, near, far);
    }

    private _updateViewMatrix(worldMatrix: mat4): void {
        mat4.invert(this.viewMatrix, worldMatrix);
        mat4.multiply(this.viewProjectionMatrix, this.projectionMatrix, this.viewMatrix);
    }
}
