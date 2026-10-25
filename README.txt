DigiBara Mods — Extended Edition v3
──────────────────────────────────

SETUP & RUNNING
  1. Ensure serve_mods.py and modloader.js are in your game directory.
  2. Run:   python serve_mods.py
  3. Open:  http://localhost:8000 in your web browser.
  4. Click the "🎮 Mods" button at the bottom-left of the screen.

WHAT WAS FIXED & ADDED
  1. Patreon VIP Plus Bypass:
     • Fixed XMLHttpRequest and fetch interception to return authentic ArrayBuffer
       responses expected by GameMaker's Wasm runner.
     • Guaranteed "ok: true", "tier: digibara_premium_plus", and future charge dates.
     • Auto-injects patreon_link.save into virtual filesystem so VIP perks & the
       Global Management Menu activate seamlessly.
     • Any username/email entered in the Patreon link menu immediately succeeds!

  2. Save Editor Number Typing:
     • Fixed keyboard event capture (e.stopPropagation()) so GameMaker no longer eats
       number keys or backspaces when typing into input boxes.
     • You can now directly type ANY number into Money, Milk, Level, EXP, Tickets,
       Energy, Satiety, Hygiene, Horny, and Attribute fields.
     • Added handy one-click shortcut buttons (+10k, +1M, Max, 100, etc.) beside every input.

  3. Comprehensive Character & Content Unlockers:
     • "🌟 1-Click Master Unlock (God Mode)": Unlocks all 10 official characters,
       all outfits (0-199), all modules, stamps Patreon VIP Plus, and maxes resources.
     • Character Unlocker: Individual and bulk unlock buttons for all official characters:
       - Sager (d44_sager)
       - The Guy (g00meva_theguy)
       - Himboy (konguipeach_himboy)
       - Matt (krok_matt)
       - Marvin (mead_marvin)
       - Pint (pintplows_pint)
       - Jack (rikki_jack)
       - Jack Fat (rikki_jack_fat)
       - Captain (shamieroe_captain)
       - Ignacio (thebluemon_ignacio)
       plus any custom imported characters.
     • Outfits & Modules Unlocker: Unlocks all 200 outfit slots and 20 module slots.
     • Multi-file Zip Export: Saves both savegame.save and patreon_link.save together,
       preserving all custom character web assets.

HOW TO USE THE SAVE EDITOR
  1. In the game: go to Settings → Backup Save File (saves a .zip or .save).
  2. In the mods overlay: click "💾 Save Editor".
  3. Load your backup file.
  4. Use "🔓 Master Unlockers", "💰 Economy & Global", or "👥 Characters" to edit/unlock.
  5. Click "⬇ Download .zip Backup".
  6. In the game: go to Settings → Restore / Import and pick your downloaded zip file.
