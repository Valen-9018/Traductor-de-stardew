import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { deepEqual, equal, match, rejects, throws } from 'node:assert/strict';
import { test } from 'node:test';
import { configuracion } from '../configuracion.js';
import { archivosI18n, existe, guardarNuevo, leerTraducciones } from '../src/archivos.js';
import { crearMotor, idiomasLibreTranslate } from '../src/motores.js';
import { traducirDatos } from '../src/textos.js';

const ejecutar = (...args) => promisify(execFile)(process.execPath, ['traducir.js', ...args]);

async function temporal(t) {
  const carpeta = await mkdtemp(join(tmpdir(), 'traductor-stardew-'));
  t.after(() => rm(carpeta, { recursive: true, force: true }));
  return carpeta;
}

async function servidor(t, simular) {
  const peticiones = [];
  const servicio = createServer(async (req, res) => {
    const trozos = [];
    for await (const trozo of req) trozos.push(trozo);
    const datos = trozos.length ? JSON.parse(Buffer.concat(trozos)) : undefined;
    peticiones.push({ ruta: req.url, datos });
    const respuesta = simular(req.url, datos);
    res.writeHead(respuesta === undefined ? 404 : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(respuesta ?? {}));
  });
  await promisify(servicio.listen.bind(servicio))(0, '127.0.0.1');
  t.after(() => promisify(servicio.close.bind(servicio))());
  return { direccion: `http://127.0.0.1:${servicio.address().port}`, peticiones };
}

test('lee comentarios, comas finales, claves sin comillas y cadenas intactas', async t => {
  const base = await temporal(t);
  const ruta = join(base, 'texto.json');
  await writeFile(ruta, '\uFEFF{ // comentario\n valor: "  Té   https://ejemplo.org //literal /* literal */, \\n",\n}');
  deepEqual(await leerTraducciones(ruta), { valor: '  Té   https://ejemplo.org //literal /* literal */, \n' });
  deepEqual(await leerTraducciones('pruebas/2_con_claves_sin_comillas.json'), await leerTraducciones('pruebas/2_sin_comentarios.json'));
  equal((await leerTraducciones('pruebas/1_con_comentarios.json')).Kid1_0H_02, "@, this might be the happiest day of my life...$4#$b#I'm gonna treasure this memory forever...$4");
  await writeFile(ruta, Buffer.from([0xff]));
  await rejects(leerTraducciones(ruta), /UTF-8/);
});

test('traduce solo fragmentos de texto y conserva claves, controles, espacios y tipos', async () => {
  const dialogo = "\t%Welcome @!$4#$q 42/43 respuesta\n#Hello {{npc}} {0}#Hello %kid2^${Hello^Bye}$#%item object 388 1 %%";
  const respuestas = new Map([['Welcome', 'Bienvenido'], ['Hello', 'Hola'], ['Bye', 'Adiós']]);
  const entrada = Object.fromEntries([
    ['dialogo', dialogo], ['__proto__', { interno: ['Bye', 10, null, true] }],
    ['config.etiqueta', 'Hello'], ['tecnica', 'IDENTIFICADOR'], ['url', 'https://ejemplo.org/ruta#ancla'],
    ['breve', "$y 'Hello_Bye'"], ['vacia', '   '],
  ]);
  const motor = { traducir: async textos => {
    deepEqual(textos, ['Welcome', 'Hello', 'Bye']);
    return textos.map(texto => respuestas.get(texto));
  } };
  deepEqual(await traducirDatos(entrada, motor, ['tecnica']), Object.fromEntries([
    ['dialogo', '\t%Bienvenido @!$4#$q 42/43 respuesta\n#Hola {{npc}} {0}#Hola %kid2^${Hola^Adiós}$#%item object 388 1 %%'],
    ['__proto__', { interno: ['Adiós', 10, null, true] }], ['config.etiqueta', 'Hola'],
    ['tecnica', 'IDENTIFICADOR'], ['url', 'https://ejemplo.org/ruta#ancla'], ['breve', "$y 'Hello_Bye'"], ['vacia', '   '],
  ]));
});

test('rechaza valores no finitos, respuestas incompletas y controles introducidos', async () => {
  const datos = { saludo: 'Hello @!' };
  await rejects(traducirDatos({ dato: Infinity }, {}), /Número no válido/);
  await rejects(traducirDatos(datos, { traducir: async () => [] }), /incompleta/);
  await rejects(traducirDatos(datos, { traducir: async () => ['Hola#$b#'] }), /cambió los controles/);
});

