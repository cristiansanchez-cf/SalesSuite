#!/usr/bin/env python3
"""
Jugadas de la sesión de mentoría con un CEO que vendió a nuestros mismos clientes (ocio nocturno, ticketing), de cuando
Enjoy era solo peticiones de canciones. Se queda lo que sigue valiendo hoy, adaptado al producto actual y a las reglas
que ya están en el playbook. Idempotente: sustituye por clave.

Lo que NO se ha pasado (choca con reglas vigentes o está obsoleto):
- «Vas a pasar de 17,50 a 19 € de ticket medio» y «nos llevamos el 10 %»: ni cifras de monetización (gen-no-decir) ni
  comisión sobre lo que paga el público (modelo: ese dinero es del local). Se queda la idea: hablar en SUS números, que
  los pone él.
- «No habléis de precio»: se queda como orden (el precio llega después del «lo quiero»), sin tocar gen-precio-reglas.
- Embajadores («de los primeros 1.000 € netos, 500 para ti») y fechas de lanzamiento: decisiones de negocio, no jugadas.

    python3 scripts/apply-mentoria-ceo.py
"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / 'tenants/enjoy/tenant.json'
t = json.loads(P.read_text())

FUENTE = 'De la sesión de mentoría con un CEO que vendió durante años a nuestros mismos clientes (ocio nocturno).'


def play(key, kind, stage, title, body, when='', why='', audience=None):
    p = {'key': key, 'kind': kind, 'stage': stage, 'title': title, 'body': body.strip(), 'when_to_use': when,
         'why_it_works': f'{why} {FUENTE}'.strip(), 'technique_refs': []}
    if audience:
        p['audience'] = audience
    return p


PLAYS = [
    play('ceo-presente', 'tip', 'mentalidad', 'Vende presente, no futuro', '''
Quien te recibe tiene una reunión dentro de media hora y otra hace media hora. Un empleado que se le va, un proveedor que no
paga, un cliente que se queja. **Tú eres lo menos importante de su día.**

- El futuro se compra en el sofá. En el trabajo se compra **lo que resuelve el problema de hoy**.
- Cada minuto contigo tiene que darle más de lo que le quita.
- No hables de lo que la app hará algún día: habla de lo que le pasa este fin de semana.
''', why='Parte de que no te necesita y de que no te esperaba. Encaja con «La frontera: dirección sí, promesas no».'),

    play('ceo-90-10-0', 'tip', 'mentalidad', 'Escuchar 90, preguntar 10, producto 0', '''
La regla que él puso hasta en el CRM de su equipo: en la primera reunión **escuchas el 90 % del tiempo, preguntas el 10 % y
hablas de tu producto el 0 %**.

- Al cliente no le importa tu producto: le importa saber si **le entiendes**.
- Haz las preguntas adecuadas **aunque sepas la respuesta** (sobre todo entonces): te dicen qué mitad del pitch sobra.
- Ningún cliente necesita el pitch entero.
- Si notas que no encaja, pregúntalo: «Me da la sensación de que esto no te encaja, ¿por qué?». Esa respuesta vale más
  que volver otro día a ver si cuela.
''', why='Cuanto más escuchas, más le entiendes; cuanto mejores preguntas, más confía. Con eso le da igual lo que vendas.'),

    play('ceo-interlocutor', 'tip', 'descubrimiento', 'Vende a quien tienes delante, no al local', '''
Importa más **quién es** que qué local es. El de finanzas pide lo mismo en un pub que en un hotel; el de marketing también.

- **Dueño:** ganar más y diferenciarse de la competencia.
- **Finanzas o quien lleva las cuentas:** margen, recurrencia, cuánto deja cada cliente. Llévate la tabla.
- **Marketing o redes:** la experiencia del público y el contenido. Mira antes sus redes.
- **Encargado de sala u operaciones:** que no le des más trabajo. Si le hablas de lo que gana el dueño, oye «más trabajo
  para mí y más dinero para él».
- **El portero, el DJ, la pareja del dueño que lleva las cuentas:** pueden bloquearlo todo. Si dicen que no, no entra.

**Antes de ir:** pregunta a quien te consigue la reunión qué perfil tiene esa persona.
''', why='El mismo producto se cuenta distinto a cada uno: busca dónde está su interés, que puede chocar con el del dueño.'),

    play('ceo-dolor', 'script', 'descubrimiento', 'Lleva la conversación a su dolor', '''
En vez de decirle lo que necesita, pregunta hasta que lo diga él. Ejemplo con un pub sin DJ:

«¿Qué tal la sala? ¿Qué público tienes entre semana y el sábado? ¿Y cómo haces con la música para públicos tan distintos?
¿Te piden canciones?»

Cuando conteste algo como «pongo lo que sale y ya está»:

«¿Y si la música fuera algo más del local, algo por lo que la gente vuelve, te interesaría verlo?»

Si él ve que entiendes su problema y que puedes hacer que le duela menos, **ya no le estás vendiendo: te está comprando**.
''', when='En la primera reunión, antes de enseñar nada.', why='Es tu pitch, pero dicho por él.'),

    play('ceo-medalla', 'tip', 'descubrimiento', 'Que se cuelgue la medalla quien te lleva al dueño', '''
Casi siempre te escucha primero el encargado de sala, y él decide si te lleva al dueño. Quiere quedar bien.

«No hace falta que me metas en una reunión con tu jefe. Ve tú, yo te acompaño, y le enseñas que **has encontrado** una
forma de que gane más.»

Si la operación no la gana también quien te ha abierto la puerta, se te cierra.
''', why='Si no es quien decide, necesitas que sea él quien se lo venda al que decide.'),

    play('ceo-quiero-entiendo', 'tip', 'pitch_demo', 'Primero «lo quiero», después «lo entiendo»', '''
El orden importa:

1. **Su valor, en su idioma:** que cada cliente deje más, que vuelva más veces, tener algo que la competencia no tiene.
   En **sus** números: «¿Cuánto te deja de media cada cliente? ¿Cuántas veces vuelve al mes?». Los números los pone él;
   nosotros no prometemos cifras (ver «Lo que no se dice nunca»).
2. **Cuando se echa hacia delante y te pregunta «¿y eso cómo funciona?»:** ahora sí, la demo. Mejor en su local que en
   una presentación: por dónde entra la gente, dónde pide, dónde iría el cartel con el QR, la mesa del DJ.
3. **Después:** cómo quedaría con su marca y su música.

Si al principio te pregunta por funciones («¿y hace esto?, ¿y lo otro?»), es que has empezado por el producto.
''', why='Las preguntas que sabes que te van a hacer se adelantan, pero como él las entiende, no con pantallas.'),

    play('ceo-su-marca', 'pitch', 'pitch_demo', 'Habla de su negocio, no del nuestro', '''
«Lo creamos para ti» no le dice nada: ¿el qué has creado para mí? Lo que le importa es **su** marca y **su** negocio.

- No: «Una app pensada para locales como el tuyo».
- Sí: «Tu pantalla, con tu logo, con lo que pide tu gente».

No hace falta que el público sepa que es Enjoy. Que lo sienta suyo.
''', why='Le das los mensajes que necesita oír: conecto con mis clientes, gano más, me diferencio.'),

    play('ceo-precio-problema', 'tip', 'objeciones', 'Si el precio es el problema, el problema es otro', '''
Si alguien discute 99 € al mes, no está discutiendo 99 €: **no cree que vaya a sacar 99 € de esto**. No confía todavía.

- No bajes el precio: vuelve al valor y a sus números.
- Lo que se regala no se valora. Una cuota hace que lo ponga en valor.
- Los descuentos, solo los de la tabla y a cambio de algo (ver «Descuentos»).
''', why='Él tenía miedo de cobrar a algunos clientes y aprendió que el que no cree que va a ganar más no es tu cliente todavía.'),

    play('ceo-cerrar-prueba', 'tip', 'cierre', 'Lo que cierras primero es la prueba', '''
Al principio no cierras un contrato para siempre: **cierras que lo pruebe**. Todo lo que digas tiene que responder a tres
preguntas: ¿por qué vosotros?, ¿por qué esta solución?, ¿por qué ahora?

- **El ritmo lo marcas tú.** «Vamos a montártelo bien: tu música, tu marca y tus carteles. Lo probamos unas noches y, si
  te gusta, lo ponemos en todo.»
- **Plazos reales.** Si te pide «para mañana» y no puede ser: «No es que vayamos lentos: es lo que tardamos en
  preparártelo bien».
- No generes expectativas que no vayas a cumplir: un cliente decepcionado pesa más que uno que dijo que no.
''', why='Rápido sí, pero rápido y bien.'),

    play('ceo-temporada-baja', 'tip', 'prospeccion', 'Temporada baja: el mejor momento para entrar', '''
Enero (y cualquier temporada baja) es el mejor momento para hablar con un local:

- **Te escuchan:** están tranquilos, hacen ajustes en el local y piensan en cómo mejorar el año.
- **Facturan menos, y es cuando quieren facturar más.** En temporada alta su foco es asegurar lo que tienen, no probar
  algo nuevo.

Úsala para planificar con él (música, marca, cómo se configura) y que la prueba esté rodando antes de la temporada alta.
''', why='Lo que en julio es «ahora no», en enero es «justo lo que necesito».'),

    play('ceo-insistir', 'tip', 'seguimiento', 'Insistir sin quemar', '''
Si no contesta: a los **3 días**, a la **semana**, a las **dos semanas**, al **mes**. Y sigue, si crees que la cuenta va a
caer.

- No te va a odiar: **no eres tan importante para él** como para eso.
- Cuando por fin te atiende no se acuerda de quién eres: capta su interés muy rápido, y la forma más rápida es
  preocuparte por su negocio.
- Usa el tiempo donde hay oportunidad. El «no» ya lo tienes.
''', why='Atención, intuición y resiliencia.'),

    play('ceo-cuidar', 'tip', 'seguimiento', 'Llama cuando no toca cobrar', '''
Si te preocupas de alguien, no le llamas cuando toca pagar. Tres cosas que tiene que sentir:

1. **Que sabe usarlo.** Si no lo usa bien, lo deja.
2. **Que evoluciona con él.** Cada novedad se le cuenta: «¿Te acuerdas de lo que me comentaste? Lo hemos hecho.» Que
   haya cosas que no sabe que puede usar no puede pasar nunca.
3. **Que cuando tiene un problema, estás.**

Al principio, habla con **cada cliente una vez al mes**. Lo primero se puede automatizar; lo personal, nunca: si a la
tercera frase le contesta un robot, entiende que no es importante para ti.
''', why='Nadie deja a quien le ayuda en su negocio; se deja al que hace una tarea que otro hace más barata. Él manda a sus 300-400 clientes clave un informe mensual con una frase escrita a mano para cada uno.'),

    play('ceo-tres-meses', 'script', 'seguimiento', 'A los tres meses: la revisión y la pregunta atrevida', '''
A los tres meses, siempre una revisión con el cliente:

- «¿Qué tal la experiencia?»
- «¿Qué es lo que más te ha gustado?»
- «¿Qué te hizo dudar de contratarnos?»
- «¿Qué te habría hecho irte a otra alternativa?»

Y si está contento, la atrevida:

«¿A quién conoces que también podría estar contento con esto?»
''', when='A los tres meses de empezar (y en cada cierre de temporada).', why='Él sabe más del sector que tú y tiene más red. Si notó que te preocupaste por él, no le importará preocuparse por ti.'),

    play('ceo-documentar', 'tip', 'seguimiento', 'Documenta cada cliente: el caso de éxito se vende solo', '''
Lo que vende de verdad no es la demo: son **los números de un cliente real**.

- Con los clientes de confianza, apunta **antes y después**: facturación, clientes de media, cuántas veces vuelven.
- Pídeselo de cara: no se comparte con su nombre, solo sirve para demostrar que funciona.
- Con un caso bien documentado, otros te abren puertas («han puesto 20 locales y generan esto»).

**PENDIENTE:** todavía no hay un caso documentado así. Cuando lo haya, enséñalo como una noche real sin nombres: lo que
pidió el público, lo que cobró el local y cuándo le llegó.
''', why='Se consigue con confianza: que entiendan que estás para que les vaya mejor. Entonces quieren que te vaya bien a ti.'),

    play('ceo-paso-a-paso', 'tip', 'mentalidad', '1, 2, 4, 8: crecer sin quedar mal', '''
Coge un cliente y hazlo bien. Luego dos. Luego cuatro. Luego ocho.

- Si pasas de uno a ocho y quedas mal con seis, te disparas en el pie: esos seis contestan mal cuando les preguntan por
  vosotros.
- Ahora mismo lo que buscamos es **credibilidad**. Todo lo que la quite, resta.
- Expectativas bajas y superarlas.
''', audience='team', why='Primero encontrar lo que funciona, simplificarlo, optimizarlo y después multiplicar. Al revés se tira el dinero.'),
]

keys = {p['key'] for p in PLAYS}
t['playbook'] = [p for p in t['playbook'] if p['key'] not in keys] + PLAYS
t['retired_plays'] = [k for k in t['retired_plays'] if k not in keys]
P.write_text(json.dumps(t, ensure_ascii=False, indent=2) + '\n')
print(f'mentoría CEO: {len(PLAYS)} jugadas en «Cómo se vende» general')
