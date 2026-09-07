# Authentication

Login uses email and password. Passwords use PBKDF2-SHA-256 through Web Crypto with a random salt. A random token is sent in an HttpOnly cookie; only its SHA-256 hash is stored in `auth_sessions`. Sessions expire after seven days and update `last_used_at`.

`requireAuth` resolves the cookie and user. `requireOrganization` requires `X-Organization-Id` and verifies active membership server-side. Roles are ordered viewer < member < admin < owner and permissions map to minimum roles. No JWT or localStorage tokens are used. Before production, add strict Origin validation and distributed login rate limiting.
