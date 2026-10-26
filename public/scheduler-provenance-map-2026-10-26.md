# 🗺️ PFL Scheduler & Change Provenance Map (`Task 22040`)
**Prepared By:** `King Argon` (`Gemini 4 Argon Medium` / `@antigravity`) — Head of Covert Intelligence  
**Requested By:** `Paul Prime` & `Lisa Muse` (`public.tasks` Card `#22040`)  
**Mode:** Strictly Read-Only Provenance Audit (Zero runtime/scheduler mutations made)  
**Timestamp:** `2026-10-26T10:50:00-05:00`

---

## 1. Executive Answers to Paul's Core Questions (`Card #22040`)

### Q1: Who or what creates Workboard cards with `created_by = 'system'` (e.g., `22036`, `22037`, `22041`)?
- **Exact Mechanism:** Postgres database trigger **`trg_agent_onboarding`** on table `public.agents`, which executes PL/pgSQL function **`public.fn_agent_onboarding_task()`** whenever a new row is inserted into `public.agents`:
  ```sql
  INSERT INTO tasks (created_by, assigned_to, title, description, status, priority)
  VALUES (
    'system',
    NEW.handle,
    'ONBOARDING: pick up your skills',
    'Real, pointer-only card, no duplicated text: your baseline skills ...',
    'pending',
    5
  );
  ```
- **Other Automatic Card Creators in Postgres (`public.tasks`):**
  1. **`signoff_gate_trigger` (`fn_gate_task_completion()` on `public.tasks`)**: Whenever a worker updates a task to `status = 'completed'`, this BEFORE UPDATE trigger intercepts it, sets the worker's card to `pending_review`, looks up the worker's supervisor via `agents.reports_to`, and inserts a `SIGN-OFF: <title>` card with `created_by = 'signoff_gate_trigger'` (e.g., Cards `22047` and `22048` assigned to `@lisa-muse`).
  2. **`trigger_prime_prompt_to_task` (`create_task_from_prime_prompt()` on `public.prompts`)**: Creates task cards from inbound owner/participant prompts when `goal_candidate = true`.
  3. **`trg_auto_card_from_source` (`fn_auto_card_from_source()` on `public.discovered_sources`)**: Automatically creates ingestion cards from newly discovered sources.

---

### Q2: Why do Workboard announcements in Buzz come from pubkey `3bb5da65...`?
- **Exact Mechanism:**
  1. When a row in `public.tasks` transitions to `pending` or `pending_review`, Postgres trigger **`trg_card_new_pending` / `trg_card_escalation`** (`public.notify_escalation_to_buzz()`) inserts a message into table **`public.buzz_outbox`** targeting `channel_id = '7b3e1526-185c-4831-b750-fb57b0ae10d1'` (`pfl-atrium`).
  2. Systemd service **`/etc/systemd/system/buzz-escalation-broadcaster.service`** (rebuilt `2026-09-07` by `@friday-fable-holmes`) runs `/home/paul/project-free-life/openclaw/buzz_escalation_broadcaster.py`.
  3. That daemon signs every outbox broadcast using **`/home/paul/.openclaw/credentials/buzz_workboard_system_key.txt`**, whose Nostr public key is **`3bb5da657d551838b227c48b13192087ca6d689c79cd5360ce28941798a93af2`**.

---

### Q3: Who built and runs the Scheduler / Dispatcher? (Paul's Hypothesis: *Did Codex build or run the scheduler?*)
- **Verdict — CONFIRMED (`Two-Part Provenance: Friday Built V1, Codex Modified & Deployed the Active Windmill V2 Dispatcher`):**
  1. **Original Design (`2026-07-13` to `2026-07-25`, `@friday`):**
     - Friday originally created `/home/paul/mcp_backup/lisa-db-mcp/dispatcher.py` under `/etc/cron.d/dark-factory-dispatcher` (`2026-07-13`) and migrated it into **Windmill Community Edition** on `2026-07-24` (`f/w/d` scheduled via `f/w/d_s` every 2 minutes: `0 */2 * * * *`, plus reaper `f/w/r` scheduled via `f/w/r_s` every 10 minutes: `0 */10 * * * *`).
  2. **Active Lease & Recovery Logic (`2026-09-10` to `2026-09-13`, `@codex`):**
     - **Paul's hypothesis is spot-on:** **Codex (`Codex CTO <codex@projectfreelife.ai>`)** authored the active version of `f/w/d` currently running in Windmill (`hash = -8876280135809724262`, deployed `2026-09-13 20:28:05 CDT`, summary: *"Unified PFL dispatcher with lease-safe frontier recovery"*) and the matching git commits in `/home/paul/project-free-life`:
       - `27862ba` (`2026-09-13 20:31:22 -0500`, `Codex CTO`): `fix(dispatcher): preserve frontier leases during long work`
       - `7c6099c` (`2026-09-13 20:41:45 -0500`, `Codex CTO`): `fix(chatdev): route frontier council and verify artifacts`
       - `f834d21` (`2026-09-13 20:43:42 -0500`, `Codex CTO`): `fix(workers): persist leases threads and evidence receipts`
  3. **What is Running It Right Now:**
     - **Windmill Schedule `f/w/d_s` (`0 */2 * * * *`, `enabled = true`)** executes Windmill script **`f/w/d`** inside the Windmill worker container every 2 minutes, spawning `/home/paul/project-free-life/openclaw/agent_processor.py` and logging every run to `public.dispatcher_log` (e.g., `id = 125525` at `10:46:01 CDT`).

---

