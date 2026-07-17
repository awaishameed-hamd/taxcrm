# CA Firm CRM — Project Context

A CRM for a Pakistani chartered-accountancy firm (Asif Associates), replacing a
WhatsApp/email workflow. Client management, tax-return task pipelines, FBR notices &
appeals, attendance/leaves, chat, and invoicing & payments.

**Do not modify the Call Center CRM at `C:\Users\HP\callcenter-crm`.** It is a separate,
older Laravel project. Reference it only for patterns (its invoicing flow was the model
for this one).

---

## Working agreement

- **Respond in English only.** Never Urdu.
- **Deploy is user-gated.** Do the local work (edit → typecheck → build → commit → push),
  then **stop and tell the user to change the WiFi**, and wait for their go-ahead before
  any `ssh argroup-vps` step. Their default network's firewall blocks the VPS; GitHub
  pushes work fine on it. Never batch the SSH deploy into the same turn as the build.
- **No local dev servers or browser testing.** Build + typecheck, report, the user verifies
  on the deployed site himself.
- **Keep changes proportional to the ask.** Don't add schema/tracking/abstractions that
  weren't asked for. Small UI asks get small direct edits.
- **No em dashes in UI copy** (dropdowns, tables, labels) — use readable text or leave blank.
- **Tech stack is FIXED.** PostgreSQL (never MySQL/SQLite), NestJS, Next.js, Turborepo +
  pnpm. If something isn't installed, say so — don't substitute.

---

## Layout

Turborepo + pnpm monorepo at `C:\Users\HP\ca-firm-crm`.

```
apps/api          NestJS + Prisma + PostgreSQL   (port 4000, prefix /api)
apps/web          Next.js 14 App Router          (port 3000)
apps/mobile       React Native/Expo stub — Phase 2, ignore
packages/shared   enums/types shared across apps (@ca-firm/shared)
packages/tsconfig shared tsconfigs
```

- Prisma schema: `apps/api/prisma/schema.prisma`
- Global `PrismaModule` (@Global) — no need to import it per module
- `TransformInterceptor` wraps every response as `{ success, data, timestamp }`, so
  frontend code reads `data.data ?? data`
- `GlobalExceptionFilter` standardises errors
- Global `ValidationPipe` with `whitelist`, `forbidNonWhitelisted`, `transform`, and
  `transformOptions.enableImplicitConversion` — the last one matters: without it,
  numeric strings from `<input type="number">` fail `@IsNumber()` and silently 400.

### API modules (`apps/api/src/modules/`)
attendance, auth, chat, client-login-details, clients, dashboard, email, fbr, files,
form-fields, income-tax-returns, invoices, leaves, notifications, pipeline-steps, prisma,
profile, role-permissions, sales-tax-returns, sales-tax-tasks, tasks, users, working-days

### Web routes
`apps/web/src/app/(dashboard)/[role]/…` — one folder per role (admin, partner, manager,
team-lead, trainee, client), each page a thin wrapper re-exporting a shared component from
`apps/web/src/components/`. Nav lives in `components/layout/Sidebar.tsx` (`NAV` map, keyed
by role).

---

## Deploy

**Host:** Hostinger VPS, `ssh argroup-vps` (root@200.97.169.223, key `~/.ssh/id_ed25519`)
**Public URL:** https://argroup.cloud
**App dir:** `/var/www/ca-firm-crm`
**Repo:** https://github.com/awaishameed-hamd/taxcrm.git — branch `main`
**Node 20 / pnpm 10** on both sides.

Nginx (`/etc/nginx/sites-enabled/argroup.conf`, Certbot TLS) routes:
`/api/`, `/uploads/`, `/socket.io/` → `127.0.0.1:4000` · `/` → `127.0.0.1:3000`

PM2: `ca-firm-api` (**cluster mode, 2 workers**) and `ca-firm-web` (fork).

```bash
# only after the user confirms the WiFi is switched
ssh argroup-vps "cd /var/www/ca-firm-crm && git pull origin main"
ssh argroup-vps "cd /var/www/ca-firm-crm/apps/api && npx prisma db push"   # only if schema changed
ssh argroup-vps "cd /var/www/ca-firm-crm/apps/api && npx nest build && cd ../web && npx next build"
ssh argroup-vps "pm2 restart ca-firm-api ca-firm-web"
# then verify it actually booted — a bad module wiring only fails at runtime:
ssh argroup-vps "pm2 logs ca-firm-api --lines 4 --nostream --out | grep -c 'successfully started'"   # expect 2
```

**Cluster mode has bitten us:** every `@Cron` fires **once per worker**. Any job that does
check-then-create races itself. Use `createMany({ skipDuplicates: true })`, or catch `P2002`
and treat it as "the other worker got there first". The auto-absent sweep failed daily for
weeks because of this.

**Migrations:** use `npx prisma db push`, **not** `prisma migrate dev` — an old migration
(`20260625000000_link_returns_to_task_cascade`) breaks the shadow DB. Same on both sides.

**DB:** `sudo -u postgres psql -d ca_firm_crm` on the VPS; local dev DB is `ca_firm_crm` too.

**Known config gap:** `RESEND_API_KEY` is **empty** in the VPS `.env`, so email (client
portal invites) is silently disabled — the code handles it gracefully and logs a warning.
Needs a real key from the user; not a code bug.

---

## Roles

`ADMIN > PARTNER > MANAGER > TEAM_LEAD > TRAINEE`, plus `CLIENT` and `REPRESENTATIVE`
(non-staff). Enum in `packages/shared/src/enums.ts`.

