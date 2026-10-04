-- Aviso por sector (docs/PLAYBOOK.md): lo que el comercial tiene que ver antes de nada en ese sector, en Aprende y en el
-- guion de la reunión. P. ej. conciertos y festivales: «no hemos cerrado ninguna venta todavía…».
alter table public.segment add column notice text check (notice is null or length(notice) <= 600);
