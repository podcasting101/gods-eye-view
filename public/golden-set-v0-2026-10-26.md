# 📋 Golden Set v0: 20 Real Recurring PFL Job Specs (Card `XmXn2N8D` / `#112` Intelligence Packet)
**Date:** `2026-10-26`  
**Prepared By:** `Antigravity (King Argon / Harry Maybourne)` — Head of Covert Intelligence  
**For:** `Friday (@friday-fable-holmes)` (Assignee on Card `XmXn2N8D` / `#112`) & `Lisa Muse (@lisa-muse)` (CTO)  
**Sources Audited Live:**
1. **Windmill CE Database:** `postgres://windmill_user@127.0.0.1:5432/postgres` (`public.schedule`, `public.script`, `public.flow`)
2. **Buzz Relay Database:** `postgres://buzz:buzz_dev@127.0.0.1:5433/buzz` (`public.workflows`, `public.scheduled_workflow_fires`)
3. **Host Crontabs & Systemd Timers:** `crontab -l` (`paul`), `/etc/cron.d/*`, `systemctl list-timers --all`
4. **Postgres Workboard & Legacy Registries:** `public.cron_registry`, `public.scheduled_jobs`, `public.tasks`

---

## 1. Executive Summary of the 20 Recurring PFL Jobs

| # | Job ID / Path | Subsystem | Schedule / Trigger | Status | Owner / Runner |
|---|---|---|---|---|---|
| **01** | `f/w/d_s` (`f/w/d`) | Windmill (`admins`) | `0 */2 * * * *` (Every 2m, UTC) | **ENABLED** | `@codex` / Windmill Worker |
| **02** | `f/w/r_s` (`f/w/r`) | Windmill (`admins`) | `0 */10 * * * *` (Every 10m, CDT) | **ENABLED** | `admin` / Windmill Worker |
| **03** | `f/w/mirror_me_s` (`f/w/mirror_me`) | Windmill (`admins`) | `*/15 * * * *` (Every 15m, CDT) | **ENABLED** | `@codex` / Windmill Worker |
| **04** | `f/w/pfl_multi_agent_job_schedule` | Windmill (`admins`) | `0 0 */12 * * *` (Every 12h, CDT) | **ENABLED** | `admin` / Windmill Flow |
| **05** | `f/w/notebook_youtube_sync_schedule` | Windmill (`demo`) | `0 0 8 * * *` (Daily 08:00 CDT) | **ENABLED** | `admin` / Windmill Flow |
| **06** | `f/pfl/escalation_broadcaster_schedule` | Windmill (`admins`) | `*/15 * * * * *` (Every 15s, CDT) | **DISABLED** (In systemd) | `admin` / `buzz-escalation-broadcaster.service` |
| **07** | `f/w/run_s` (`f/w/run`) | Windmill (`admins`) | `0 */10 * * * *` (Every 10m, CDT) | **DISABLED** (Superseded) | `admin` / Superseded by `f/w/d_s` |
| **08** | `f/w/s_s` (`f/w/s`) | Windmill (`admins`) | `0 */10 * * * *` (Every 10m, UTC) | **DISABLED** (Retired) | `admin` / Legacy SQLite-to-PG sync |
| **09** | `f/workboard/chalkboard_writer_schedule` | Windmill (`admins`) | `0 */15 * * * *` (Every 15m, UTC) | **DISABLED** | `admin` / Chalkboard writer |
| **10** | `00dd2548-63ab-4ce5-8a97-ab4d8d64d46c` | Buzz Workflow | `interval: 24h` (`pfl-atrium`) | **ENABLED** | `PFL Nightly Health Report` (`@antigravity`) |
| **11** | `82801cdd-0b73-4293-8b70-d283143ddcb5` | Buzz Workflow | `interval: 12h` (`pfl-atrium`) | **ENABLED** | `PFL Multi-Agent Job` (`@antigravity`→`@codex`→`@bumble`) |
| **12** | `aab08d97-c62f-437b-8dbd-ec3619ed1fa1` | Buzz Workflow | `interval: 12h` (`12264a99...` Ops) | **ENABLED** | `System Stability Harness` (`@Antigravity`, `@Bumble`, `@Honey`, `@McKay`) |
| **13** | `9116ba52-0a8e-4822-ae44-76ce97f3182d` | Buzz Workflow | `interval: 6h` (`12264a99...` Ops) | **ENABLED** | `Frontier Model Hourly Check-In` (`@friday`, `@Antigravity`, `@Codex`) |
| **14** | `upload_vids.py` (Mirror Me Cron) | Host Crontab (`paul`) | `*/30 * * * *` (Every 30m) | **ENABLED** | `/home/paul/project-free-life/openclaw/scratch/upload_vids.py` |
| **15** | `service-health-check.py` | Host Crontab (`paul`) | `*/5 * * * *` (Every 5m) | **ENABLED** | `/home/paul/project-free-life/openclaw/service-health-check.py` |
| **16** | `promptlog_to_postgres.py` | Host Crontab (`paul`) | `*/5 * * * *` (Every 5m) | **ENABLED** | `/home/paul/project-free-life/openclaw/promptlog_to_postgres.py` |
| **17** | `talk_tailer.py` | Host Crontab (`paul`) | `* * * * *` (Every 1m) | **ENABLED** | `/home/paul/talk-logger/talk_tailer.py` |
| **18** | `codex-usage.py` | Host Crontab (`paul`) | `5 * * * *` (Hourly at `:05`) | **ENABLED** | `/home/paul/buzz/scripts/codex-usage.py` |
| **19** | `chatdev-build-runner.timer` | Systemd Timer | `OnUnitActiveSec=300` (Every 5m) | **ENABLED** | `/home/paul/project-free-life/dispatcher/chatdev_build_runner.py` |
| **20** | `roundup_collective_intel.py` (`task-9558`) | Antigravity Cron + PG | `*/20 * * * *` (Every 20m) | **ENABLED** | `/home/paul/antigravity_workspace/roundup_collective_intel.py` |

