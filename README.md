<h1 align="center">
  <img src="https://api.iconify.design/lucide:music.svg?color=%2367c1f5" width="28" style="vertical-align: middle;">
  Game Theme Song
</h1>

<p align="center">
Plays each game's <b>theme music</b> in the background when you open its page in your Steam library - with smooth fades, a local cache, your own custom tracks and zero clicks.
</p>

<p align="center">
  <img src="https://img.shields.io/github/v/release/BambooFury/Game-Theme-Song?style=flat&label=Version&color=1a9fff&labelColor=262626&logo=github&logoColor=FFFFFF">
  <img src="https://img.shields.io/github/downloads/BambooFury/Game-Theme-Song/total?style=flat&label=Downloads&color=2ecc71&labelColor=262626&logo=github&logoColor=FFFFFF">
  <img src="https://img.shields.io/github/stars/BambooFury/Game-Theme-Song?style=flat&label=%E2%98%85&logo=github&color=FFD43B&labelColor=262626&logoColor=FFFFFF">
  <img src="https://img.shields.io/github/license/BambooFury/Game-Theme-Song?style=flat&label=License&color=4CAF50&labelColor=262626&logo=opensourceinitiative&logoColor=FFFFFF">
</p>

<p align="center">
  <img src=".github/preview.png" alt="Game Theme Song" width="850">
</p>

## <img src="https://api.iconify.design/lucide:sparkles.svg?color=%23FFD43B" width="20"> Features

<table>
<tr>
<td><img src="https://api.iconify.design/lucide:play.svg?color=%231a9fff" width="16"> <b>Auto-Play</b> - open a game page and its theme starts playing, no clicks needed</td>
<td><img src="https://api.iconify.design/lucide:waves.svg?color=%2367c1f5" width="16"> <b>Smooth Fades</b> - gentle fade-in/out and cross-fades when you jump between games</td>
</tr>
<tr>
<td><img src="https://api.iconify.design/lucide:music.svg?color=%2367c1f5" width="16"> <b>Music Note Button</b> - a note icon on every game page opens the popup to control playback and settings</td>
<td><img src="https://api.iconify.design/lucide:zap.svg?color=%23FFD43B" width="16"> <b>Local Cache</b> - themes download once, repeat visits start instantly</td>
</tr>
<tr>
<td><img src="https://api.iconify.design/lucide:file-music.svg?color=%2367c1f5" width="16"> <b>Custom Music</b> - set your own audio track per game; your pick always overrides the auto-theme</td>
<td><img src="https://api.iconify.design/lucide:list-music.svg?color=%232ecc71" width="16"> <b>Music Library</b> - searchable native window listing your games to assign and manage custom tracks</td>
</tr>
<tr>
<td><img src="https://api.iconify.design/lucide:sliders-horizontal.svg?color=%232ecc71" width="16"> <b>Volume Slider</b> - 0–100% with 1% precision, applied live while music plays</td>
<td><img src="https://api.iconify.design/lucide:save.svg?color=%23FFD43B" width="16"> <b>Survives Reinstalls</b> - custom tracks live in a dedicated folder and are restored automatically after reinstalling the plugin</td>
</tr>
<tr>
<td><img src="https://api.iconify.design/lucide:shuffle.svg?color=%2367c1f5" width="16"> <b>Manual Search</b> - skip to a different theme right from the Now Playing tab</td>
<td><img src="https://api.iconify.design/lucide:check-check.svg?color=%232ecc71" width="16"> <b>Confirm Downloads</b> - keep songs only after confirming, discard on leave</td>
</tr>
</table>

## <img src="https://api.iconify.design/lucide:cog.svg?color=%231a9fff" width="20"> How It Works

1. <img src="https://api.iconify.design/lucide:scan-eye.svg?color=%231a9fff" width="16"> You open a game page - the plugin detects the app and resolves the game's name
2. <img src="https://api.iconify.design/lucide:radar.svg?color=%23FFD43B" width="16"> The backend looks up the game's official soundtrack (Khinsider + SoundCloud), scores every candidate for a real match and only keeps high-quality picks
3. <img src="https://api.iconify.design/lucide:hard-drive-download.svg?color=%232ecc71" width="16"> The track is downloaded once and cached locally for instant replays
4. <img src="https://api.iconify.design/lucide:audio-lines.svg?color=%23ff4d4f" width="16"> Music fades in - switch games and it cross-fades, leave the page and it fades out

> <img src="https://api.iconify.design/lucide:file-music.svg?color=%2367c1f5" width="14"> Set a **custom track** for any game and it always plays instead of the auto-fetched theme.

## <img src="https://api.iconify.design/lucide:rocket.svg?color=%232ecc71" width="20"> Installation

