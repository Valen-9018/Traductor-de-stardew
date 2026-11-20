import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { configuracion } from './configuracion.js';
import { ARCHIVO_ES, archivosI18n, existe, guardarNuevo, leerTraducciones, rutaEnEspanol } from './src/archivos.js';
import { crearMotor, idiomasLibreTranslate } from './src/motores.js';
import { traducirDatos } from './src/textos.js';

const AYUDA = `Traductor de Stardew Valley → español (es.json)

Uso:
  npm run traducir -- archivo <ruta.json> [opciones]
  npm run traducir -- carpeta <ruta de Mods> [opciones]
  npm run traducir -- idiomas

Opciones:
  --origen <código>   Idioma de origen, por ejemplo en, fr, ja o auto.
  --motor <nombre>    libretranslate u ollama.
  --fuente <nombre>   Nombre del JSON original en cada carpeta i18n (modo carpeta).
  --vista-previa      Muestra qué archivos se crearían sin escribir ni llamar al motor.
  --ayuda, -h         Muestra esta ayuda.

El original y cualquier es.json existente se conservan. Ajustes: configuracion.js.`;

function leerArgumentos(args) {
  try {
    return parseArgs({ args, allowPositionals: true, options: {
      origen: { type: 'string' }, motor: { type: 'string' }, fuente: { type: 'string' },
      'vista-previa': { type: 'boolean' }, ayuda: { type: 'boolean', short: 'h' },
    } });
  } catch {
    throw new Error('Hay una opción desconocida o sin valor. Consulta --ayuda.');
  }
}

async function ejecutar(args) {
  const { values, positionals: [modo, ruta, ...resto] } = leerArgumentos(args);
  if (values.ayuda || !args.length) {
    console.log(AYUDA);
    return;
  }
  if (modo === 'idiomas' && !ruta && !Object.keys(values).length) {
    const disponibles = await idiomasLibreTranslate(configuracion);
    const nombres = new Intl.DisplayNames(['es'], { type: 'language' });
    console.log(disponibles.length ? 'Idiomas instalados que se pueden traducir al español:' : 'No hay rutas de traducción al español instaladas.');
    for (const codigo of disponibles) console.log(`  ${codigo}: ${nombres.of(codigo)}`);
    return;
  }
  if (!['archivo', 'carpeta'].includes(modo) || !ruta || resto.length || (modo === 'archivo' && values.fuente !== undefined)) {
    throw new Error('Indica «archivo <ruta.json>» o «carpeta <ruta>». Usa --fuente solo en modo carpeta. Consulta --ayuda.');
  }

  const config = {
    ...configuracion,
    motor: values.motor ?? configuracion.motor,
    idiomaOrigen: (values.origen ?? configuracion.idiomaOrigen).toLowerCase(),
    archivoOrigen: values.fuente ?? configuracion.archivoOrigen,
  };
  if (!['libretranslate', 'ollama'].includes(config.motor)) throw new Error('El motor debe ser libretranslate u ollama.');
  if (!/^[a-z]{2,3}(?:-[a-z\d]{2,8})*$|^auto$/.test(config.idiomaOrigen)) throw new Error('Usa «auto» o un código de idioma válido (por ejemplo, en o ja).');
  if (modo === 'carpeta' && (!/^[^/\\:]+\.json$/i.test(config.archivoOrigen) || config.archivoOrigen.toLowerCase() === ARCHIVO_ES)) {
    throw new Error('La fuente debe ser un nombre de archivo JSON distinto de es.json, sin directorios.');
  }
  if (modo === 'archivo' && !/\.json$/i.test(ruta)) throw new Error('El archivo de origen debe tener extensión .json.');

  const absoluta = resolve(ruta);
  const originales = modo === 'archivo' ? [absoluta] : await archivosI18n(absoluta, config.archivoOrigen);
  if (!originales.length) console.log(`No se encontró «${config.archivoOrigen}» en ninguna carpeta i18n de «${absoluta}».`);
  let motor;
  let creados = 0;
  let omitidos = 0;
  let errores = 0;
  let pendientes = 0;
  for (const original of originales) {
    const destino = rutaEnEspanol(original);
    try {
      if (!(await stat(original)).isFile()) throw new Error('La ruta de origen no es un archivo.');
      if (await existe(destino)) {
        omitidos++;
        console.log(`Se conserva: ${destino}`);
      } else if (values['vista-previa']) {
        pendientes++;
        console.log(`Se crearía: ${destino} ← ${original}`);
      } else {
        console.log(`Procesando: ${original}`);
        const datos = await leerTraducciones(original);
        motor ??= crearMotor(config);
        const resultado = await traducirDatos(datos, motor, config.clavesSinTraducir);
        if (await guardarNuevo(destino, resultado)) {
          creados++;
          console.log(`Creado: ${destino}`);
        } else {
          omitidos++;
          console.log(`Se conserva: ${destino}`);
        }
      }
    } catch (error) {
      errores++;
      console.error(`No se pudo procesar «${original}»: ${mensaje(error)}`);
    }
  }
  if (values['vista-previa']) console.log(`Vista previa: ${pendientes} por crear, ${omitidos} conservados, ${errores} errores.`);
  else console.log(`Resumen: ${creados} creados, ${omitidos} conservados, ${errores} errores.`);
  if (errores) process.exitCode = 1;
}

function mensaje(error) {
  return error.code ? `Error del sistema [${error.code}]. Comprueba la ruta y los permisos.` : error.message;
}

ejecutar(process.argv.slice(2)).catch(error => {
  console.error(`Error: ${mensaje(error)}`);
  process.exitCode = 1;
});