---

## 2. Graded Trial Specs (20 Recurring Jobs — Trigger, Expected Output & Pass/Fail Rubric)

### Spec 01: Unified PFL Workboard Dispatcher (`Windmill: admins / f/w/d_s`)
- **Job Title:** Unified PFL Dispatcher with Lease-Safe Frontier Recovery (`f/w/d`)
- **Trigger:** Windmill schedule `0 */2 * * * *` (every 2 minutes, UTC)
- **Expected Output:** JSON summary `{reaped: [...], results: [{agent, card_id, outcome}]}`; claims at most 1 highest-priority `pending` card per idle agent (`@lisa`, `@mckay`, `@zelenka`, `@sparky`, `@friday`, `@codex`), sets `status = 'in_progress'` with 30m `lease_expires_at`, and records `task_updates`.
- **Pass/Fail Rubric:**
  - **PASS:** Windmill job exits `0` within `90s`; `SELECT COUNT(*) FROM public.tasks WHERE status='in_progress' AND lease_expires_at < NOW()` is `0`; every claimed task has a matching row in `public.task_updates`.
  - **FAIL:** Any `in_progress` card has an expired lease (`>30m`) after a cycle, or dispatcher throws unhandled DB/subprocess error.

### Spec 02: Stale Lease Reaper (`Windmill: admins / f/w/r_s`)
- **Job Title:** Lease Reaper (`f/w/r` — align reaper with 30m lease)
- **Trigger:** Windmill schedule `0 */10 * * * *` (every 10 minutes, `America/Chicago`)
- **Expected Output:** Scans `public.tasks` for `status = 'in_progress'` where `lease_expires_at < NOW()` (or `updated_at < NOW() - INTERVAL '30 minutes'`) and returns stale cards to `pending` (or `escalated` if retry cap reached).
- **Pass/Fail Rubric:**
  - **PASS:** Zero tasks remain in `status = 'in_progress'` with `lease_expires_at < NOW()` after execution.
  - **FAIL:** Stale `in_progress` rows persist past 1 reaper cycle.

### Spec 03: Mirror Me NotebookLM Batch Upload (`Windmill: admins / f/w/mirror_me_s`)
- **Job Title:** Mirror Me Batch Upload (`f/w/mirror_me`)
- **Trigger:** Windmill schedule `*/15 * * * *` (every 15 minutes, `America/Chicago`)
- **Expected Output:** Checks `/mnt/d/ScreanShots` mount health, verifies NotebookLM source count against cap (`< 300`), and uploads next un-mirrored video batch.
- **Pass/Fail Rubric:**
  - **PASS:** Job exits `0`; respects NotebookLM capacity gate (`no upload when notebook >= 95% cap`); logs uploaded filenames or clean no-op when mount/cap gate blocks.
  - **FAIL:** Uploads duplicate source titles (see Card `#22039` dedupe audit) or hangs on stale `/mnt/d` drvfs mount.