test('LibreTranslate detecta una vez por archivo y envía lotes con destino es', async t => {
  const servicio = await servidor(t, (ruta, datos) => ({
    '/languages': [{ code: 'fr', targets: ['es'] }, { code: 'en', targets: ['fr'] }],
    '/detect': [{ language: 'fr', confidence: 98 }],
    '/translate': { translatedText: Array.isArray(datos?.q) ? datos.q.map(texto => `traducción de ${texto}`) : undefined },
  }[ruta]));
  const config = { ...configuracion, libretranslate: servicio.direccion };
  deepEqual(await idiomasLibreTranslate(config), ['fr']);
  const motor = crearMotor(config);
  const textos = Array.from({ length: 27 }, (_, i) => `Bonjour ${i}`);
  deepEqual(await motor.traducir(textos), textos.map(texto => `traducción de ${texto}`));
  const [, , deteccion, primerLote, segundoLote] = servicio.peticiones;
  equal(deteccion.ruta, '/detect');
  match(deteccion.datos.q, /Bonjour 0\nBonjour 1/);
  deepEqual(primerLote.datos, { q: textos.slice(0, 24), source: 'fr', target: 'es', format: 'text' });
  deepEqual(segundoLote.datos.q, textos.slice(24));
  await rejects(crearMotor({ ...config, idiomaOrigen: 'en' }).traducir(['Hello']), /no tiene una ruta/);
});

test('Ollama recibe el fragmento como dato y solo acepta una traducción completa', async t => {
  const servicio = await servidor(t, (ruta, datos) => ruta === '/api/chat' ? {
    done: true, done_reason: datos.messages[1].content === 'Incompleto' ? 'length' : 'stop',
    message: { content: '{"traduccion":"Hola"}' },
  } : undefined);
  const motor = crearMotor({ ...configuracion, motor: 'ollama', ollama: servicio.direccion });
  deepEqual(await motor.traducir(['Bonjour']), ['Hola']);
  const [{ datos }] = servicio.peticiones;
  equal(datos.model, configuracion.modeloOllama);
  deepEqual(datos.messages[1], { role: 'user', content: 'Bonjour' });
  await rejects(motor.traducir(['Incompleto']), /incompleta/);
  throws(() => crearMotor({ ...configuracion, libretranslate: 'https://example.org' }), /debe ser local/);
});

test('la CLI recorre i18n, muestra vista previa, conserva es.json y continúa tras un error', async t => {
  const base = await temporal(t);
  const malo = join(base, 'a', 'i18n');
  const existente = join(base, 'b', 'Mods internos', 'i18n');
  const nuevo = join(base, 'c', 'I18N');
  for (const ruta of [malo, existente, nuevo]) await mkdir(ruta, { recursive: true });
  await writeFile(join(malo, 'pt.json'), '{');
  await writeFile(join(existente, 'pt.json'), '{ ejemplo: "Olá" }');
  await writeFile(join(existente, 'es.json'), 'No tocar');
  const original = '{ ejemplo: "¡Hola @!$4", otro: null, }';
  await writeFile(join(nuevo, 'pt.json'), original);
  if (process.platform !== 'win32') await symlink(base, join(nuevo, 'enlace'), 'dir');
  deepEqual(await archivosI18n(nuevo, 'pt.json'), [join(nuevo, 'pt.json')]);
  match((await ejecutar('carpeta', base, '--fuente', 'pt.json', '--vista-previa')).stdout, /2 por crear, 1 conservados/);
  equal(await existe(join(nuevo, 'es.json')), false);
  await rejects(ejecutar('carpeta', base, '--fuente', 'pt.json', '--origen', 'es'), error => {
    equal(error.code, 1);
    match(error.stderr, /JSON de traducciones/);
    match(error.stdout, /1 creados, 1 conservados, 1 errores/);
    return true;
  });
  equal(await readFile(join(nuevo, 'pt.json'), 'utf8'), original);
  equal(await readFile(join(existente, 'es.json'), 'utf8'), 'No tocar');
  deepEqual(JSON.parse(await readFile(join(nuevo, 'es.json'), 'utf8')), { ejemplo: '¡Hola @!$4', otro: null });
  equal(await guardarNuevo(join(nuevo, 'es.json'), { otro: 'No escribir' }), false);
  equal(await existe(join(malo, 'es.json')), false);
});

test('la CLI traduce un archivo individual y no crea una salida para un origen no válido', async t => {
  const base = await temporal(t);
  const origen = join(base, 'texto del mod.json');
  await writeFile(origen, '["Esto no es un diccionario i18n"]');
  await rejects(ejecutar('archivo', origen, '--origen', 'es'), /objeto JSON/);
  equal(await existe(join(base, 'es.json')), false);
  await writeFile(origen, '{ "saludo": "¡Hola!" }');
  match((await ejecutar('archivo', origen, '--origen', 'es')).stdout, /1 creados/);
  deepEqual(JSON.parse(await readFile(join(base, 'es.json'), 'utf8')), { saludo: '¡Hola!' });
});
