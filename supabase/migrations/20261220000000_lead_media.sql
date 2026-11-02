-- Leads (docs/LEADS.md §Vídeo y reserva por tipo): vídeo y enlace de reserva por tipo de lead y por idioma.
-- { "<tipo>": { "<es|en|fr>": { "video": "https://…", "booking": "https://…" } } }. Lo que falte sale del tipo
-- «general» en ese idioma y, si tampoco, de los generales del espacio (booking_url, video_url).
alter table public.lead_settings
  add column if not exists media jsonb not null default '{}' check (jsonb_typeof(media) = 'object' and octet_length(media::text) <= 16000);

-- Enjoy: los vídeos que ya publica su web (locales, DJ y festival; las bodas usan el general). Solo si está vacío.
update public.lead_settings s set media = jsonb_build_object(
  'venue', jsonb_build_object(
    'es', jsonb_build_object('video', 'https://enjoytheclub.es/videos/proof/locales-es.mp4'),
    'en', jsonb_build_object('video', 'https://enjoytheclub.es/videos/proof/locales-en.mp4'),
    'fr', jsonb_build_object('video', 'https://enjoytheclub.es/videos/proof/locales-fr.mp4')),
  'dj', jsonb_build_object(
    'es', jsonb_build_object('video', 'https://enjoytheclub.es/videos/proof/dj-testimonio-es.mp4'),
    'en', jsonb_build_object('video', 'https://enjoytheclub.es/videos/proof/dj-testimonio-en.mp4'),
    'fr', jsonb_build_object('video', 'https://enjoytheclub.es/videos/proof/dj-testimonio-fr.mp4')),
  'festival', jsonb_build_object(
    'es', jsonb_build_object('video', 'https://enjoytheclub.es/videos/proof/festival-es.mp4'),
    'en', jsonb_build_object('video', 'https://enjoytheclub.es/videos/proof/festival-en.mp4'),
    'fr', jsonb_build_object('video', 'https://enjoytheclub.es/videos/proof/festival-fr.mp4')))
from public.tenant t
where t.id = s.tenant_id and t.slug = 'enjoy' and s.media = '{}'::jsonb;
