# Vacant Room Checker: IT 313 Labs

Group 6, IT 313 System Integration and Architecture
Isabela State University, Santiago City Extension Campus

Vandolph Pabillena, Mjhay Trangco, Denjoe Vergara

## Pages

| File | Lab | What it is |
|---|---|---|
| `index.html` | Lab 1 | Instructional guide: how the system connects to the Supabase cloud database |
| `lab2.html` | Lab 2 | Comparison of authentication (AuthN) and authorization (AuthZ) |
| `authn.html` | Lab 2 | Demo: sign in and receive a signed session token |
| `authz.html` | Lab 2 | Demo: the same actions allowed or blocked by role |

Shared files are in `assets/` (`style.css`, `site.js`, `auth-core.js`, `authn.js`, `authz.js`).

## Run it

No build step. Open `index.html` in a browser, or serve the folder:

```
python -m http.server 8000
```

then visit http://localhost:8000.

## Demo accounts (authentication and authorization pages)

| Email | Password | Role |
|---|---|---|
| student@vrc.demo | Student#123 | user |
| admin@vrc.demo | Admin#123 | admin |

These accounts exist only inside the demo scripts. The demos imitate what Supabase Auth does on a server, so the user list and signing secret sit in browser code. A real system must never do that.

## Security note

The Supabase URL and keys in the Lab 1 guide are placeholders (`YOUR-PROJECT-REF`, `sb_publishable_...`). Do not commit real keys, `.env` files, or the secret key.