### Q4: Who changes seat configs and bridges, and why are seats absent or quiet in the room?
- **Systemd Seat Services (`/etc/systemd/system/*-buzz.service.d/`):**
  - Each Buzz seat runs under a system-level unit (`antigravity-buzz.service`, `codex-buzz.service`, `friday-buzz.service`, `lisa-buzz.service`, `mckay-buzz.service`, `zelenka-buzz.service`, `sparky-buzz.service`, `bumble-buzz.service`, `honey-buzz.service`).
  - **Provenance of `*.conf` Drop-In Overrides (`/etc/systemd/system/*-buzz.service.d/`):**
    - `2026-08-22` to `2026-09-18`: Created by **`@friday`** (`override.conf`, `zzzzzzz-workboard-key-fix.conf`, `zzzzzz-mention-scope.conf`).
    - `2026-09-25` to `2026-09-28`: Modified by **`@friday` / `@lisa`** (`zzzzzzzzzz-lisa-muse-allowlist.conf`, `zzzzzz-routing.conf.bak-castrate-paul-20260927`, `zzzzzzzzzzzzzzz-ghost-ship.conf`).
    - `2026-10-20 18:50` & `19:50`: Modified during WO2 recovery (`zzzzzzzzzzzzz-listen.conf` on `antigravity-buzz`, `mckay-buzz`, `sparky-buzz`, `zelenka-buzz`, and `zzzzzzzzzzzzzzzzzzzzzzzzzzzzzz-lisa-buzz-session-current.conf` on `lisa-buzz`).
- **Why Seats Appear Absent or Quiet in `pfl-atrium`:**
  1. **`--subscribe mentions` + Strict `--respond-to allowlist`**: Every seat (`antigravity`, `codex`, `friday`, `lisa`, `mckay`, `zelenka`, `sparky`, `bumble`, `honey`) is configured with `BUZZ_ACP_SUBSCRIBE=mentions` (`zzzzzzzzzzzzzzzz-mentions-only.conf`). Unless a message explicitly includes their Nostr `["p", "<pubkey>"]` tag (or matches `BUZZ_ACP_NAMES` from an owner in `BUZZ_ACP_HUMAN_OWNERS`), `buzz-acp` intentionally ignores the event so agents do not flood the room.
  2. **Gateway Session Lock / Read-Only Jail on `antigravity-buzz.service` (`Card #22042`)**: The background `antigravity_acp.py` adapter spawns `/home/paul/.local/bin/agy -p ...` inside a read-only jail (`can write ONLY under /home/paul/antigravity_workspace`) whereas the interactive Windows Desktop Antigravity IDE session has full tool access.
  3. **Expired Leases (`38` Total in `public.tasks`)**:
     - Querying `SELECT status, count(*) FROM public.tasks WHERE lease_expires_at IS NOT NULL AND lease_expires_at < NOW() GROUP BY status;` shows **`38` rows** with past `lease_expires_at` timestamps:
       - `27` in `status = 'escalated'` (`2026-09-11` to `2026-09-27`)
       - `10` in `status = 'pending_review'` (`2026-09-21` to `2026-10-10`)
       - `1` in `status = 'pending'` (`2026-10-26`)
       - **`0` in `status = 'in_progress'`** (confirming **zero silent active claims**; the Windmill `f/w/d` stale-claim reaper clears `in_progress` leases older than 15 minutes, but does not NULL out `lease_expires_at` when a card moves to `escalated` or `pending_review`).

---

## 2. Summary Provenance Table

| Subsystem | Active Mechanism / Path | Cadence / Trigger | Original Author | Latest Maintainer (`git` / DB) |
|---|---|---|---|---|
| **Workboard Dispatcher** | Windmill `f/w/d` (`f/w/d_s`) → `openclaw/agent_processor.py` | Every 2 min (`0 */2 * * * *`) | `@friday` (`2026-07-13`) | `@codex` (`2026-09-13`, `commit f834d21`) |
| **Windmill Job Reaper** | Windmill `f/w/r` (`f/w/r_s`) | Every 10 min (`0 */10 * * * *`) | `@friday` (`2026-07-25`) | `@codex` / `admin` |
| **Onboarding Cards (`created_by=system`)** | Postgres trigger `trg_agent_onboarding` → `fn_agent_onboarding_task()` | `AFTER INSERT ON public.agents` | `@friday` | System DB Trigger |
| **Sign-Off Cards (`SIGN-OFF: ...`)** | Postgres trigger `trg_gate_task_completion` → `fn_gate_task_completion()` | `BEFORE UPDATE ON public.tasks` | `@friday` | `@antigravity` (`2026-09-09`, `commit 520b965`) |
| **Verification Gate (`AUTO-ROUTED`)** | `fn_run_verification_rules()` + `public.verification_rules` (Rules `5–10`) | `BEFORE UPDATE ON public.tasks` | `@friday` (`2026-07-15` / `09-17`) | `@friday-fable-holmes` |
| **Workboard Buzz Posts (`3bb5da65`)** | `notify_escalation_to_buzz()` → `buzz_outbox` → `buzz-escalation-broadcaster.service` | `AFTER INSERT/UPDATE ON public.tasks` | `@friday-fable-holmes` (`2026-09-07`) | `@friday-fable-holmes` |
| **User Crontab (`paul`)** | `upload_vids.py` (`*/30`), `service-health-check.py` (`*/5`), `promptlog_to_postgres.py` (`*/5`), `talk_tailer.py` (`*`), `codex-usage.py` (`5 *`) | Cron (`1m`–`60m`) | `@lisa` / `@friday` / `@codex` | Active |
| **Covert Intel & Gas Gauge Roundup** | `/home/paul/antigravity_workspace/roundup_collective_intel.py` | Every 20 min (`task-9558` in Antigravity IDE) | `@antigravity` (`King Argon`) | `@antigravity` (`2026-10-26`) |
