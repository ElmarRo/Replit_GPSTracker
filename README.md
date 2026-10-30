# Arduino GPS Tracker

An interactive web simulator and hardware reference for an Arduino Uno GPS
tracker. The browser simulator is a demonstration: it does not communicate
with a physical GPS receiver, LCD, RTC, or SD card.

## Features

- Simulated GPS fix acquisition, position controls, and route movement
- LCD-style display, position map, and serial monitor
- Arduino sketch available in the **Arduino Code** tab
- Component list and pin reference in **Wiring & Components**
- Five-second position logging in the Arduino sketch when a valid GPS fix is
  available
- Optional DS3231 timestamps when an RTC is detected by the sketch

## Run the web app

Requirements: Node.js 20 or newer.

```sh
npm install
npm start
```

Open <http://localhost:5000>. To stop the server, press `Ctrl+C` in the
terminal.

## Use the simulator

1. Set the simulated coordinates and satellite count.
2. Select **Start GPS Fix** to simulate acquiring a fix.
3. Select **Simulate Route** to move the simulated position.
4. Use **Arduino Code** to view or copy the firmware sketch.
5. Use **Wiring & Components** for the pin table and component list.

The map is a local canvas visualization, not a live map. Simulator state and
logs are held in the page and are not saved to a database or downloaded to an
SD card.

## Hardware reference

The sketch and pin table are written for an Arduino Uno with a NEO-6M GPS
module, I2C 16x2 LCD, SPI SD module, and DS3231 RTC.

| Component | Component pin | Arduino Uno |
| --- | --- | --- |
| NEO-6M GPS | VCC | 5V (confirm the module's input-voltage rating) |
| NEO-6M GPS | GND | GND |
| NEO-6M GPS | TX | D4 (SoftwareSerial RX) |
| NEO-6M GPS | RX | D3 (SoftwareSerial TX) |
| I2C LCD | VCC | 5V |
| I2C LCD | GND | GND |
| I2C LCD | SDA | A4 |
| I2C LCD | SCL | A5 |
| SD module | VCC | 5V (use a 5V-compatible module) |
| SD module | GND | GND |
| SD module | CS | D10 |
| SD module | MOSI | D11 |
| SD module | MISO | D12 |
| SD module | SCK | D13 |
| DS3231 RTC | VCC | 5V |
| DS3231 RTC | GND | GND |
| DS3231 RTC | SDA | A4 |
| DS3231 RTC | SCL | A5 |

The LCD and RTC share the Uno's I2C bus. If the SD shield includes an RTC,
confirm that it is a DS3231-compatible device and check its pinout; shields
vary. The wiring diagram on the **Wiring & Components** tab matches this
table: every wire ends on its Arduino pin, and power is shown as `+5V` and
`GND` labels instead of wires. Module pin order varies between boards, so
match pins by name.

Check the voltage requirements of each board before connecting it. Some
breakout boards are not 5V tolerant even when they can be powered from 5V.

### Arduino libraries

Install these through the Arduino IDE Library Manager:

- **TinyGPSPlus**
- **LiquidCrystal_I2C**
- **RTClib** (Adafruit)

`SoftwareSerial`, `Wire`, `SPI`, and `SD` are provided by the Arduino
environment for supported boards. Select the correct board and serial port in
the Arduino IDE before uploading. The sketch expects GPS data at 9600 baud and
an LCD I2C address of `0x27`; hardware may require a different LCD address.

The sketch appends CSV rows to `gpslog.csv` on the SD card. When the RTC is
available, rows use its date and time; otherwise they use the GPS date and time
(UTC), or elapsed milliseconds if the GPS has no time yet. It logs only while
the GPS has a current fix: a position older than two seconds counts as no fix.
If the RTC reports that it lost power, the sketch sets it from GPS time (UTC)
once the GPS provides one.

The LCD shows latitude and satellite count on the first row and longitude on
the second, refreshed once per second. If no data arrives from the GPS within
five seconds of starting, it shows `No GPS data` / `Check wiring`.

## Tests

Automated tests are not configured yet. The current `npm test` script is a
placeholder and exits with an error.

## Review notes and limitations

- Verify the physical pinout of each board before wiring; module pin order
  and labels vary between manufacturers.
- The simulator's **LCD Display Mode** selector is present in the interface,
  but the current simulator always displays satellite count and position.
- The simulator's GPS fix acquisition requires a target satellite count of at
  least three. With the slider at zero, acquisition does not complete.

## Project structure

```text
server.js          Express static-file server
public/index.html  App layout and reference tables
public/styles.css  App styles
public/app.js      Simulator, Arduino sketch text, and canvas drawings
```
