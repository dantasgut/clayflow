// Tipos do ponto `field` (spec 009): o corpo sobre o qual o campo age — massa inversa, densidade e volume (0 quando o
// solver não tem a grandeza; o empuxo só age com densidade > 0).
// Requer: nada.

struct FieldBody {
    inv_mass: f32,
    density: f32,
    volume: f32,
    _pad0: f32,
}
