# OBR Quest Companion

An external companion app for *The Elder Scrolls IV: Oblivion Remastered* that automatically tracks quest progress outside the game. Built with Electron and powered by a custom OBSE64/ue4ss plugin.

## What It Does
- Provides an external UI to track your overall quest progress
- Automatically fetches quest progress
  - OBSE Plugin: fetches roughly once per minute
  - ue4ss Plugin: fetches each time the game is saved
- Groups quests by category
- Has toggles to hide completed quests and quest descriptions
- Links directly to UESP quest pages
- Includes a dark mode

## Background / Notes
- This was thrown together in under a week while I was on vacation. It works, but it's not polished.
- The main goal was to have something usable until a proper in-game quest tracker mod exists.
- This is my first OBSE64 plugin. So far it works, but you may find issues. Special thanks to [Ez0n3](https://github.com/Ez0n3/OBSE64-Plugins) for their template project to help me get started!
- Some quests (like certain guild exile quests) aren't tracked. If you want them, you can add them back via the JSON files.
- Parsing the save file would've been nicer, but I don't know how to do that.

## Known Issues
- Quest completion can be wrong for some quests. If something is finished in-game but not marked here, you can manually override it in the app using the UI button.
- Arena fights aren't tracked. They rely on script and quest variables instead of standard quest stages, and OBSE64 (as far as I know) doesn't yet expose what's needed to read them.

## Maintenance / Expectations
This is a fan-made, open source project built in my spare time. Updates will be infrequent, so please don’t expect regular releases or fast fixes. Pull requests are welcome, but turnaround may be slow. If you want to extend this, fix problems, or turn it into something better, feel free to fork it or build on this project. Just make sure you follow the licenses and give appropriate credit where required.

## Installation

### Plugin (OBSE64 Variant)
- Install [OBSE64](https://www.nexusmods.com/oblivionremastered/mods/282).
- Download the OBR Quest Companion OBSE64 plugin from [Nexus Mods](https://www.nexusmods.com/oblivionremastered/mods/).
- Install `obr_quest_companion.dll` in the `Oblivion Remastered\OblivionRemastered\Binaries\Win64\OBSE\Plugins` directory.

### Plugin (ue4ss Variant)
- Install [ue4ss](https://www.nexusmods.com/oblivionremastered/mods/32) and [ConsoleUtils](https://www.nexusmods.com/oblivionremastered/mods/5021).
- Download the OBR Quest Companion ue4ss plugin from [Nexus Mods](https://www.nexusmods.com/oblivionremastered/mods/).
- Install the `OBRQuestCompanion` folder in the `Oblivion Remastered\OblivionRemastered\Binaries\Win64\ue4ss\Mods` directory.

### Companion App
- Download and install the latest Windows/Linux version of OBR Quest Companion from the [Latest GitHub Release Page](https://github.com/codeblivion/OBRQuestCompanion/releases/latest).
- Start the game and load a save. After a minute or so (OBSE64), or saving the game (ue4ss), you will find `quest_progress.json` in the `Documents\My Games\Oblivion Remastered\OBSE\OBRQuestCompanion` directory.
- Open OBR Quest Companion. Enter the full path of the JSON file into the bar at the top. 
    - E.g. `C:\Users\MartinSeptim\Documents\My Games\Oblivion Remastered\OBSE\OBRQuestCompanion\quest_progress.json`
- Click the `Load` button.
- The app will automatically refresh the file every minute or so.

## License

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

### Unofficial Elder Scrolls Pages (UESP) Content

Quest information used by this project is derived from **UESP** and is licensed under the  
**Creative Commons Attribution–ShareAlike 2.5 License**.

- Source: https://en.uesp.net/
- License: https://creativecommons.org/licenses/by-sa/2.5/

Where applicable, attribution is provided via direct links to the relevant UESP
articles.

---

### Oblivion Remastered Script Extender (OBSE64)

This project interfaces with **OBSE64** at runtime.  
OBSE64 is **not distributed** with this project and must be installed separately
by the user.

- Project: https://github.com/ianpatt/obse64

---

### Trademarks and Copyright

The Elder Scrolls is a trademark of Bethesda Softworks LLC.

This project uses limited game asset images © Bethesda Softworks LLC / ZeniMax Media Inc.
All such assets are used for non-commercial, informational purposes.

This project is unofficial and is not affiliated with or endorsed by Bethesda or ZeniMax.
