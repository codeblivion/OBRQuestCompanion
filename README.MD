# OBR Quest Companion

An external companion app for *The Elder Scrolls IV: Oblivion Remastered* that helps you track your quest progress. It reads quest progress from your save game directory.

**As of version 2.0.0, this app no longer requires a game plugin to work.**

## Features
- Auto-detects the save folder and lets you choose a character to track
- Follows that character's newest manual, auto, or quick save while the app is open
- Groups quests by category
- Has toggles to hide completed quests and quest descriptions
- Links directly to UESP quest pages
- Includes a dark mode

## Notes
- This was thrown together in under a week while I was on vacation. It works, but it's not polished.
- Guild expulsion quests and quest failure states are not currently tracked.
- Your save game is read locally. It is not uploaded anywhere.
- The app does not auto update. Check back on Nexus Mods or GitHub for new releases.

## Known Issues
- Quest completion can be wrong for some quests. If something is finished in-game but not marked correctly in the app, you can manually override it using the 'Mark Complete' button.

## Maintenance
This is a fan-made, open-source project built in my spare time. Updates will be infrequent, so please don’t expect regular releases or fast fixes. Pull requests are welcome, but turnaround may be slow. If you want to extend it, fix problems, or turn it into something better, feel free to fork it or build on this project. Just make sure you follow the licenses and give appropriate credit where required.

## Installation

### Companion App
- Download and install the latest Windows/Linux version of OBR Quest Companion from [Nexus Mods](https://www.nexusmods.com/oblivionremastered/mods/5235) or the [Latest GitHub Release Page](https://github.com/codeblivion/OBRQuestCompanion/releases/latest).
- Browse for your save game folder, select a character, and leave the app open while playing. The tracker switches to that character's newest save automatically.

## Licenses and Credits

### Source Code
The following license applies only to the source code of this project.

```
MIT License

Copyright (c) 2025 codeblivion

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

```
---

### oozextract

**oozextract** is a Rust package used by this project to help read save game files.
- Source: https://crates.io/crates/oozextract
- License: [MIT](https://docs.rs/crate/oozextract/0.5.5/source/Cargo.toml)

---

### Unofficial Elder Scrolls Pages (UESP) Content

Quest information used by this project is derived from **UESP** and is licensed under the  
**Creative Commons Attribution–ShareAlike 2.5 License**.

- Source: https://en.uesp.net/
- License: [Creative Commons Attribution–ShareAlike 2.5](https://creativecommons.org/licenses/by-sa/2.5/)

Where applicable, attribution is provided via direct links to the relevant UESP
articles.

---

### Trademarks and Copyright

The Elder Scrolls is a trademark of Bethesda Softworks LLC.

This project uses limited game asset images © Bethesda Softworks LLC / ZeniMax Media Inc.
All such assets are used for non-commercial, informational purposes.

This project is unofficial and is not affiliated with or endorsed by Bethesda or ZeniMax.
