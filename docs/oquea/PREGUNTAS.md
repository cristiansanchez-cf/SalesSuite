# Oquea · lista de preguntas para cerrar el contenido

> Todo lo que quedó abierto al cargar el 01 (empresa), el 05 (catálogo del dossier) y el guion de campo. Marca cada una
> al cerrarla; lo que se decida se carga con su script.

## A · Producto (lo dice el 01 y no está cerrado)
- [ ] 1. Texto literal del acuerdo de centro fundador, por mercado (España, Latinoamérica, Corea).
- [x] 2. ✅ El 10 % es sobre todo lo generado. España: en torno al 5 %, sin decidir → en España el bloque de la comisión no sale y no se dice cifra. Queda: qué es «cliente nuevo» por mercado. Base del 10 % (solo buceo o paquete completo) y qué es «cliente nuevo» en cada mercado. ¿El acuerdo de España recoge el 10 %?
- [x] 3. ✅ En producción (Cristian). ¿Las tres tarjetas (inmersión, récord, hito) están en producción? ¿La gráfica de la de récord es real?
- [x] 4. ✅ «El carrusel mejorado» en producción. Faltan las capturas nuevas. ¿La versión mejorada del QR (7 de octubre) está publicada? Capturas nuevas con ella.
- [ ] 5. App móvil iOS y Android: ¿ya en las tiendas o en noviembre?
- [ ] 6. Idiomas de la web del buceador y del panel del centro (crítico para Corea).
- [ ] 7. «Slot sin dive site»: ¿en producción?
- [ ] 8. ¿El consentimiento de comunicación comercial se recoge en el registro?
- [ ] 9. Contrato de encargo de tratamiento de datos: ¿disponible para firmar? Normativa en Corea y Latinoamérica.
- [ ] 10. Proveedor de pagos y países donde puede operar; revisión legal de pagos fuera de España.
- [ ] 11. Nombre definitivo de la red (provisional: «red de centros fundadores»).

## B · Decisiones de empresa (las pide el guion)
- [x] 12. ✅ Quitada. «Lo que tienes hoy sigue como está»: ¿es decisión de empresa? Si no, se quita de condiciones y del guion.
- [ ] 13. Centro emisor: «Si luego vendéis viajes a mis clientes, ¿qué gano yo?».
- [ ] 14. Condiciones del comercial: porcentaje, base (margen neto), qué lo devenga, desde cuándo, qué se cobra sin pasarela, quién lleva la cuenta, contrato por país.
- [ ] 15. Cuándo contactar a un centro (día y hora): sin dato validado.

## C · Choques con lo cargado antes (decide)
- [x] 16. ✅ **Solo el nombre** (Cristian, 6-oct, tarde: «el centro puede quedar fatal»; `apply-oquea-07.py`). Antes: nombre y logo. La guía decía que la tarjeta lleva el **logo** del centro; el 01, el **nombre**. He dejado el nombre. ¿Lleva también el logo?
- [x] 17. ✅ Vale. «Verificado en menos de 24 h» (lo confirmaste) no está en el 01 ni en el 05. Está como jugada, no en el dossier. ¿Así?
- [ ] 18. «¿Prefieres que lo hagamos por ti?» (Oquea da de alta los dive sites y ayuda a configurar), de la guía: ¿sigue siendo un servicio? Está como jugada.
- [ ] 19. Actividades recurrentes («Prográmalas», de la guía): no están en la lista cerrada y las he quitado. ¿Existen?
- [ ] 20. «Sin descargar nada: se abre en el navegador, oquea.app» (de la guía): ¿se mantiene?

## D · Dossier (el 05 y la plataforma)
- [ ] 21. 🟡 «No está mal pensarlo»: sin hacer. **Variables nuevas** para la fecha (portada y revisión) y el comercial («[Nombre] · [teléfono]»). Hoy la propuesta solo pone el nombre del cliente, así que esas líneas no salen. Es un cambio en la plataforma (vale también para Enjoy). ¿Lo hago?
- [ ] 22. Titulares de los módulos que el 05 no titula: los he puesto yo (lista en `01-05-GUION-CARGADO.md`). ¿Valen?
- [ ] 23. Ángulo por defecto: la receta admite uno solo y he puesto «Que vuelvan». ¿O «Abrir mercado»?
- [x] 24. ✅ Tope 6: ya entra «Tu nombre en cada inmersión». Apoyo visual con tope 5: solo caben los 5 obligatorios y «Tu nombre en cada inmersión» no entra nunca. ¿Subimos a 6?
- [ ] 25. 🟡 ONG cargada de palabra (`apply-oquea-ong.py`): falta documento y confirmar qué remarketing existe hoy. Catálogos para ONG, tour operador y federación o certificadora.
- [ ] 26. Traducciones: coreano, portugués de Brasil e inglés, revisadas por alguien del país.
- [ ] 27. Documentos que faltan: 02 (mercado completo), 04 (tarifas cuando las haya), 06 (casos, cuando existan), 07 (equipo comercial).

## D2 · UI nueva (6-oct, tarde)
- [x] 32. ✅ Por defecto, las 5 tarjetas exportadas por Cristian (inmersión, récord, viaje, hito, especie) tal cual (`apply-oquea-09.py`). Las de HTML quedan para la versión personalizable.
- [x] 33. ✅ Las 5 exportadas van tal cual (con el sticker). Fotos de ejemplo **sin** el sticker: solo harían falta para la versión personalizable (las 5 que mandaste ya lo llevan, y en inglés): pásalas como archivo y las pongo de fondo. Mientras, las busca el alta en Openverse (CC0 / dominio público).
- [ ] 34. La pestaña **Feed** de la barra de abajo (sale en la foto del álbum): ¿en producción? No la he puesto.
- [ ] 35. Mapa interactivo con **MapTiler** (el mismo estilo que la app): necesita la clave de MapTiler y el ID del estilo. Lo dejamos para después, como dijiste.
- [ ] 36. Álbum: «Útil para tus buceadores» / «Y lo comparten: publicidad que no pagas» los he redactado yo a partir de lo que dijiste. ¿Valen?

## E · Puesta en marcha (tuyo)
- [ ] 28. DNS de `oquea.ventas.cofundo.io` en GoDaddy y dominio en Vercel.
- [ ] 29. Quitar a cristianalbertosanchez00@gmail.com del equipo de Oquea (consola → Equipo) cuando entres con cristian.sanchez@cofundo.io.
- [ ] 30. Supabase: «Site URL» está en `http://localhost:3000`. ¿Lo cambiamos?
- [ ] 31. Revisión de la UI de los dossiers y de Aprende (la siguiente fase).
