# Corsteno CRM v0.0.1

## Alcance

- API Cloudflare Worker + D1.
- CRM con auth, sesiones HttpOnly, multi-tenancy y roles.
- Event API, analytics genérico/WebAR y dashboard.
- Application productiva Cosquín Web con `application_type=webar`.

## Checklist de release

- [ ] Crear D1 productiva
- [ ] Configurar binding
- [ ] Aplicar migrations
- [ ] Configurar secrets
- [ ] Ejecutar bootstrap
- [ ] Crear application credential Cosquín
- [ ] Deploy API
- [ ] Deploy CRM
- [ ] Configurar DNS
- [ ] Configurar CORS
- [ ] Configurar Cosquín production analytics
- [ ] Login admin
- [ ] Login Cosquín
- [ ] Probar Event API
- [ ] Confirmar Analytics
- [ ] Confirmar tenant isolation

## Bootstrap

Variables requeridas, sin valores en el repositorio:

`BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, `BOOTSTRAP_COSQUIN_EMAIL`, `BOOTSTRAP_COSQUIN_PASSWORD`.

Preview:

```bash
pnpm db:bootstrap:production
```

La ejecución productiva requiere explícitamente `ENVIRONMENT=production` y `--execute`. Crea únicamente Corsteno, Cosquín Rock, sus usuarios/memberships, el proyecto Cosquín Rock y Cosquín Web WebAR. No crea eventos ni credenciales de aplicación.

El usuario Cosquín tiene rol `viewer`: puede entrar y consultar dashboard, proyectos y analytics de Cosquín, sin administrar Corsteno ni organizaciones globales.

## Migrations y configuración

Aplicar migrations en orden con `pnpm db:migrate:local` en local o el equivalente D1 productivo. Producción debe usar `WEB_ORIGIN` con origins reales; localhost solo corresponde a `ENVIRONMENT=development`. Cookies productivas usan `HttpOnly; Secure; SameSite=Lax; Path=/`.

La credential de Event API productiva debe generarse separadamente, guardar únicamente su hash y asociarse a Cosquín Web. No reutilizar `cor_app_dev_cosquin_2026`.

Preview: `pnpm credentials:create-production --application cosquin-web`. Para crearla, usar `ENVIRONMENT=production pnpm credentials:create-production --application cosquin-web --execute`; el secret se muestra una sola vez y no se persiste en el repositorio.

## Pendientes de hardening

No hay rate limiting distribuido de login en esta versión; debe resolverse antes o inmediatamente después del despliegue. La protección actual combina cookies HttpOnly, validación de membership, aislamiento por organización y CORS/Origin configurado.