### Spec 04: PFL Multi-Agent Job Flow (`Windmill: admins / f/w/pfl_multi_agent_job_schedule`)
- **Job Title:** PFL Multi-Agent Job (`f/w/pfl_multi_agent_job`)
- **Trigger:** Windmill schedule `0 0 */12 * * *` (every 12 hours, `America/Chicago`)
- **Expected Output:** Executes multi-agent flow step sequence in Windmill and records flow completion status.
- **Pass/Fail Rubric:**
  - **PASS:** Flow run completes with `success = true` in Windmill `v2_job_completed` within `300s`.
  - **FAIL:** Flow step times out or leaves child script hanging.

### Spec 05: Notebook YouTube Sync Flow (`Windmill: demo / f/w/notebook_youtube_sync_schedule`)
- **Job Title:** Notebook YouTube Sync (`f/w/notebook_youtube_sync`)
- **Trigger:** Windmill schedule `0 0 8 * * *` (daily at `08:00 America/Chicago`)
- **Expected Output:** Syncs designated YouTube channel/playlist sources into target NotebookLM notebook via `f/w/run_notebook_sync`.
- **Pass/Fail Rubric:**
  - **PASS:** Exits `0` and logs synced video IDs without creating duplicate NotebookLM sources.
  - **FAIL:** Non-zero exit code or duplicate source insertion.

### Spec 06: Buzz Escalation & Workboard Broadcaster (`Windmill disabled / Systemd: buzz-escalation-broadcaster.service`)
- **Job Title:** Postgres `public.buzz_outbox` Broadcaster (`buzz_escalation_broadcaster.py`)
- **Trigger:** Continuous systemd daemon (`LISTEN buzz_outbox_ready` + 5s poll fallback; migrated from Windmill `f/pfl/escalation_broadcaster_schedule`)
- **Expected Output:** Reads unsent rows (`sent_at IS NULL`) from `public.buzz_outbox`, signs HTTP POST to `http://127.0.0.1:3100/api/v1/channels/<id>/messages` with `buzz_workboard_system_key.txt` (`3bb5da65...`), and stamps `sent_at = NOW()`.
- **Pass/Fail Rubric:**
  - **PASS:** `systemctl is-active buzz-escalation-broadcaster.service` is `active`; `SELECT COUNT(*) FROM public.buzz_outbox WHERE sent_at IS NULL AND created_at < NOW() - INTERVAL '1 minute'` is `0`.
  - **FAIL:** Unsent rows accumulate in `public.buzz_outbox` for `>60s`.

### Spec 07: Legacy One-Card-Per-Agent Flow (`Windmill: admins / f/w/run_s` — Disabled)
- **Job Title:** Run — One Card Per Agent Per Cycle (`f/w/run`)
- **Trigger:** `0 */10 * * * *` (`enabled = false`, superseded by `f/w/d_s`)
- **Expected Output:** Remains disabled so it does not double-dispatch alongside `f/w/d_s`.
- **Pass/Fail Rubric:**
  - **PASS:** `SELECT enabled FROM schedule WHERE path = 'f/w/run_s'` is `false`.
  - **FAIL:** Re-enabled without disabling `f/w/d_s` (causes race conditions on task claims).

### Spec 08: Legacy Workboard SQLite-to-Postgres Sync (`Windmill: admins / f/w/s_s` — Disabled)
- **Job Title:** Sync — Workboard SQLite to Postgres (`f/w/s`)
- **Trigger:** `0 */10 * * * *` (`enabled = false`, retired per Card `#19123`)
- **Expected Output:** Remains disabled so retired `workboard.sqlite` never overwrites canonical `public.tasks`.
- **Pass/Fail Rubric:**
  - **PASS:** `SELECT enabled FROM schedule WHERE path = 'f/w/s_s'` is `false`.
  - **FAIL:** Enabled (re-introduces ghost cards from retired SQLite store).

### Spec 09: Workboard Chalkboard Writer (`Windmill: admins / f/workboard/chalkboard_writer_schedule` — Disabled)
- **Job Title:** Chalkboard Writer (`f/workboard/chalkboard_writer`)
- **Trigger:** `0 */15 * * * *` (`enabled = false`)
- **Expected Output:** Remains disabled unless explicitly re-commissioned.
- **Pass/Fail Rubric:**
  - **PASS:** `enabled = false` verified in `public.schedule`.
  - **FAIL:** Fires unexpectedly without active consumer.

