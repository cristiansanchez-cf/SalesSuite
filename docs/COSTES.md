# Coste por empresa

Cuánto cuesta cada espacio: lo que gasta en servicios de pago (IA, audios, WhatsApp, correos, redes), lo que ocupa y su
parte de los costes fijos de la plataforma. Solo lo ve el superadmin: **Plataforma → Coste por empresa**
(`/admin/platform/costes`).

## Qué se apunta

Cada llamada de pago se apunta en `usage_event` con su espacio, quién la hizo, para qué (`feature`) y lo que ha costado
(`src/lib/usage/meter.ts`). Apuntar nunca rompe ni retrasa de más lo que se estaba haciendo: como mucho espera
2 segundos, y si falla lo avisa en el log y sigue.

| Proveedor | Qué | Cómo se cobra |
|---|---|---|
| Claude | Apuntar (`crm.notes`), Investigar (`crm.research`), Limpiar (`crm.cleanup`), zonas (`crm.places*`), asistente de configuración (`setup.agent`), traducciones (`i18n.translate`), leads (`leads.classify`, `leads.texts`), propuestas de mensaje del recordatorio (`assistant.draft`) | Tokens de entrada, salida y caché, y búsquedas web. Se apunta el modelo que respondió de verdad (si salta el de reserva, ese). |
| OpenAI | Audios del asistente (`assistant.audio`) | Por segundos de audio (Whisper) |
| Meta | Plantillas de WhatsApp (`whatsapp.template`); respuestas dentro de las 24 horas (`whatsapp.reply`, a 0: solo volumen) | Por plantilla (las nuestras son Utility) |
| Resend | Correos (`email.<tipo>`) | Por correo |
| API de medios | Ver sus redes y traer fotos y vídeos (`social.list`, `social.download`) | Por llamada |

**De quién es el gasto.** En la consola, del espacio y de la persona de la petición (el middleware abre el ámbito con
`withUsageScope`). Por detrás, lo abre quien lo lanza: la cola de los leads (por envío), los correos de avisos y de la
mañana (por persona), el asistente de WhatsApp y el recordatorio de la mañana (por persona) y los correos reenviados al
CRM (por quien los reenvía).

## Precios