> Requires [Millennium](https://steambrew.app) to be installed first.

1. <img src="https://api.iconify.design/lucide:chevron-right.svg?color=%239E9E9E" width="16"> Open the Steam Menu
2. <img src="https://api.iconify.design/lucide:boxes.svg?color=%231a9fff" width="16"> Go to **Millennium**
3. <img src="https://api.iconify.design/lucide:download.svg?color=%232ecc71" width="16"> Choose **Install the plugin**
4. <img src="https://api.iconify.design/lucide:key.svg?color=%23FFD43B" width="16"> Insert the plugin ID
5. <img src="https://api.iconify.design/lucide:refresh-cw.svg?color=%23ff4d4f" width="16"> Restart Steam - done!

## <img src="https://api.iconify.design/lucide:music.svg?color=%2367c1f5" width="20"> The Music Note Button

On every game page in your Steam library, a small **music note button** appears. Click it to open the **Game Theme Song popup** — a native, movable and resizable Steam window with four tabs:

### Now Playing
- Shows the current game name and the track that's playing (or "Searching…" while a theme is being found)
- **Find another** - skip to a different theme track (available when manual search is on)
- **Search again** - force a fresh search for games with no track yet
- **Stop** - stop the current track with a fade-out
- **Keep this song** - confirm a newly found track so it stays in the cache
- Live playback progress bar with current time and duration

### Settings
<img src="https://api.iconify.design/lucide:file-music.svg?color=%2367c1f5" width="16"> **Custom Game Music** - pick your own theme for any game; it plays before the auto search (opens the Music Library)

<img src="https://api.iconify.design/lucide:volume-2.svg?color=%231a9fff" width="16"> **Music Volume** - background theme volume, 0% to 100% in 1% steps, applied instantly

<img src="https://api.iconify.design/lucide:timer.svg?color=%23FFD43B" width="16"> **Song Length Limit** - cap how long a theme plays; *Off* plays the full song

<img src="https://api.iconify.design/lucide:repeat.svg?color=%232ecc71" width="16"> **Loop Song** - the theme repeats while you stay on the game page

<img src="https://api.iconify.design/lucide:shuffle.svg?color=%2367c1f5" width="16"> **Manual Song Search** - when a theme is found, use the skip button in the Now Playing tab to pick a different song

<img src="https://api.iconify.design/lucide:check-check.svg?color=%232ecc71" width="16"> **Keep Songs Only After Keeping** - a found song is deleted if you leave the page without keeping it

<img src="https://api.iconify.design/lucide:gamepad-2.svg?color=%239E9E9E" width="16"> **Stop on Game Launch** - theme music stops when you launch a game

<img src="https://api.iconify.design/lucide:trash-2.svg?color=%23ff4d4f" width="16"> **Downloaded Music** - shows cached track count and size; opens a native window to remove individual tracks or clear the whole cache

## <img src="https://api.iconify.design/lucide:file-music.svg?color=%2367c1f5" width="20"> Custom Music

Prefer your own track for a game? Open the popup's **Custom Music** tab:

1. <img src="https://api.iconify.design/lucide:library.svg?color=%231a9fff" width="16"> Click the music note button on any game page, then open the **Custom Music** tab
2. <img src="https://api.iconify.design/lucide:search.svg?color=%23FFD43B" width="16"> Search for the game you want - games with an assigned track are always listed on top
3. <img src="https://api.iconify.design/lucide:upload.svg?color=%232ecc71" width="16"> Pick an audio file from your PC - it's saved and used instantly
4. <img src="https://api.iconify.design/lucide:trash-2.svg?color=%23ff4d4f" width="16"> Your custom track always overrides the auto-theme; clear it anytime to fall back

> Supported formats: **MP3, M4A, AAC, OGG, OPUS, WAV, FLAC** - up to 50 MB per file.

> <img src="https://api.iconify.design/lucide:save.svg?color=%23FFD43B" width="14"> Custom tracks are stored in `<Steam>/millennium/game-theme-song-custom/` together with their game mapping. **This folder survives plugin removal** - reinstall the plugin and every custom track is automatically re-applied to its game, no need to pick the files again.

## <img src="https://api.iconify.design/lucide:circle-help.svg?color=%23FFD43B" width="20"> FAQ

**Where does the music come from?**
From the game's official soundtrack - the plugin looks it up on soundtrack sources, scores every result for a genuine match (full game-name match, soundtrack genre, track quality) and only downloads picks it is confident about.

**What if a game has no official soundtrack online?**
You'll see "no theme found" instead of a random song - just set your own custom track for a perfect match.

**Does it play over my games?**
No. Music only plays while you're browsing a game's page in the library and fades out when you leave it.

**Will my custom tracks survive a reinstall?**
Yes - custom tracks and their game mapping are kept in `<Steam>/millennium/game-theme-song-custom/`, which is not removed with the plugin. After reinstalling, the plugin detects the folder and instantly restores every track to its game.

**Does it slow down Steam?**
No - themes are cached after the first visit and playback is just a background audio element.

## <img src="https://api.iconify.design/lucide:scale.svg?color=%234CAF50" width="20"> License

MIT - see [LICENSE](LICENSE). Not affiliated with Valve or Steam.

<p align="center">
  <sub>Made for <a href="https://steambrew.app">Millennium</a> with 💕</sub>
</p>
