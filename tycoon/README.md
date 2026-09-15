# Deskovania

A multiplayer **idle tycoon** and **shared digital workplace**, hosted on its own
page next to the Skill Builder. Walk a customizable character around an isometric
office, build workstations that earn credits even while you idle, grow the floor,
and spend the shared income on outfits. Built to live on a second monitor at work.

It has nothing to do with the Skill Builder beyond sharing the repo — same
no-build, static-hosting approach, different page (`/tycoon/`).

## What's in the first version

- **Isometric office** you can walk around (WASD / arrow keys, or click a tile).
- **Customizable characters** in a default outfit; skin and hair are free, shirts,
  hats, and badges are bought with credits and equipped from the **Wardrobe**.
- **Tycoon economy**: place Workstations, Plants, Coffee Bars, Server Racks, and
  Meeting Pods. Each earns credits/sec; upgrade them, and a variety bonus rewards
  a mixed office. **Idle income keeps accruing while you're away** (capped at 8h).
- **Modular, growable workspace**: buy floor expansions to push the office outward.
- **Multiplayer** two ways (see below): real cross-device via Supabase, and a
  zero-setup local mode that is genuinely multiplayer **across browser tabs**.

## Running it

Static site, no build step. Serve it over HTTP (ES modules and PNG export do not
work from a `file://` URL):

```bash
# from the repo root
python3 -m http.server 8000
# then open http://localhost:8000/tycoon/
```

Out of the box it runs in **LOCAL mode**: state saves to your browser, and if you
open the page in two tabs you'll see the two avatars share one office in real time
(via `BroadcastChannel`). Ambient "coworker" bots wander the floor so it never
feels empty.

## Turning on real, cross-device multiplayer (Supabase)

Two minutes, free tier, no server to run:

1. Create a project at <https://supabase.com>.
2. In the dashboard: **SQL Editor -> New query**, paste
   [`supabase/schema.sql`](supabase/schema.sql), and run it.
3. In **Project Settings -> API**, copy the **Project URL** and the **anon /
   public** key. (Do **not** use the `service_role` key.)
4. Paste both into [`src/config.js`](src/config.js):

   ```js
   export const SUPABASE = {
     url: "https://YOURPROJECT.supabase.co",
     anonKey: "eyJhbGciOi...your anon key...",
   };
   ```

5. Reload. The HUD badge flips from **LOCAL** to **CLOUD**. Everyone who opens the
   page now shares the same office, credits, and build, and sees each other move.

The anon key is designed to ship in a static page; it is guarded by the Row Level
Security policies in `schema.sql`. Change `ROOM` in `config.js` to run separate
offices. To use Firebase instead, write a `makeFirebaseNet` adapter with the same
shape as `src/net/local.js` and wire it in `src/net/net.js`.

## How multiplayer stays consistent

Presence (who is here, where their avatar is, what they're wearing) rides a
realtime channel. The shared office state (credits, modules, floor) is
last-write-wins, and **passive income is only accrued by the "host"** — the
connected client with the lowest id — so credits are never double-counted across
players. Purchases push immediately so everyone sees them fast.

## Files

| Path | Purpose |
|------|---------|
| `index.html` | Page shell + canvas |
| `styles.css` | Bright office theme, HUD, panels |
| `src/config.js` | **The one file you edit**: Supabase keys, room, economy tuning |
| `src/main.js` | Bootstrap; wires net + state + world + UI, starts the heartbeats |
| `src/state.js` | Game store, save/load, offline catch-up, host election, spending |
| `src/economy.js` | Module catalog, income/cost math |
| `src/world.js` | Isometric renderer, movement, avatars, NPCs, game loop |
| `src/iso.js` | Isometric projection + camera |
| `src/appearance.js` | Cosmetic catalog, default outfit, vector avatar drawing |
| `src/ui.js` | HUD, build bar, module inspector, wardrobe/shop |
| `src/net/net.js` | Adapter factory (picks local vs cloud) |
| `src/net/local.js` | Local + cross-tab multiplayer (BroadcastChannel) |
| `src/net/supabase.js` | Cloud multiplayer (Supabase Realtime + `rooms` table) |
| `supabase/schema.sql` | The table + RLS + realtime setup |

## Tuning

Everything numeric (starting credits, costs, growth rates, floor size, walk speed,
idle cap) lives in `src/config.js` and `src/economy.js`. They're pure numbers;
tweak freely.

## Known limits (first version)

- Shared state is last-write-wins, so two simultaneous purchases can rarely clobber
  each other. Fine for a handful of coworkers; a future version can move spends to
  an atomic Postgres function.
- No pathfinding yet: avatars walk straight to where you click.
- Cosmetics are cosmetic only. Prestige/automation are natural next steps.
