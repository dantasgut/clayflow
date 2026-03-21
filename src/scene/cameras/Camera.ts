import { mat4 } from 'gl-matrix';
import type { Component } from '../core/Component';
import type { Entity } from '../core/Entity';
import { ResourceType } from '../core/ResourceType';
import type { Transform } from '../math/Transform';

/**
 * Componente interno de câmera. (Camada 2 - não exportado na API pública)
 * Calcula as matrizes de visão e projeção a partir do Transform da Entidade dona.
 * O usuário interage com PerspectiveCamera / OrthographicCamera da camada 3.
 */
export class CameraComponent implements Component {
    public readonly layer = ResourceType.VISUAL_COMPONENT;
    public readonly type: string = 'CameraComponent';

    public projectionMatrix: mat4 = mat4.create();
    public viewMatrix: mat4 = mat4.create();
    public viewProjectionMatrix: mat4 = mat4.create();

    public owner: Entity | null = null;
    private unsubscribeTransform: (() => void) | null = null;

    public onAttach(entity: Entity): void {
        this.owner = entity;
        const transform = entity.getComponent<Transform>('Transform');
        if (transform) {
            this.unsubscribeTransform = transform.onMatrixUpdate((worldMatrix) => {
                this.updateViewMatrix(worldMatrix);
            });
            this.updateViewMatrix(transform.worldMatrix);
        }
    }

    public onDetach(_entity: Entity): void {
        this.unsubscribeTransform?.();
        this.unsubscribeTransform = null;
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

    private updateViewMatrix(worldMatrix: mat4): void {
        mat4.invert(this.viewMatrix, worldMatrix);
        mat4.multiply(this.viewProjectionMatrix, this.projectionMatrix, this.viewMatrix);
    }
}
