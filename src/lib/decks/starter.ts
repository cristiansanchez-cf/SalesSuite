/**
 * Los bloques de partida de un deck de inversión (docs/DECKS.md). Los mismos que pone la migración
 * 20270121000000_decks.sql en los espacios con la sección activada; aquí, para la demo. Cada espacio los edita en su
 * catálogo con lo suyo (cifras, equipo, ronda): los «—» son huecos a rellenar, no datos.
 */
export interface DeckStarter { key: string; blockType: 'deck-cover' | 'deck-slide' | 'deck-stats' | 'deck-team' | 'deck-timeline' | 'deck-math' | 'deck-contact' | 'deck-cases' | 'deck-cycle' | 'deck-funnel' | 'deck-matrix' | 'deck-calc'; name: string; props: Record<string, unknown> }

export const deckStarter = (tenantName: string): DeckStarter[] => [
  { key: 'deck-portada', blockType: 'deck-cover', name: 'Deck · Portada', props: { eyebrow: 'Para {company}', title: tenantName, tagline: 'Qué hacéis y para quién, en una frase.', round: 'Ronda pre-semilla · 2027' } },
  { key: 'deck-problema', blockType: 'deck-slide', name: 'Deck · El problema', props: { eyebrow: 'El problema', title: 'Lo que pasa hoy', bullets: ['Quién tiene el problema', 'Qué le cuesta (tiempo, dinero, clientes)', 'Por qué lo de ahora no lo resuelve'] } },
  { key: 'deck-solucion', blockType: 'deck-slide', name: 'Deck · La solución', props: { eyebrow: 'La solución', title: 'Cómo lo resolvemos', bullets: ['Qué hace el producto', 'Por qué funciona mejor', 'Qué tenemos ya hecho'] } },
  { key: 'deck-mercado', blockType: 'deck-stats', name: 'Deck · Mercado', props: { eyebrow: 'Mercado', title: 'El tamaño de la oportunidad', stats: [{ value: '—', label: 'TAM', note: 'Mercado total' }, { value: '—', label: 'SAM', note: 'Al que llegamos' }, { value: '—', label: 'SOM', note: 'Lo que queremos en 3 años' }] } },
  { key: 'deck-traccion', blockType: 'deck-stats', name: 'Deck · Tracción', props: { eyebrow: 'Tracción', title: 'Lo que ya funciona', stats: [{ value: '—', label: 'Clientes' }, { value: '—', label: 'Ingresos al mes' }, { value: '—', label: 'Crecimiento' }] } },
  { key: 'deck-oportunidad', blockType: 'deck-timeline', name: 'Deck · La oportunidad', props: { eyebrow: 'Por qué esta inversión', title: 'El modelo funciona. *La ronda acelera.*', quote: 'Qué compra esta ronda y cuándo los ingresos propios financian el crecimiento.', steps: [{ when: 'Hoy', value: '—', label: 'clientes' }, { when: 'Final de año', value: '—', label: 'clientes' }, { when: 'Break-even', value: '—', label: 'clientes', highlight: true }, { when: 'En 2 años', value: '—', label: 'clientes' }] } },
  { key: 'deck-modelo', blockType: 'deck-slide', name: 'Deck · Modelo de negocio', props: { eyebrow: 'Modelo de negocio', title: 'Cómo ganamos dinero', bullets: ['Qué se cobra y a quién', 'Precio y margen', 'Cómo crece cada cliente'] } },
  { key: 'deck-competencia', blockType: 'deck-slide', name: 'Deck · Competencia', props: { eyebrow: 'Competencia', title: 'Por qué nosotros', bullets: ['Con quién nos comparan', 'Qué hacemos distinto', 'Qué es difícil de copiar'] } },
  { key: 'deck-equipo', blockType: 'deck-team', name: 'Deck · Equipo', props: { eyebrow: 'Equipo', title: 'Quién lo hace', people: [{ name: 'Nombre Apellido', role: 'CEO', bio: 'Por qué tú' }] } },
  { key: 'deck-ronda', blockType: 'deck-stats', name: 'Deck · La ronda', props: { eyebrow: 'La ronda', title: 'Lo que levantamos', stats: [{ value: '—', label: 'Ronda' }, { value: '—', label: 'Meses de caja' }], breakdownTitle: 'Uso de los fondos', breakdown: [{ label: 'Producto', percent: 40 }, { label: 'Ventas y marketing', percent: 40 }, { label: 'Operaciones', percent: 20 }] } },
  { key: 'deck-ventajas', blockType: 'deck-math', name: 'Deck · Por qué entrar ahora', props: { eyebrow: 'Tus ventajas', title: 'Por qué tiene sentido *entrar ahora.*', cardsTitle: 'Cuándo podrías *salir y recuperar la inversión.*', cards: [{ tag: 'Primera ventana de salida', title: 'Segunda ronda', text: 'Qué pasa y cuándo.' }, { tag: 'Segunda ventana de salida', title: 'Compra por un actor estratégico', text: 'Quién podría comprar y cuándo.' }] } },
  { key: 'deck-contacto', blockType: 'deck-contact', name: 'Deck · Contacto', props: { eyebrow: 'Contacto', title: '¿Quieres *entrar?*', people: [{ role: 'CEO', name: 'Nombre Apellido', contact: 'hola@tuempresa.com' }] } },
];

/** Bloques que se pueden añadir a un deck pero no salen en uno nuevo (p. ej. los acuerdos cerrados, con fotos). */
export const deckExtras = (): DeckStarter[] => [
  { key: 'deck-ciclo', blockType: 'deck-cycle', name: 'Deck · El ciclo del producto', props: { eyebrow: 'La solución', title: 'Una plataforma. *Todo el ciclo.*', steps: [{ label: 'Descubrir', pillars: [1] }, { label: 'Reservar', pillars: [2] }, { label: 'Repetir', pillars: [3] }], pillars: [{ title: 'Pilar uno', text: 'Qué hace.', state: 'available' }, { title: 'Pilar dos', text: 'Qué hace.', state: 'building' }, { title: 'Pilar tres', text: 'Qué hace.', state: 'roadmap' }] } },
  { key: 'deck-embudo', blockType: 'deck-funnel', name: 'Deck · Embudo de mercado', props: { eyebrow: 'Mercado', title: 'El tamaño de la oportunidad', levels: [{ value: '—', label: 'Mercado total' }, { value: '—', label: 'Al que llegamos' }, { value: '—', label: 'Lo que queremos en 3 años' }] } },
  { key: 'deck-competencia-tabla', blockType: 'deck-matrix', name: 'Deck · Tabla de competencia', props: { eyebrow: 'Competencia', title: 'Un mercado de *soluciones parciales*', columns: ['Nosotros', 'Competidor'], rows: [{ label: 'Funcionalidad', cells: ['yes', 'no'] }] } },
  { key: 'deck-calculadora', blockType: 'deck-calc', name: 'Deck · Calculadora', props: { eyebrow: 'Haz la cuenta', title: 'Lo que obtienes con *tu ticket*', kind: 'stake', postMoney: 1000000 } },
  { key: 'deck-casos', blockType: 'deck-cases', name: 'Deck · Acuerdos cerrados', props: { eyebrow: 'Tres acuerdos', title: 'Lo que *hemos cerrado.*', items: [{ status: 'Cerrado', title: 'Nombre del acuerdo', meta: 'Cuándo · dónde', text: 'Qué es y por qué importa.' }] } },
];
