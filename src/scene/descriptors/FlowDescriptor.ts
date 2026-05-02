/**
 * FlowDescriptor declara qual flow integra um Resource. Usado por
 * Resources que querem auto-roteamento (RigidBody → LCPFlow ou XPBDFlow,
 * SoftBody → XPBDFlow/FEMFlow/MPMFlow, etc.).
 *
 * O FlowRegistry mapeia `bodyType` → flow concreto; o FlowDescriptor
 * é a "request" do Resource ("integrar-me com algoritmo X").
 */
export interface FlowDescriptor {
    /** Nome do algoritmo (e.g. 'LCP', 'XPBD', 'SPH', 'MPM'). */
    readonly algorithm: string;
    /** BodyType chave usada pelo FlowRegistry (e.g. 'RigidBody', 'SoftBody'). */
    readonly bodyType: string;
}
