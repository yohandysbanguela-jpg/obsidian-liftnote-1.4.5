# Liftnote

**Workout tracker for Obsidian** — routines, live sets, rest timer, automatic PRs, session volume, calendar and progression. Built primarily for **iPhone / Obsidian Mobile**.

![Obsidian](https://img.shields.io/badge/Obsidian-Plugin-7c3aed)
![Mobile](https://img.shields.io/badge/Mobile-iPhone%20ready-34d399)
![Version](https://img.shields.io/badge/version-1.4.5-8b5cf6)

## Features

- **Routines** — create and reuse workout templates
- **Live session** — log weight × reps, check sets, rest timer with sound/voice
- **Automatic PRs** — 🏆 when you beat your historical max
- **Live volume** — total kg/lbs × reps while training
- **∞ to failure** — mark reps as failure in live session and in history edit
- **Calendar** — plan days, log past workouts, rest / sick markers
- **Progression** — max weight table by exercise and month
- **History by month** — automatic folders (October, November, …)
- **Minimize mid-workout** — progress is saved; continue later
- **Liquid Glass UI** — modern iOS-style interface optimized for touch

## Install (Community Plugins)

1. Open **Settings → Community plugins**
2. Turn off *Restricted mode*
3. Browse → search **Liftnote** → Install → Enable

### Manual install

1. Download `main.js`, `manifest.json` and `styles.css` from the [latest release](../../releases)
2. Create folder: `<vault>/.obsidian/plugins/liftnote/`
3. Put the three files inside
4. Enable the plugin in Community plugins

## First use

1. Tap the **dumbbell** icon in the left ribbon
2. Create a routine or start a free session
3. During the workout: enter weight & reps → green check → rest
4. Calendar tab: plan future days or backfill past workouts

Your data lives in the vault:

```
Entrenamiento/
  Rutinas/       ← templates
  Historial/     ← sessions by month
  Plantillas/    ← optional templates
```

## Settings

| Option | Description |
|--------|-------------|
| Weight unit | `kg` or `lbs` |
| Default rest | seconds between sets |
| Folders | paths for routines / history / templates |

## Privacy

Everything stays in your vault. No accounts, no cloud, no analytics.

## Author

Yohandys

## License

MIT
