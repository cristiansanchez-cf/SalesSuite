# Tu CRM en marcha

Criterio de Cristian (27-nov-2026): un admin nuevo se pasó 20 minutos metiendo 2 o 3 leads uno a uno. No sabía que
podía subir un CSV, dictar, usar su IA (MCP) o mandar audios por WhatsApp. La primera vez hay que decírselo.

## Dónde sale

- **Bienvenida** (`/admin/welcome`): segundo paso, «Mete lo que ya tienes, de golpe», para todos los que llevan el
  CRM. Enseña las formas rápidas y «Ver todas las formas». Los pasos se pueden pedir por nombre (`?step=sell`), así que
  añadir uno no rompe las vueltas desde el recorrido o un sector.
- **`/admin/arranca`** («Tu CRM en marcha»): todas las formas, en tres grupos.
- **Inicio** («Primeros pasos» del admin): «Mete lo que ya tienes». Se tacha con 10 empresas (`FEW_ACCOUNTS`).
- **CRM** (Empresas): con menos de 10 empresas y sin filtros, el aviso «¿Ya tienes clientes en otro sitio?».

## Las formas (`lib/get-started.ts`)

| Grupo | Forma | Adónde lleva | Quién |
|---|---|---|---|
| Lo que ya tienes | Excel o CSV | `/admin/import` | admin |
| | Notion | `/admin/import/notion` | admin |
| | Claude, ChatGPT o una captura (MCP, `importacion_*`) | `/admin/ia` | quien lleva el CRM |
| | Notas o de memoria, pegando o dictando | `/admin/accounts/apuntar` | quien lleva el CRM |
| Cada día | Audio por WhatsApp al asistente (sin móvil: «Pon tu móvil») | `wa.me` o `/admin/account#asistente` | quien lleva el CRM |
| | El botón «Apuntar» | `/admin/accounts/apuntar` | quien lleva el CRM |
| Que entren solos | Leads de la web | `/admin/leads/configurar` | admin |
| | WhatsApp con los leads | `/admin/leads/configurar?abrir=whatsapp` | admin |
| | El equipo | `/admin/team` | admin |
