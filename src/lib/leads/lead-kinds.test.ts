import { describe, expect, it } from 'vitest';
import { sampleLead, shownKinds } from './lead-kinds';

describe('qué tipos de solicitud se enseñan a cada empresa', () => {
  it('sin leads de otros tipos, solo «General» y un lead de ejemplo general', () => {
    expect(shownKinds([], {})).toEqual({ media: ['general'], questions: ['general'] });
    expect(sampleLead([]).type).toBe('general');
  });

  it('los que le llegan (tipo, event_type o intent) y los que ya tiene personalizados', () => {
    const k = shownKinds(['general', 'venue', 'trial_ended'], {
      media: { custom_dev: { es: { video: 'https://v.x/a' } } },
      templates: { es: { questions: { wedding: '¿Fecha?' } } },
    });
    expect(k.media).toEqual(['general', 'venue', 'custom_dev']);
    expect(k.questions).toEqual(['general', 'venue', 'wedding', 'trial_ended']);
    expect(sampleLead(['venue']).type).toBe('venue');
  });
});
