/** Contrato de upload CPU → GPU para RBSimParams (uniform buffer). */
export interface RBSimParamsData {
    gravity:              readonly [number, number, number];
    dt:                   number;
    bodyCount:            number;
    colliderCount:        number;
    maxContacts:          number;
    solveIterations:      number;
    restitution:          number;
    penetrationSlop:      number;
    linearDamping:        number;
    angularDamping:       number;
    predictiveThreshold:  number;
    restitutionThreshold: number;
    baumgarteBeta:        number;
    warmStartFactor:      number;
}