`src/lib/usage/prices.ts`. Claude, con la [tabla oficial](https://platform.claude.com/docs/en/about-claude/pricing)
(3 de noviembre de 2026):

| Modelo | Entrada | Escritura en caché | Lectura de caché | Salida |
|---|---:|---:|---:|---:|
| Haiku 5.5 (hasta 100.000 tokens) | 0,10 $ | 0,125 $ | 0,01 $ | 0,50 $ |
| Haiku 5.5 (más de 100.000) | 0,50 $ | 0,625 $ | 0,05 $ | 2,50 $ |
| Sonnet 5.5 | 2 $ | 2,50 $ | 0,10 $ | 10 $ |
| Opus 5.5 | 4 $ | 5 $ | 0,20 $ | 20 $ |

Por millón de tokens. Búsqueda web: 10 $ cada 1.000. Un modelo que no está en la tabla cuenta como Opus (mejor pasarse).

Lo demás son estimaciones que se ajustan en Vercel sin tocar el código:

| Variable | Por defecto | Qué |
|---|---:|---|
| `USAGE_PRICE_WHISPER_MINUTE` | 0,006 $ | Minuto de audio |
| `USAGE_PRICE_WA_UTILITY` | 0,02 $ | Plantilla Utility (España) |
| `USAGE_PRICE_WA_MARKETING` | 0,0615 $ | Plantilla Marketing |
| `USAGE_PRICE_EMAIL` | 0,0004 $ | Correo (Resend Pro: 20 $ por 50.000) |
| `USAGE_PRICE_MEDIA_CALL` | 0 $ | Llamada a la API de medios |
| `USAGE_PRICE_STORAGE_GB` | 0,021 $ | GB al mes de almacenamiento |
| `PLATFORM_FIXED_COSTS` | (nada) | Fijos de la plataforma, p. ej. `Vercel=20,Supabase=25,Resend=20` (dólares al mes) |

El coste se calcula al apuntarlo: si cambia un precio, lo ya apuntado no se recalcula.

## El panel

Por espacio, el mes elegido:

- el gasto, por grupos (IA, audios, WhatsApp, correos, redes) y por día;
- la previsión a fin de mes (si está en curso: al ritmo de lo que va de mes);
- lo que ocupa en fotos y vídeos y lo que cuesta;
- su parte de los fijos, repartidos por personas;
- **Ver detalle**: en qué (cada función, cuántas veces, tokens, coste y coste por vez) y quién.

El «por vez» de cada función es lo que cuesta de verdad cada cosa: es lo que hay que pasarle al modelo de abajo para
afinarlo.

En demo sale un mes de ejemplo (la IA de pruebas no gasta). El segundo espacio gasta mucho más en IA: es el caso de «se
pone como un loco a apuntar con IA».

## Tope de IA por empresa

En el detalle de cada empresa (**Ver detalle → Tope de IA**) el superadmin fija dos cosas:

- **Usos de IA por persona al día** (Apuntar, también desde WhatsApp, e Investigar). Por defecto, 40 cada persona.
  Al llegar: «Has llegado al tope de hoy; mañana puedes seguir».
- **Gasto máximo al mes**, en dólares. Cuenta todo el gasto del mes (el mismo número del panel). Vacío: sin tope.
  Al llegar, se para la IA que lanza el equipo (Apuntar, Investigar, Limpiar y ordenar o revisar zonas) hasta el mes
  siguiente o hasta que se suba: «Este espacio ha llegado a su tope de gasto en IA de este mes». Lo automático (los
  leads, el recordatorio de la mañana) sigue.

Cada empresa sale en el panel con su tope y, si tiene gasto máximo, cuánto lleva: «Cerca del tope» desde el 80 % y
«Tope alcanzado» al llegar.

Sin entrar en Plataforma: GitHub → Actions → «Producción» → `tope-ia`, con el espacio, `tope` (dólares al mes; `sin` lo
quita) y, si se quiere, `usos_dia` (`scripts/ai-limit.sql`; con «Solo comprobar», enseña cómo está y cómo quedaría).

Se guarda en `tenant_limits` (migración `20261228000000_ai_limits.sql`): solo lo cambia el superadmin
(`platform_set_limits`); el servidor de cada espacio lo lee con lo gastado del mes (`ai_limits`). Si no se puede leer,
se sigue con el de por defecto (mejor no dejar al equipo sin IA por un fallo de la base de datos).

## Modelo: cuánto cuesta una empresa al mes

`node scripts/load/cost-model.mjs [--companies 10] [--fixed "Vercel=20,Supabase=25"] [--calibrate costes.json]`

Tres empresas tipo (22 días laborables al mes). El «por vez» sale de los tokens típicos de cada llamada con los precios
de arriba. Con `--calibrate` se le pasa el «por vez» real del panel (`{"crm.notes": 0.0013, …}`).

| Empresa tipo | Personas | Qué hace | Variable al mes | Por persona | Con su parte de los fijos (10 empresas, 65 $) |
|---|---:|---|---:|---:|---:|
| Ligera | 3 | 2 Apuntar al día por persona, 8 investigaciones al mes, 30 leads | ~4 $ | ~1,3 $ | ~10,5 $ |
| Normal | 8 | 6 Apuntar al día por persona, 40 investigaciones, 120 leads | ~20 $ | ~2,5 $ | ~26 $ |
| Intensa | 12 | 25 Apuntar al día por persona, 2 investigaciones al día por persona, 400 leads | ~149 $ | ~12,4 $ | ~155 $ |

Lo que más pesa:

1. **Investigar** (Sonnet con búsquedas web, ~0,20 $ cada vez): en la intensa son 106 de los 149 $.
2. **Plantillas de WhatsApp** (~0,02 $ cada una): los mensajes a leads y el recordatorio de la mañana.
3. Apuntar es barato (Haiku, ~0,001 $ cada vez): 6.600 al mes son ~7 $.

Usos de IA por persona y día: ~6 en la normal y ~27 en la intensa, por debajo del tope por defecto de 40. Para un
equipo que apunte más, se le sube en su tope.

## Prueba de carga

`node scripts/load/load-test.mjs --users 100 --duration 60 [--think 0] [--out carpeta] [--base https://…]`

N personas a la vez haciendo un día normal: Inicio, CRM (lista, ficha, buscar), propuestas, Apuntar con IA, abrir una
propuesta pública, entrar un lead desde la web. Mide cuánto tarda cada cosa (p50, p95 y p99), cuántas fallan y cuántas
peticiones por segundo aguanta. También cuenta las operaciones de pago que habría hecho.

Por defecto va contra la demo (`npm run build && AI_RESEARCH_FIXTURE=1 npm run start:demo`): no gasta nada y mide el
servidor de la aplicación, no Supabase. No arranca contra producción (crea leads e interacciones de verdad): para medir
todo el sistema, un despliegue de pruebas con su propio Supabase.

Resultados del 3 de noviembre de 2026 (un solo proceso de Node, demo en memoria, con 1,5 s de media entre clic y clic):

| Personas a la vez | Peticiones por segundo | Errores | p50 | p95 | p99 |
|---:|---:|---:|---:|---:|---:|
| 25 | 15 | 0 | 9 ms | 23 ms | 28 ms |
| 100 | 58 | 0 | 10 ms | 29 ms | 49 ms |
| 250 | 135 | 0 | 86 ms | 542 ms | 1.160 ms |
| 50, sin pausas (a tope) | 160 | 0 | 214 ms | 786 ms | 899 ms |

- Un proceso aguanta unas **150 peticiones por segundo**: con 100 personas trabajando a la vez va igual de rápido que con
  25, y a partir de ~250 empieza a hacer cola. En Vercel cada petición va en su propia función, así que la aplicación
  escala sola. El límite real será **Supabase** (consultas y conexiones de su plan), que esta prueba no mide.
- **Inicio (Hoy)** es la página que más trabajo cuesta: a tope tarda 3 o 4 veces lo que las demás (p50 718 ms frente a
  ~200 ms). Es la primera que hay que optimizar si crece el equipo.
- Una empresa normal (8 personas) hace como mucho unas 5 peticiones por segundo en hora punta. El servidor de la
  aplicación no es lo que limita el número de empresas.
