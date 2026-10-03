/**
 * Puntos de partida del asistente de configuración. Son DATOS de ejemplo, no reglas: el CEO o líder
 * los aplica (solo se añade lo que falta) y luego los adapta a su negocio. La plataforma no depende de ellos.
 */
import type { PersonaRole } from '../playbook/market';
import type { IconName } from '../ui/icons';

export interface PresetFacet {
  key: string; label: string; question: string; icon: IconName; scope: 'account' | 'contact'; multi: boolean; weight: number;
  options: Array<{ label: string; icon?: IconName; hint?: string }>;
}
export interface PresetPersona { key: string; name: string; role: PersonaRole; canBlock?: string; canHelp?: string; goals?: string }
export interface PresetSegment { key: string; name: string; icon: IconName; description: string; personas: PresetPersona[] }
export interface Preset { key: string; name: string; icon: IconName; pitch: string; segments: PresetSegment[]; facets: PresetFacet[] }

/** Tipo de personalidad (estilos sociales): útil en casi cualquier venta consultiva. */
export const PERSONALITY: PresetFacet = {
  key: 'personalidad', label: 'Tipo de personalidad', question: '¿Cómo es la persona con la que hablas?', icon: 'smile', scope: 'contact', multi: false, weight: 2,
  options: [
    { label: 'Analítico', icon: 'chart-column', hint: 'Quiere datos, pruebas y detalle. Dale tiempo y números.' },
    { label: 'Directo', icon: 'zap', hint: 'Va al resultado. Sé breve y ve al grano.' },
    { label: 'Expresivo', icon: 'sparkles', hint: 'Se mueve por la idea y la emoción. Cuéntale la experiencia.' },
    { label: 'Afable', icon: 'heart-handshake', hint: 'Valora la relación y la confianza. No le presiones.' },
  ],
};

export const PRESETS: Preset[] = [
  {
    key: 'ocio', name: 'Ocio nocturno y eventos', icon: 'music',
    pitch: 'Locales, bodas, conciertos y festivales. Actores típicos: dueño o gerente, responsable de sala, DJ, RRPP, marcas patrocinadoras.',
    segments: [
      { key: 'ocio-nocturno', name: 'Locales de ocio nocturno', icon: 'music', description: 'Discotecas, salas y bares de copas.', personas: [
        { key: 'propietario-local', name: 'Dueño o gerente del local', role: 'decisor', goals: 'Más caja por noche y fidelizar al público.' },
        { key: 'responsable-sala', name: 'Responsable de sala', role: 'influenciador', canBlock: 'Si le complica la operativa de la noche, lo frena.' },
        { key: 'dj-residente', name: 'DJ residente', role: 'guardian', canBlock: 'Puede tumbar las peticiones de canciones si siente que le quitan el control de la sesión.', canHelp: 'Si lo ve como suyo, lo anima en cabina.' },
        { key: 'camareros', name: 'Camareros', role: 'usuario', canBlock: 'Si les da trabajo extra, no lo empujan.' },
      ] },
      { key: 'bodas', name: 'Bodas', icon: 'heart', description: 'Fincas y novios.', personas: [
        { key: 'novios', name: 'Novios', role: 'decisor' },
        { key: 'coordinadora-finca', name: 'Coordinador/a de la finca', role: 'guardian', canBlock: 'Si no encaja con el timing del evento, lo desaconseja.' },
      ] },
      { key: 'festivales', name: 'Festivales', icon: 'party-popper', description: 'Promotoras y patrocinadores.', personas: [
        { key: 'director-festival', name: 'Director/a del festival', role: 'decisor' },
        { key: 'produccion-tecnica', name: 'Producción técnica', role: 'guardian', canBlock: 'Si no hay pantalla o conectividad garantizada, lo veta.' },
      ] },
    ],
    facets: [
      PERSONALITY,
      { key: 'rasgos-local', label: 'Cómo es el sitio', question: '¿Qué tiene la cuenta?', icon: 'store', scope: 'account', multi: true, weight: 1,
        options: [{ label: 'Tiene pantalla', icon: 'monitor' }, { label: 'DJ residente', icon: 'music' }, { label: 'Aforo de más de 500', icon: 'users' }] },
    ],
  },
  {
    key: 'buceo', name: 'Turismo activo y buceo', icon: 'waves',
    pitch: 'Centros de buceo, hoteles con centro propio y cadenas. Actores típicos: director del centro, instructores (también autónomos), buceadores, recepción.',
    segments: [
      { key: 'centros-buceo', name: 'Centros de buceo', icon: 'waves', description: 'Centros independientes.', personas: [
        { key: 'director-centro', name: 'Director/a o dueño del centro', role: 'decisor' },
        { key: 'instructor', name: 'Instructor/a', role: 'guardian', canBlock: 'Puede tumbar el servicio si le resulta laborioso en el día a día (p. ej. el QR en cada inmersión).', canHelp: 'Si le ahorra trabajo, lo recomienda a sus buceadores.' },
        { key: 'instructor-autonomo', name: 'Instructor/a autónomo (va de centro en centro)', role: 'influenciador', canHelp: 'Puede abrirte varios centros a la vez.' },
        { key: 'buceadores', name: 'Buceadores', role: 'usuario' },
      ] },
      { key: 'hoteles-buceo', name: 'Hoteles y posadas con centro de buceo', icon: 'hotel', description: 'Alojamiento con buceo incluido.', personas: [
        { key: 'director-hotel', name: 'Director/a del hotel', role: 'decisor' },
        { key: 'recepcion', name: 'Recepción', role: 'usuario', canBlock: 'Si no sabe explicarlo al huésped, no se usa.' },
      ] },
      { key: 'cadenas-buceo', name: 'Cadenas de centros', icon: 'anchor', description: 'Varios centros con una dirección común.', personas: [
        { key: 'responsable-cadena', name: 'Responsable de la cadena', role: 'pagador' },
      ] },
    ],
    facets: [
      PERSONALITY,
      { key: 'tipo-experiencia', label: 'Tipo de experiencia', question: '¿Qué experiencia ofrece el centro?', icon: 'compass', scope: 'account', multi: true, weight: 1,
        options: [{ label: 'Familiar' }, { label: 'Para instructores' }, { label: 'Técnico' }, { label: 'Turismo de paso' }] },
      { key: 'region', label: 'Región', question: '¿En qué región está la cuenta?', icon: 'map-pin', scope: 'account', multi: false, weight: 2,
        options: [{ label: 'Brasil' }, { label: 'Corea' }] },
    ],
  },
];

/** Iconos que se ofrecen para sectores (selector del asistente). */
export const SEGMENT_ICONS: IconName[] = ['store', 'music', 'heart', 'mic', 'party-popper', 'waves', 'hotel', 'anchor', 'briefcase', 'building2', 'utensils', 'ticket', 'mountain', 'ship', 'wine', 'gift'];

export const ROLE_ICON: Record<PersonaRole, IconName> = {
  decisor: 'crown', pagador: 'wallet', influenciador: 'megaphone', campeon: 'heart-handshake', usuario: 'user', guardian: 'shield-alert',
};