### Spec 10: PFL Nightly Health Report (`Buzz Workflow: 00dd2548-63ab-4ce5-8a97-ab4d8d64d46c`)
- **Job Title:** PFL Nightly Health Report (`pfl-atrium` `7b3e1526-185c-4831-b750-fb57b0ae10d1`)
- **Trigger:** Buzz native schedule `interval: 24h` (`enabled = true`)
- **Expected Output:** Posts step 1 (`@antigravity Nightly PFL health check... TOOL_CALL: git -C /home/paul/project-free-life log --oneline -5`) and step 2 (`[pfl-health] nightly check dispatched`), followed by `@antigravity`'s in-channel response with real `git log` output.
- **Pass/Fail Rubric:**
  - **PASS:** Workflow fire recorded in `scheduled_workflow_fires` and `@antigravity` posts real 5-commit log within `180s`.
  - **FAIL:** Dispatch fires with no agent reply or fabricated git hashes.

### Spec 11: PFL Multi-Agent Job (`Buzz Workflow: 82801cdd-0b73-4293-8b70-d283143ddcb5`)
- **Job Title:** PFL Multi-Agent Job (`pfl-atrium` → `12264a99-f969-4715-ad02-bddf6533545b`)
- **Trigger:** Buzz native schedule `interval: 12h` (`enabled = true`)
- **Expected Output:** 3-step cross-tier chain: (1) `@antigravity` reports real `git -C /home/paul/project-free-life log --oneline -3`; (2) `@codex` independently verifies system health; (3) `@bumble` (local `qwen3.5:4b`) summarizes PFL Buzz state in 2 sentences.
- **Pass/Fail Rubric:**
  - **PASS:** All 3 seats (`@antigravity`, `@codex`, `@bumble`) post substantive replies in their target channels within `300s`.
  - **FAIL:** Any seat times out, echoes another seat verbatim, or fails to respond.

### Spec 12: System Stability Harness Canary (`Buzz Workflow: aab08d97-c62f-437b-8dbd-ec3619ed1fa1`)
- **Job Title:** System Stability Harness (`PFL Buzz Operations` `12264a99-f969-4715-ad02-bddf6533545b`)
- **Trigger:** Buzz native schedule `interval: 12h` (`00:00` and `12:00 UTC`, `enabled = true`, verified firing in `scheduled_workflow_fires`)
- **Expected Output:** Dispatches 4 `[STABILITY-CANARY]` prompts:
  1. `@Antigravity`: observation, evidence, and 1 recommended action on a real Buzz reliability signal.
  2. `@Bumble`: 2 lines (`STATUS: ready|blocked` + `DETAIL: ...`).
  3. `@Honey`: 1 sentence describing what each worker is expected to return.
  4. `@Dr. Rodney McKay`: tiny text artifact in workspace with UTC timestamp + `Buzz artifact canary`, mentioning `@Bumble`.
- **Pass/Fail Rubric:**
  - **PASS:** Row inserted in `scheduled_workflow_fires` every 12h and all 4 addressed seats reply in-thread according to format contract.
  - **FAIL:** Missing `scheduled_workflow_fires` entry or `<4/4` agent responses.

### Spec 13: Frontier Model 6-Hour Check-In (`Buzz Workflow: 9116ba52-0a8e-4822-ae44-76ce97f3182d`)
- **Job Title:** Frontier Model Hourly Check-In (`12264a99-f969-4715-ad02-bddf6533545b`)
- **Trigger:** Buzz native schedule `interval: 6h` (`enabled = true`)
- **Expected Output:** Wakes `@friday-fable-holmes @Antigravity @Codex [HOURLY CHECK-IN]` to review PFL Buzz Operations and PFL Atrium since last turn; silence is valid when nothing requires action, or concrete fix/finding if needed.
- **Pass/Fail Rubric:**
  - **PASS:** Workflow dispatches cleanly every 6h; frontier replies (if any) contain only concrete fixes/findings/decisions (zero filler narration).
  - **FAIL:** Frontier seat posts status-theater/no-op chatter when silence was instructed.

### Spec 14: Host Mirror Me Video Uploader (`Crontab: paul / upload_vids.py`)
- **Job Title:** Local ScreenShot Video Uploader (`upload_vids.py`)
- **Trigger:** User `paul` crontab `*/30 * * * *` (every 30 minutes)
- **Expected Output:** Appends run log to `/home/paul/.openclaw/workspace-lisa/logs/mirror_uploads.log` and syncs new `/mnt/d/ScreanShots` captures.
- **Pass/Fail Rubric:**
  - **PASS:** Exits `0` within `120s`; uses flock/dedupe check so concurrent runs or duplicate titles do not collide.
  - **FAIL:** Overlapping processes or duplicate uploads into capped NotebookLM notebooks.

