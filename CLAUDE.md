# CLAUDE.md

An Arduino Uno GPS tracker: a browser simulator plus a hardware reference
(Arduino sketch, wiring diagram, pin table). The simulator is a demo and never
talks to real hardware. The hardware is a NEO-6M GPS, an I2C 16x2 LCD (0x27),
a DS3231 RTC and an SPI SD card module.

`README.md` is the user-facing manual. The project is also edited in Replit
(Replit Agent keeps `replit.md` and `.replit`); leave those files to Replit
unless asked.

## Layout

| Path | What it is |
|---|---|
| `server.js` | Express static server on port 5000 (fixed). |
| `public/index.html` | Three tabs: Simulator, Arduino Code, Wiring & Components (incl. the pin table). |
| `public/app.js` | Everything else, top to bottom: the Arduino sketch, tabs, simulator, map, code viewer, wiring diagram. |
| `public/styles.css` | Dark theme. |

Plain HTML/CSS/JS, no framework, no build step. Express is the only dependency.

## The Arduino sketch

The sketch is the `arduinoCode` template literal at the top of `public/app.js`;
the Arduino Code tab shows it and the user copies it into the Arduino IDE.

- It must not contain a backtick or `${`, or the JavaScript breaks.
- Libraries: TinyGPSPlus, LiquidCrystal_I2C (`lcd.init()`), RTClib (Adafruit), SD.
- The Uno has 2 KB of RAM and the build already uses about 76%: keep constant
  strings in `F()`, avoid `String`, prefer small fixed `char` buffers.
- Pins: GPS TX → D4 / RX → D3 (SoftwareSerial, 9600 baud), SD CS → D10 (SPI
  on D11–D13), LCD and RTC on I2C (A4/A5).

After changing the sketch, compile it for the Uno. Extract it from `app.js`
and build with `arduino-cli`:

```bash
mkdir -p GPS_Tracker
node -e "const s=require('fs').readFileSync('public/app.js','utf8');process.stdout.write(eval(s.slice(s.indexOf('\`'),s.indexOf('\n\`;')+2)))" > GPS_Tracker/GPS_Tracker.ino
arduino-cli compile --fqbn arduino:avr:uno --warnings all GPS_Tracker
```

Do the build outside the repo (scratch directory). In cloud sessions,
`arduino-cli` ignores `HTTPS_PROXY`: set `ARDUINO_NETWORK_PROXY` to the same
value to install the `arduino:avr` core and libraries. Report flash and RAM
use, and say so if the sketch wasn't compiled.

## Keep these in sync

A change to the hardware or the sketch usually touches several places:

- **Pins:** the README table, the table in `index.html`, the sketch, and the
  wiring diagram in `app.js`.
- **LCD layout:** the sketch's `updateLCD()` and the simulator's `updateLCD()`
  must produce the same 16-character rows (`Lat -33.86880  9` / `Lon  151.20930`).
- **Behaviour:** the README describes the sketch's logging, timestamps and LCD
  states; update it in the same commit.

## Simulator and wiring diagram

- The satellite count goes through `setSats()`, which updates the state, the
  status panel, the slider and the LCD together. Don't write these separately.
- In the wiring diagram, `drawModule()` and `drawArduinoBoard()` return pin
  positions, and wires are drawn between those positions. Never hard-code wire
  coordinates. Power is drawn as `+5V`/`GND` labels.
- Known open issues, listed in the README: a target of 0–2 satellites never
  gets a fix, and the "LCD Display Mode" selector does nothing.

## Run and check

```bash
npm install
npm start                # http://localhost:5000
node --check public/app.js
```

There are no automated tests; `npm test` is a placeholder that fails. Check UI
changes in a headless browser (Playwright with Chromium): click through the
affected tab and confirm there are no page errors.

## Workflow

Work on a `claude/…` branch and merge into `main` through a pull request when
asked. Commit subjects are short and imperative; prefix simulator-only
changes with `Simulator:`.
