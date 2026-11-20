// Los tokens reconocidos no se envían al motor. Separar en fragmentos conserva
// el orden de los comandos, incluidos sus argumentos y separadores de diálogo.
const PROTEGIDO = new RegExp(`(${[
  /https?:\/\/[^\s<>"^#|]+(?:#(?!\$)[^\s<>"^#|]+)?/,
  /[\w.+-]+@[\w.-]+\.[a-zA-Z]+/,
  /\{\{[\s\S]*?\}\}|\$\{|\}\$|\{[^{}\r\n]+\}/,
  /<\/?[a-zA-Z][^<>\r\n]*>|&(?:#\d+|#x[\da-fA-F]+|[a-zA-Z]+);|\[[^\]\r\n]+\]/,
  /\$(?:query|[cdpqr1])[ \t]+[^#\r\n]+\s*(?=#)|\$(?:action|[tv])[ \t]+[^#\r\n]+|\$[\p{L}\d]+/u,
  /%item\b[\s\S]*?%%|%revealtaste:[^#\r\n\s]+/,
  /%(?:adj|noun|place|spouse|name|firstnameletter|time|band|book|pet|farm|favorite|kid[12]|fork|revealtaste\w+)(?![\w])/,
  /%(?:\([\w.]+\))?[sdif](?!\p{L})/u,
  /[%@{}#^¦|*/]|\r\n|[\r\n\t]/,
].map(patron => patron.source).join('|')})`, 'u');
const LETRAS = /\p{L}/u;

function dividir(texto) {
  // Índices impares: tokens literales; índices pares: tramos potencialmente traducibles.
  return texto.split(PROTEGIDO);
}

export async function traducirDatos(datos, motor, clavesSinTraducir = []) {
  const excluir = new Set(clavesSinTraducir);
  const pendientes = new Map();
  function planificar(valor, clave) {
    if (typeof valor === 'number' && !Number.isFinite(valor)) {
      throw new Error(`Número no válido en la clave ${JSON.stringify(clave)}.`);
    }
    if (Array.isArray(valor)) {
      const elementos = valor.map(item => planificar(item, clave));
      return () => elementos.map(resolver => resolver());
    }
    if (valor !== null && typeof valor === 'object') {
      const entradas = Object.entries(valor).map(([nombre, item]) => [nombre, planificar(item, clave ?? nombre)]);
      return () => Object.fromEntries(entradas.map(([nombre, resolver]) => [nombre, resolver()]));
    }
    // Las respuestas rápidas $y tienen su propia gramática (comillas y guiones bajos).
    // Se conservan completas para no modificarla; pueden localizarse a mano.
    if (typeof valor !== 'string' || excluir.has(clave) || /\$y\s/u.test(valor)) return () => valor;
    const partes = dividir(valor).map((parte, indice) => {
      if (indice % 2 || !LETRAS.test(parte)) return () => parte;
      const texto = parte.trim();
      const inicio = parte.slice(0, parte.length - parte.trimStart().length);
      const final = parte.slice(parte.trimEnd().length);
      pendientes.set(texto, undefined);
      return () => inicio + pendientes.get(texto) + final;
    });
    return () => {
      const resultado = partes.map(resolver => resolver()).join('');
      // Impide que el motor inserte controles o se fusione con uno existente.
      const tokens = texto => dividir(texto).filter((_, i) => i % 2);
      if (JSON.stringify(tokens(resultado)) !== JSON.stringify(tokens(valor))) {
        throw new Error(`La traducción cambió los controles de la clave ${JSON.stringify(clave)}.`);
      }
      return resultado;
    };
  }

  const resolver = planificar(datos);
  if (pendientes.size) {
    const fragmentos = [...pendientes.keys()];
    const traducciones = await motor.traducir(fragmentos);
    if (!Array.isArray(traducciones) || traducciones.length !== fragmentos.length ||
        traducciones.some(texto => typeof texto !== 'string' || !texto.trim())) {
      throw new Error('El motor devolvió una traducción incompleta o no válida.');
    }
    fragmentos.forEach((texto, i) => pendientes.set(texto, traducciones[i].trim()));
  }
  return resolver();
}