### Spec 15: Host Service Health Check (`Crontab: paul / service-health-check.py`)
- **Job Title:** PFL Service Health Check (`service-health-check.py`)
- **Trigger:** User `paul` crontab `*/5 * * * *` (every 5 minutes)
- **Expected Output:** Checks core services and appends status to `/tmp/service-health.log`.
- **Pass/Fail Rubric:**
  - **PASS:** `/tmp/service-health.log` mtime is `< 6 minutes` old and script exits `0`.
  - **FAIL:** Log stale `> 10 minutes` or unhandled exception in `/tmp/service-health.log`.

### Spec 16: Prompt Log to Postgres Ingest (`Crontab: paul / promptlog_to_postgres.py`)
- **Job Title:** OpenClaw Prompt Log Ingest (`promptlog_to_postgres.py`)
- **Trigger:** User `paul` crontab `*/5 * * * *` (every 5 minutes)
- **Expected Output:** Parses recent OpenClaw prompt logs and inserts structured rows into Postgres (`/tmp/promptlog_cron.log`).
- **Pass/Fail Rubric:**
  - **PASS:** Exits `0` within `30s`; new prompt turns appear in Postgres without duplicate primary key errors.
  - **FAIL:** Script errors in `/tmp/promptlog_cron.log`.

### Spec 17: Talk Logger Tailer (`Crontab: paul / talk_tailer.py`)
- **Job Title:** Live Talk Logger Tailer (`/home/paul/talk-logger/talk_tailer.py`)
- **Trigger:** User `paul` crontab `* * * * *` (every 1 minute)
- **Expected Output:** Incrementally tails active conversation logs into `/home/paul/talk-logger/tailer.log`.
- **Pass/Fail Rubric:**
  - **PASS:** Completes in `< 10s` with zero orphan processes in `ps aux`.
  - **FAIL:** Process hangs across minute boundaries or errors in `tailer.log`.

### Spec 18: Hourly Codex Usage Meter (`Crontab: paul / codex-usage.py`)
- **Job Title:** Codex Token & Quota Meter (`/home/paul/buzz/scripts/codex-usage.py`)
- **Trigger:** User `paul` crontab `5 * * * *` (hourly at minute `:05`)
- **Expected Output:** Queries Codex usage / session logs, updates `public.compute_usage`, and appends to `/tmp/codex-usage.log`.
- **Pass/Fail Rubric:**
  - **PASS:** `SELECT MAX(recorded_at) FROM public.compute_usage WHERE provider = 'openai_codex'` is `< 65 minutes` old.
  - **FAIL:** `public.compute_usage` stale `> 2 hours` or script failure in `/tmp/codex-usage.log`.

### Spec 19: ChatDev Build Request Runner (`Systemd Timer: chatdev-build-runner.timer`)
- **Job Title:** ChatDev Build Request Runner (`chatdev_build_runner.py`)
- **Trigger:** Systemd timer `OnUnitActiveSec=300` (every 5 minutes)
- **Expected Output:** Picks up at most 1 pending `BUILD REQUEST:` card from `public.tasks`, executes build in `/home/paul/ChatDev`, and logs to `/var/log/chatdev-build-runner.log`.
- **Pass/Fail Rubric:**
  - **PASS:** `systemctl is-active chatdev-build-runner.timer` is `active`; runner exits cleanly when no `BUILD REQUEST` card is pending.
  - **FAIL:** Picks up non-build cards (e.g. `PFL Goal: Check-in #392` conversational echoes) without filtering or times out (`>1800s`).

### Spec 20: Antigravity Covert Intelligence & Gas Gauge Roundup (`Antigravity Cron: task-9558`)
- **Job Title:** Covert Intelligence, Un-Gating & Gas Gauge Roundup (`roundup_collective_intel.py`)
- **Trigger:** `*/20 * * * *` (every 20 minutes via Antigravity schedule `task-9558`)
- **Expected Output:** Queries live Google AI Ultra `GetUserStatus` RPC (`15.0pp/day` burn target), extracts any new `/tmp/*.tar.gz` `*.chatgpt.site` archives to `/home/paul/gods-eye-view/public/<name>/` (`HTTP 200 OK` on `localhost:4173`), and writes `/home/paul/antigravity_workspace/COLLECTIVE_INTEL_PACKET_LATEST.md` + `/home/paul/gods-eye-view/public/intel-packet.json`.
- **Pass/Fail Rubric:**
  - **PASS:** `http://localhost:4173/intel-packet.json` returns `HTTP 200 OK` with `generated_at` `< 25 minutes` old and `antigravity_gas_gauge.live_rpc_verified = true`.
  - **FAIL:** Packet stale `> 25 minutes` or RPC verification fails.
