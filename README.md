# Labophase

Fan-made companion tool for a One Piece-based game. Unofficial — not affiliated with nor endorsed by the game's publishers or the One Piece franchise owners.

> **Live version:** https://maniackrackjack.github.io/labophase/

## About

Labophase is a fully static, client-side web app built with vanilla JavaScript (no frameworks, no build step). Everything runs in the browser: your progress is stored locally and can be exported, imported, or shared through profile links.

## Features

- **Build / crafting tools** — item and recipe calculator, material costs, boost planner and XP planning.
- **Characters manager** — unlock or block characters, track level, stars, tier and unlocked skins; filter by faction, role and tier; bulk actions like *unlock all* or *block without data*.
- **Island Chests tracker** — mark chest locations per character and island, with stamina-based filtering and per-character control.
- **Weekly Chest** — dynamic weekly rotation loaded from `data/weekly-chest.json`, with an in-app edit mode and JSON export for updating the data.
- **Boats planner** — level and upgrade planning for boats.
- **Wanted list & tier list** — organize your bounty targets and tier rankings.
- **World / Marineford bosses & Weekly bosses** — boss guides, mechanics and scheduling info.
- **Foxy Quiz & Tracker** — fun trivia and daily progress tracking.
- **Links** — quick-access hub of useful game links.
- **Profiles system** — export, import and share the full state (build, characters, island chests, weekly chest, and more) through a link or JSON.
- **Multi-language UI** — Portuguese, English, Spanish and Polish.

## Running locally

There is no build process. The app fetches data from `data/*.json`, so it must be served over HTTP (opening the file directly with `file://` will not work).

With Python:

```sh
python -m http.server
```

With Node:

```sh
npx serve .
```

Or use any static server / editor extension (e.g. VS Code Live Server), then open the printed address.

## Deploying to GitHub Pages

The project is a plain static site:

1. Push the repository to GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, select *Deploy from a branch* and choose the default branch with the **root** folder.
4. Save — the site will be published at `https://<user>.github.io/<repo>/`.

## Project structure

```
index.html          Single-page app containing all tabs
js/                 Vanilla JS modules (per-tab logic, data, profiles, i18n)
css/                Per-tab stylesheets
data/               JSON data loaded at runtime (weekly chest, quiz, …)
sprites/            Images and icons
```

## License

Released under the [GNU General Public License v3.0](LICENSE).

*This is a fan-made project. It is not affiliated with, endorsed by, or connected to Toei Animation, Shueisha, or the owners of the One Piece franchise. All character assets are used for reference only.*