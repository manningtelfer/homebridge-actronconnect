# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Build (compiles TypeScript to dist/)
npm run build

# Lint
npm run lint

# Watch mode (build + link + nodemon for live reload during development)
npm run watch

# Publish (runs lint + build first)
npm run prepublishOnly
```

There are no tests in this project.

The `watch` command uses nodemon (configured in [nodemon.json](nodemon.json)) to watch `src/` for `.ts` changes, recompile, and restart `homebridge -I -D` (inspect + debug mode).

## Architecture

This is a **Homebridge dynamic platform plugin** for ActronAir air conditioners. All communication goes through the **ActronAir cloud API** only — there is no local device communication.

HTTP is done via native `fetch` (Node 20+) wrapped in typed helpers in [src/http.ts](src/http.ts).

### Source files

| File | Role |
|---|---|
| [src/index.ts](src/index.ts) | Entry point — registers the platform with Homebridge |
| [src/settings.ts](src/settings.ts) | `PLATFORM_NAME` and `PLUGIN_NAME` constants |
| [src/types.ts](src/types.ts) | `SettingsDA`, `StateDA`, `CloudApiResponse`, `SigninResponse` interfaces |
| [src/http.ts](src/http.ts) | `cloudSignin`, `cloudGet`, `cloudPut` — typed fetch wrappers |
| [src/platform.ts](src/platform.ts) | `ActronAirPlatform` — authenticates on launch, auto-discovers device, creates `ActronAirAccessory` |
| [src/platformAccessory.ts](src/platformAccessory.ts) | `ActronAirAccessory` — all HAP characteristic handlers (get/set) for a single aircon unit |

### Services exposed per accessory

- **Thermostat** — on/off state, mode (AUTO/HEAT/COOL), current temperature, target temperature.
- **Fanv2** — fan speed (0/50/100% mapped to API values 0/1/2).
- **Switch** (one per zone) — zone enable/disable, backed by `enabledZones[]` array in the cloud API.

### Authentication

On `didFinishLaunching`, the platform calls `cloudSignin(email, password)`:

```
POST https://que.actronair.com.au/api/v0/bc/signin
Authorization: Basic base64(email:password)
Content-Length: 0
```

The response contains everything needed to build the accessory context:
- `value.userAccessToken` — token used as `user_access_token` query param on all subsequent requests
- `value.airconBlockId` — node ID (e.g. `ACONNECT001EC04A7978`), used as `device_token`
- `value.airconZoneNumber` — number of configured zones
- `value.zones` — array of zone name strings

MAC address is derived from `airconBlockId`: last 12 chars with colons inserted every 2 characters (e.g. `001EC04A7978` → `00:1E:C0:4A:79:78`). The MAC is used as the Homebridge UUID seed.

### Cloud API structure

All reads use `GET /rest/v0/devices?user_access_token=<token>`. The response contains a `data` object keyed by sub-device identifiers of the form `<node>_0_2_<did>`:

| Key suffix (`did`) | Content | Usage |
|---|---|---|
| `_0_2_4` | Settings (`SettingsDA`) | Read before any settings PUT |
| `_0_2_5` | Zones array | PUT target for zone toggles |
| `_0_2_6` | State (`StateDA`) | Read for all GET handlers |

**Settings DA** (`did=4`, typed as `SettingsDA`):
- `amOn` — power state (boolean)
- `tempTarget` — target temperature (may be a plain number or `{ source, parsedValue }` object)
- `mode` — 0=AUTO, 1=HEAT, 2=COOL, 3=FAN
- `fanSpeed` — 0, 1, or 2
- `enabledZones` — array of numbers indexed by zone

**State DA** (`did=6`, typed as `StateDA`):
- `isOn` — current power state (boolean)
- `mode` — current mode
- `fanSpeed` — current fan speed
- `setPoint` — current target temperature (may be a plain number or `{ source, parsedValue }` object — use `parsedValue` when it's an object)
- `roomTemp_oC` — current room temperature (always a plain number)
- `enabledZones` — current zone enable states

### PUT endpoints

Settings changes (power, mode, fan speed, temperature) go to `/rest/v0/device/<node>_0_2_4` with the full `SettingsDA` object as body: `{ DA: <full settings object> }`. Always read current settings first, mutate, then PUT the whole object.

Zone changes go to `/rest/v0/device/<node>_0_2_5` with the zones array as body: `{ DA: [array] }`. Always read fresh state from the devices endpoint before PUTing.

### Zone SET binding

`.onSet(this.handleZoneOnSet.bind(this, z.index))` pre-curries `index` as the first argument. Homebridge then calls `handler(z.index, value)`, so `handleZoneOnSet` declares parameters as `(index: number, value: CharacteristicValue)`. The zone SET always fetches fresh state before PUTing, avoiding stale-cache race conditions.

### Config shape

Defined in [config.schema.json](config.schema.json). Only `email` and `password` are required — all other details (device token, MAC, zones) are discovered automatically at startup via the signin API.

### ESLint rules of note

- Single quotes required.
- 2-space indent with `SwitchCase: 1`.
- Max line length 140.
- `no-console` is a warning — use `this.platform.log` instead.
- ESLint 9 flat config in [eslint.config.mjs](eslint.config.mjs).
