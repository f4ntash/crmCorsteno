# Catálogo de productos — Demo comercial

## Preparación

Desde la raíz del repositorio, con el entorno local de Cloudflare detenido o
disponible:

```text
pnpm db:migrate:local
pnpm seed:local
pnpm demo:catalog
pnpm dev
pnpm --filter @corsteno/runtime dev
```

`pnpm demo:catalog` prepara o actualiza una organización local dedicada,
`Lumbre Norte`, con cinco productos de iluminación, imágenes locales y un
catálogo publicado. El comando es repetible y siempre usa D1/R2 de Wrangler
con `--env development --local`; nunca apunta a producción o a una base remota.

Para reconstruir desde cero los datos de esta demo local dedicada:

```text
pnpm demo:catalog:reset
```

Ese comando solo reemplaza los registros con los identificadores fijos de
`Lumbre Norte` en la base local. No usarlo para una base compartida con datos
que se quieran conservar.

## Acceso

- CRM: [http://localhost:5173/app](http://localhost:5173/app)
- Catálogo público: [http://localhost:5175/r/lumbre-norte-catalogo-publico](http://localhost:5175/r/lumbre-norte-catalogo-publico)
- Workspace del catálogo: `http://localhost:5173/app/experiences/00000000-0000-4000-8000-000000000073`
- Resultados: [http://localhost:5173/app/analytics](http://localhost:5173/app/analytics)
- Atención: [http://localhost:5173/app/attention](http://localhost:5173/app/attention)
- Reportes: [http://localhost:5173/app/reports](http://localhost:5173/app/reports)
- Actividad: [http://localhost:5173/app/activity](http://localhost:5173/app/activity)

Usá la cuenta local creada por `pnpm seed:local` (la cuenta de desarrollo
incluida en el repositorio). No se requieren credenciales de producción ni
claves externas.

## Historia de demo

Duración sugerida: 5–10 minutos.

1. **SHOW — catálogo público.** Abrí el enlace público en desktop y después en
   390×844. Mostrá el encabezado de Lumbre Norte, la grilla de luminarias,
   precios en ARS, stock disponible, el estado agotado y las vistas secundarias
   de Lámpara Nido.
2. **SAY — experiencia para el cliente.** “Corsteno convierte una colección
   de productos en una experiencia pública clara, con disponibilidad y una
   consulta directa, sin obligar a construir un e-commerce completo.”
3. **SHOW — control en CRM.** Volvé al workspace de la experiencia. Mostrá la
   presentación, el editor de productos, imágenes, galería, visibilidad y el
   orden público.
4. **SHOW — cambio de campaña.** Editá Lámpara Bruma, cambiá el precio o el
   stock y guardá. Mostrá que el workspace marca cambios sin publicar.
5. **SHOW — publicación segura.** Volvé al catálogo público antes de publicar:
   el snapshot público no cambia. Publicá desde el workspace y recargá el
   enlace para mostrar el nuevo precio o stock.
6. **SHOW — operación.** Abrí Resultados para mostrar la actividad genérica
   real de la visita pública, Atención para el producto agotado y Reportes para
   descargar `Inventario de productos`.
7. **SAY — continuidad operativa.** “El equipo puede ajustar la oferta desde
   un único espacio, conservar el control editorial y ver qué requiere
   atención sin perder el contexto de la campaña.”

La demo no simula ventas, pedidos ni conversiones. Los eventos de Analytics
aparecen cuando se abre el enlace público y los datos operativos visibles son
los que existen en el catálogo local.
