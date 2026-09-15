# Joe Time

A multiplayer idle tycoon and shared digital workplace about **Joey** (a guy with
a big nose and a proud mustache). Build your Joey, walk an isometric office, and
earn credits that grow while you idle. Lives on its own page (`/tycoon/`) next to
the Skill Builder, same no-build static hosting.

## The loop

- **Build Your Joey** (required before you play): pick a specialty (**JOE BRAIN**
  or **JOE BUILD**), pick one of three random adjectives that names you
  `JOEY ___` and locks in a stat buff, and pick your look.
- **Two stats**: BRAIN 🧠 and BUILD 🔧. Your specialty and adjective set them, and
  they make matching-tagged furniture and gear more effective.
- **Everyone earns 1¢/s base.** On top of that:
  - **Furniture** (placed in the shared room) buffs you **while you stand next to
    it**. Adjacent furniture glows; you can use several pieces at once. Anyone can
    use anyone's furniture, so a good desk helps the whole team.
  - **Gear** buffs you **passively**, always on, wherever you stand. Gear lives
    in a **spatial "Tetris" bag** (starts 2×2, grows when you buy a bigger bag)
    and equips into slots: head, eyes, nose, torso, hands, legs, feet, weapon,
    bag. Only *equipped* gear buffs you, so bag space is the real constraint.
    Manage it all in the **Locker**.
- **Accounts (optional)**: play as a local guest, or log in with a
  username/password to save your Joey to the cloud so it survives a cookie wipe
  and follows you across devices. Login is never required to play.
- **Personal wallet**: you earn and spend your own credits (furniture, gear,
  floor expansions).
- **Team Pot**: invest some of your credits into a shared pot that compounds at an
  impressive interest rate all week. Your share of the pot is your **weighted
  vote**. At week's end growth stops, the team votes on what to buy, and once it
  resolves the pot spends and resets to 0 — the winning item grants a room-wide
  buff for the next week.

## Running it

Static site, no build step. Serve over HTTP (not `file://`):

```bash
python3 -m http.server 8000
# then open http://localhost:8000/tycoon/
```

Add `?local=1` to the URL to force offline/local mode (handy for testing without
the backend). Out of the box it runs LOCAL (saves to your browser, multiplayer
across tabs via BroadcastChannel, with ambient bot-Joeys). It flips to CLOUD when
Supabase keys are set and reachable, and falls back to LOCAL if the backend can't
be reached, so the game always opens.

## Cloud multiplayer (Supabase)

Keys live in [`src/config.js`](src/config.js). To set up a fresh project: create
one at supabase.com, run [`supabase/schema.sql`](supabase/schema.sql) in its SQL
editor, then paste the Project URL and publishable (anon/public) key into
`config.js`. The publishable key is safe to ship in a static page; it's guarded by
the RLS policies in the schema. Never paste the service_role / secret key.

**For accounts** (optional): in the Supabase dashboard go to
**Authentication → Providers → Email** and turn **off** "Confirm email".
Usernames map to a synthetic email address, so there is no inbox to confirm a
link from. The `profiles` table + policies in `schema.sql` keep each player's
save private to them.

## Content lives in one place

`src/economy.js` holds all the tunable content: stats, specialties, adjectives,
furniture, gear, and the team-pot proposals. Add or rebalance there.

| Path | Purpose |
|------|---------|
| `src/config.js` | Supabase keys, room, economy/pot tunables |
| `src/economy.js` | **Content**: stats, specialties, adjectives, furniture, gear, proposals, income math |
| `src/appearance.js` | Joey look catalog + vector avatar/gear drawing |
| `src/state.js` | Store: wallet, stats, gear, furniture, team pot, save/sync |
| `src/world.js` | Isometric renderer, movement, adjacency "using" glow |
| `src/ui.js` | Build-Your-Joey, HUD, build bar, Locker, Team Pot |
| `src/net/*` | Local (BroadcastChannel) and Supabase adapters + fallback |
| `supabase/schema.sql` | Shared-room table + RLS + realtime |

## Known limits (foundation)

- Shared room + pot are last-write-wins; the pot's interest and weekly resolution
  are advanced by the "host" (lowest-id connected client) to avoid double-counting.
- The end-of-week **spend** step is a first pass: it picks the vote winner, grants
  a simple room-wide income buff, and resets. The catalog of what the pot can buy
  is the next content patch.
- No pathfinding: Joeys walk straight to where you click.
