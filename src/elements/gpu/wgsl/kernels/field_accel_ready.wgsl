// Aceleração dos campos (spec 009) — o que os solvers somam à gravidade uniforme a cada passo:
//   fn field_accel(x: vec3f, v: vec3f, time: f32, body: FieldBody) -> vec3f
// Pronta: só os campos prontos (sem campos na cena, zero exato). Com `FieldFunction`s na cena, a C2 troca este módulo
// pela composição: campos prontos + cada função do usuário com os seus parâmetros.
// Requer: field_point_types; field_builtin.

fn field_accel(x: vec3f, v: vec3f, time: f32, body: FieldBody) -> vec3f {
    return field_builtin(x, v, time, body);
}
