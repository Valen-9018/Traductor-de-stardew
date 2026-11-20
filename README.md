# Traductor de mods de Stardew Valley al español

![Logotipo del traductor de Stardew Valley](logo.png)

Genera un `es.json` para mods que usan las traducciones `i18n` de **SMAPI**, incluidos los paquetes de Content Patcher que usan `{{i18n:…}}`. Conserva el original y no sobrescribe un `es.json` existente. Por defecto detecta el idioma de origen y utiliza **LibreTranslate** en tu propio equipo; **Ollama** es una alternativa.

**Sin claves, suscripciones ni cuotas de API.** Los dos motores funcionan localmente; necesitas internet para instalar el programa y descargar los modelos. Después, puedes traducir sin conexión con los modelos ya instalados. El tiempo, la memoria y el espacio disponible dependen de tu equipo. **No existe cobertura universal:** puedes traducir desde los idiomas que admita el motor o modelo instalado.

## 1. Instalar

Instala [Node.js 22 o posterior](https://nodejs.org/es/download). Descarga o clona este repositorio y abre una terminal en su carpeta. Ejecuta:

```sh
npm ci
```

### Motor recomendado: LibreTranslate

Instala y abre [Docker Desktop](https://www.docker.com/products/docker-desktop/) o utiliza Docker con el complemento Compose. Desde la carpeta del repositorio:

```sh
docker compose up -d
docker compose logs -f libretranslate
```

La primera vez puede tardar varios minutos y ocupar varios gigabytes: se descargan la imagen y los modelos. Cuando el servicio esté listo, pulsa **Ctrl+C** para salir de los registros (el motor sigue funcionando) y consulta los idiomas disponibles:

```sh
npm run traducir -- idiomas
```

La lista muestra qué códigos tienen una ruta de traducción a `es` en **tu instalación**. Compose publica el motor solo en `http://127.0.0.1:5000` y guarda sus modelos en un volumen. Para detenerlo, usa `docker compose stop`; para volver a iniciarlo, `docker compose up -d`.

**Sin Docker:** sigue la [instalación oficial de LibreTranslate con Python](https://docs.libretranslate.com/guides/installation/#with-python). Por ejemplo, una vez instalado en un entorno virtual, `libretranslate --load-only en,es,fr` limita la carga a inglés, español y francés. Mantén esa terminal abierta mientras traduces. Si necesitas otro idioma con esta instalación reducida, ajusta `--load-only` (incluye `es` y, para rutas indirectas, `en`) y sigue las [instrucciones de actualización de modelos](https://docs.libretranslate.com/guides/installation/#language-models).

### Motor alternativo: Ollama

1. Instala [Ollama](https://ollama.com/download). Para usarlo solo en local, añade `"disable_ollama_cloud": true` a `~/.ollama/server.json` (en Windows, `%USERPROFILE%\.ollama\server.json`) y reinicia Ollama. Si el archivo no existe, créalo con el contenido `{ "disable_ollama_cloud": true }`.
2. Abre la aplicación o inicia `ollama serve` si no se está ejecutando. En otra terminal descarga el modelo local con `ollama pull qwen2.5:7b`.
3. Usa `--motor ollama` o cambia `motor` a `'ollama'` en [`configuracion.js`](configuracion.js). Si eliges otro modelo, descarga uno local que admita el idioma de origen, español y respuestas JSON estructuradas; escribe su nombre en `modeloOllama`.

Ollama puede servir para un idioma que no figure en LibreTranslate, pero no garantiza la misma calidad en todos los idiomas y puede tardar más. El modelo sugerido requiere varios gigabytes.

## 2. Traducir

En Steam, abre **Stardew Valley → Administrar → Explorar archivos locales** y localiza la carpeta `Mods` de tu instalación de SMAPI. Pon las rutas entre comillas si tienen espacios. Los comandos siguientes suponen que se ejecutan desde la carpeta de este repositorio.

```sh
# Ver dónde se escribiría cada traducción, sin iniciar el motor.
npm run traducir -- carpeta "C:/ruta a/Stardew Valley/Mods" --vista-previa

# Traducir todos los i18n/default.json de la carpeta Mods.
npm run traducir -- carpeta "C:/ruta a/Stardew Valley/Mods"

# Traducir un solo archivo. Útil si el origen no se llama default.json.
npm run traducir -- archivo "C:/ruta al mod/i18n/ja.json" --origen ja

# Usar otra fuente por lotes, en este caso ko.json.
npm run traducir -- carpeta "/ruta a/Stardew Valley/Mods" --fuente ko.json --origen ko

# Probar Ollama con el ejemplo incluido, cuyo texto original está en inglés.
npm run traducir -- archivo "ejemplos/i18n/default.json" --motor ollama --origen en
```

El resultado se guarda junto al origen. Pon el juego en **español** y vuelve a iniciar Stardew Valley mediante **SMAPI**. Si quieres regenerar una traducción ya existente, haz una copia de seguridad y mueve `es.json` fuera de `i18n` antes de volver a ejecutar. Si falla una traducción, no se guarda ese resultado incompleto; el modo carpeta sigue con los demás archivos y el resumen indica los errores.

## 3. Configuración y solución de problemas

| Ajuste en `configuracion.js` | Valor inicial y uso |
| --- | --- |
| `motor` | `libretranslate`; usa `ollama` como alternativa. `--motor` tiene prioridad. |
| `idiomaOrigen` | `auto`. LibreTranslate detecta un idioma por archivo; Ollama interpreta cada fragmento. Si conoces el idioma, indica `--origen` para evitar errores de detección. Si hay archivos en distintos idiomas, puedes procesarlos por separado. |
| `archivoOrigen` | `default.json`. Solo se usa en modo carpeta y se puede cambiar con `--fuente`. |
| `libretranslate`, `ollama` | Direcciones de los servicios locales. Cambia el puerto si usas uno distinto. No se aceptan servidores públicos. |
| `modeloOllama` | `qwen2.5:7b`. Usa exactamente el nombre que aparece en `ollama list`. |
| `tiempoEsperaMs` | `180000` ms por petición. Auméntalo si tu equipo necesita más tiempo. |
| `clavesSinTraducir` | Lista de claves de primer nivel que deben copiarse tal cual, por ejemplo `['evento.identificador']`. |

- **«No se pudo comunicar»**: comprueba que el servicio esté iniciado y que haya terminado la descarga inicial. En Docker, usa `docker compose logs libretranslate`.
- **«No tiene una ruta a español»**: ejecuta `npm run traducir -- idiomas`, corrige `--origen` si hubo un error de detección o prueba otro modelo con Ollama.
- **«No se encontró…»**: verifica la ruta, la carpeta `i18n` y el nombre del archivo de origen. El modo carpeta busca un nombre exacto; no elige otro archivo automáticamente.
- **El mod no usa `i18n`**: esta herramienta no traduce `manifest.json`, `config.json`, parches `content.json`, DLL, imágenes ni mods que tienen los textos incrustados fuera de los archivos de localización. No uses el modo `archivo` con esos archivos.

### Qué se conserva

El traductor cambia únicamente los valores de texto; mantiene las claves, las estructuras y los valores no textuales. Lee JSON en UTF‑8, incluso con comentarios, comas finales y claves sin comillas, y escribe JSON estándar sin comentarios. Protege los controles reconocidos como `@`, `%farm`, `$4`, `#$b#`, `{{token}}` y `{0}`. Por seguridad, conserva completos los textos de respuesta rápida con `$y`; revísalos manualmente. Los mods pueden usar sintaxis propias: excluye las claves técnicas y **prueba la traducción en el juego** antes de distribuirla. Los textos generados también pueden requerir ajustes de tono, nombres o género.

Ejecuta `npm run traducir -- --ayuda` para ver los comandos y `npm test` para ejecutar las pruebas sin instalar ningún motor. En [`ejemplos/resultado/es.json`](ejemplos/resultado/es.json) hay una traducción de referencia del ejemplo. El original en inglés se incluye como entrada de demostración.
