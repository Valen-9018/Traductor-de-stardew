import { open, lstat, readFile, readdir, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import JSON5 from 'json5';

export const ARCHIVO_ES = 'es.json';

export async function leerTraducciones(ruta) {
  let datos;
  try {
    datos = JSON5.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readFile(ruta)));
  } catch (error) {
    const ubicacion = error.lineNumber ? ` (línea ${error.lineNumber}, columna ${error.columnNumber})` : '';
    throw new Error(`No se pudo leer como JSON de traducciones en UTF-8${ubicacion}${error.code ? ` [${error.code}]` : ''}.`);
  }
  if (datos === null || Array.isArray(datos) || typeof datos !== 'object') {
    throw new Error('El archivo de traducciones debe contener un objeto JSON.');
  }
  return datos;
}

export async function existe(ruta) {
  try {
    await lstat(ruta);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

export async function archivosI18n(raiz, archivoOrigen) {
  const rutas = [];
  async function visitar(carpeta) {
    const entradas = await readdir(carpeta, { withFileTypes: true });
    if (basename(carpeta).toLowerCase() === 'i18n' &&
        entradas.some(e => e.isFile() && e.name === archivoOrigen)) {
      rutas.push(join(carpeta, archivoOrigen));
    }
    for (const entrada of entradas) {
      if (entrada.isDirectory()) await visitar(join(carpeta, entrada.name));
    }
  }
  await visitar(raiz);
  return rutas.sort();
}

export function rutaEnEspanol(origen) {
  return join(dirname(origen), ARCHIVO_ES);
}

export async function guardarNuevo(ruta, datos) {
  const contenido = JSON.stringify(datos, null, 2) + '\n';
  let archivo;
  try {
    archivo = await open(ruta, 'wx'); // Creación exclusiva: no sustituye ni enlaces ni archivos existentes.
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  }
  try {
    await archivo.writeFile(contenido, 'utf8');
    await archivo.close();
    return true;
  } catch (error) {
    await archivo.close().catch(() => {});
    await unlink(ruta).catch(() => {});
    throw error;
  }
}
