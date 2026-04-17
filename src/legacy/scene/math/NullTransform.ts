import { Transform } from './Transform';

/**
 * Null Object para Transform (GoF Null Object Pattern).
 * Entidades sem Transform retornam este sentinel em vez de null,
 * eliminando verificações defensivas nos sistemas consumidores.
 *
 * Nunca adicione este objeto a uma Entity — ele é apenas um valor padrão de leitura.
 */
class NullTransformImpl extends Transform {
    public onMatrixUpdate(_cb: (worldMatrix: import('gl-matrix').mat4) => void): () => void {
        return () => {};
    }

    public updateWorldMatrix(_updateParents?: boolean, _updateChildren?: boolean): void {}
}

export const NULL_TRANSFORM: Transform = new NullTransformImpl();