- Nav items carry an optional `permission` key, filtered against `role-permissions`.
- **Billing (Invoicing + Invoice Approval + the client Billing section) is ADMIN/PARTNER/
  MANAGER only** — Team Leads and Trainees never see it, enforced on the API too.
- Clients always have `attendanceApplicable: false` — they must never appear in attendance.

---

## Tax task pipeline

`SalesTaxTask` covers Sales Tax / Income Tax / WHT via a `taskType` discriminator.
Steps are admin-editable rows in `PipelineStepConfig`, seeded on boot from `DEFAULT_STEPS`
in `pipeline-steps.service.ts`. **7 steps:**

DATA_COLLECTION → DRAFT_PREPARATION → CLIENT_REVIEW → ANNEXURE_UPLOAD →
INCHARGE_REVIEW *(Manager)* → CHALLAN_GENERATED → FILED → COMPLETED

`SUBMISSION_APPROVAL` was **removed** from the flow but the enum value still exists in the
DB (dropping it would break history rows). Don't reintroduce it.

`SENT_BACK` is a distinct status: a manager returns work to the trainee with a required
reason; re-submit returns it to the step it came from.

Completed tasks freeze `stepsSnapshot` so later config changes don't rewrite history.

## FBR (Notices & Appeals)

`FbrCase` → `FbrNoticeRound` / `FbrAppeal` / `FbrStayApplication` / `FbrHearing`. Each step
is a date field plus a `*ById` actor field. Role tiers are enforced **in the service**
(`MANAGER_TIER`, `PARTNER_TIER`, `assertRoleTier`), not just at the controller — the
controller allows all roles so trainees can do their own steps, and the service gates the
manager/partner-only fields. "Notice received" is a **Trainee** step, not a manager one.

---

## Invoicing & Payments

Two separate sections, deliberately:

- **Invoice Approval** — the manager's queue. Drafts across all clients: price them
  (Professional Fee / Sales Tax / Out of Pocket / Due Date) and Send, mark as covered by
  the retainer, or delete. Nav badge = pending draft count.
- **Invoicing** — the client's account only: ledger/statement, issued invoices, payments,
  Receive Payment, opening balance. **Drafts never appear here** — an invoice shows up
  under its client the moment it's sent.

**Draft generation** (`createDraftForTask`, called when a task hits COMPLETED):
- Covered by the client's monthly retainer → rolls into **that month's single retainer
  draft**, pre-priced at the agreed fee. One bill per client per month however many
  services ran. The monthly cron (1st, 00:20) and task completion share
  `ensureRetainerInvoice`.
- Not covered → its own draft at zero for the manager to price.
- Drafting is best-effort: a failure is logged and never rolls back the task completion.

**Money model — read this before touching it:**
- `Payment` belongs to the **client**, not an invoice (clients pay in advance).
  `PaymentAllocation` says how much of a payment went to which invoice.
- An allocation carries **cash + discount + incomeTaxWithheld + salesTaxWithheld**. Clients
  routinely take a discount and withhold tax at source, so cash alone can't settle an
  invoice. All four roll up onto the invoice and together decide its status.
- Invoice `amountPaid`/`discountTotal`/`incomeTaxWithheld`/`salesTaxWithheld` are **always
  recomputed from the allocations** (`recomputeInvoices`), never incremented.
- **Balance = amount − (cash + discount + ITW + STW)** everywhere. Never `amount − amountPaid`.
- Discount and withholding get their **own credit rows in the ledger**, otherwise a settled
  invoice still shows a balance.
- Overpayment: `overpaymentType` is `ADVANCE` (credit — full amount credits, balance goes
  negative, apply later) or `BONUS` (income — only the applied part credits, balance lands
  at 0, the rest shows as Bonus).
- Statuses: DRAFT → SENT → OVERDUE / PARTIALLY_PAID → PAID, plus RETAINER_INCLUDED and
  CANCELLED. OVERDUE is swept on read (`sweepOverdue`) and un-swept if the due date moves.
- **Opening balance** is per client, set from Invoicing (right-click a client in the
  sidebar), **not** from the client edit form.
- The ledger is period-aware: "Opening Balance" means balance brought forward to the start
  of the selected range, so opening + invoiced − settled always ties out.

---

## UI conventions

Everything should look like one app. Reuse, don't invent:

- Palette: `apps/web/src/lib/palette.ts`. Navy `#132E57`, teal `#1E8496`, gold `#F2AC18`.
- Page titles: Angelos font, `fontSize: 22`, `transform: skewX(12deg)`, navy.
- Body font: Aptos. Stat-card labels: Ethnocentric Rg.
- **Stat cards** — copy `StatCard` from `attendance/AttendanceApprovalPage.tsx`
  (coloured fill, big number on top, small label under).
- **Second sidebar** — 340px in Tasks, 280px in Files/Invoicing; `#EDF0F3` background,
  Angelos header + collapse chevron, white search box, rounded row cards. Tasks uses a
  numbered teal square; Files/Invoicing use a small dot.
- **Filter bars** — teal rounded pill bar, navy for the active pill.
- **Tables** — gold `#F2AC18` header, compact rows (`padding: '6px 12px'`).
- Detail views (Attendance Report calendar, Receive Payment) render **inline in the right
  pane with a coloured header + "← Back"**, not as floating modals.
- Dropdowns: `StyledSelect` / `SearchableSelect` — never a bare `<select>`.

---

## Test credentials

admin / Admin@123 · D001 Director / Director@123 · M001 Manager / Manager@123 ·
A002 Agent / Test@1234 *(seeded; also partner@cafirm.com / Partner@123 etc. from the Prisma seed)*
