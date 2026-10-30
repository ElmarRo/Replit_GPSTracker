const arduinoCode = `#include <TinyGPSPlus.h>
#include <SoftwareSerial.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <SPI.h>
#include <SD.h>
#include <RTClib.h>

// GPS Module connections
static const int RXPin = 4, TXPin = 3;
static const uint32_t GPSBaud = 9600;

// SD Card CS pin
const int chipSelect = 10;

// Timing (milliseconds)
const unsigned long LOG_INTERVAL = 5000;  // between SD log rows
const unsigned long LCD_INTERVAL = 1000;  // between LCD refreshes
const unsigned long FIX_MAX_AGE = 2000;   // older positions count as no fix

TinyGPSPlus gps;
SoftwareSerial gpsSerial(RXPin, TXPin);
LiquidCrystal_I2C lcd(0x27, 16, 2);
RTC_DS3231 rtc;

bool sdActive = false;
bool rtcActive = false;
bool rtcNeedsSync = false;
unsigned long lastLog = 0;
unsigned long lastLcd = 0;

void setup() {
  Serial.begin(9600);
  gpsSerial.begin(GPSBaud);

  lcd.init();
  lcd.backlight();
  lcd.print(F("GPS Logger v1.3"));

  if (!SD.begin(chipSelect)) {
    Serial.println(F("SD Fail"));
  } else {
    sdActive = true;
    if (!SD.exists("gpslog.csv")) {
      File dataFile = SD.open("gpslog.csv", FILE_WRITE);
      if (dataFile) {
        dataFile.println(F("Timestamp,Lat,Lon,Sats"));
        dataFile.close();
      }
    }
  }

  if (!rtc.begin()) {
    Serial.println(F("RTC Fail"));
  } else {
    rtcActive = true;
    // After a battery change the RTC time is wrong; set it from GPS later
    if (rtc.lostPower()) {
      rtcNeedsSync = true;
      Serial.println(F("RTC lost power, will set it from GPS"));
    }
  }

  delay(2000);
  lcd.clear();
}

void loop() {
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }

  // TinyGPSPlus keeps the last position after the fix is lost, so check its age
  bool hasFix = gps.location.isValid() && gps.location.age() < FIX_MAX_AGE;

  if (rtcNeedsSync && gpsTimeValid()) {
    rtc.adjust(DateTime(gps.date.year(), gps.date.month(), gps.date.day(),
                        gps.time.hour(), gps.time.minute(), gps.time.second()));
    rtcNeedsSync = false;
    Serial.println(F("RTC set from GPS (UTC)"));
  }

  // Refreshing the LCD every pass blocks long enough to drop GPS characters
  if (millis() - lastLcd >= LCD_INTERVAL) {
    lastLcd = millis();
    updateLCD(hasFix);
  }

  if (hasFix && millis() - lastLog >= LOG_INTERVAL) {
    lastLog = millis();
    logToSD();
  }
}

bool gpsTimeValid() {
  return gps.date.isValid() && gps.time.isValid() && gps.date.year() > 2020;
}

int satCount() {
  if (!gps.satellites.isValid()) return 0;
  return min((int)gps.satellites.value(), 99);
}

void updateLCD(bool hasFix) {
  char row[17];
  char num[12];

  if (hasFix) {
    // "Lat  52.52001  8" and "Lon   13.40495": each row fits in 16 characters
    dtostrf(gps.location.lat(), 9, 5, num);
    snprintf(row, sizeof(row), "Lat %s %2d", num, satCount());
    printRow(0, row);
    dtostrf(gps.location.lng(), 10, 5, num);
    snprintf(row, sizeof(row), "Lon %s", num);
    printRow(1, row);
  } else if (millis() > 5000 && gps.charsProcessed() < 10) {
    printRow(0, "No GPS data");
    printRow(1, "Check wiring");
  } else {
    printRow(0, "Searching GPS...");
    snprintf(row, sizeof(row), "Sats: %d", satCount());
    printRow(1, row);
  }
}

// Print a full row so shorter text clears what was there before
void printRow(uint8_t line, const char *text) {
  char padded[17];
  snprintf(padded, sizeof(padded), "%-16s", text);
  lcd.setCursor(0, line);
  lcd.print(padded);
}

void logToSD() {
  if (!sdActive) return;

  File dataFile = SD.open("gpslog.csv", FILE_WRITE);
  if (!dataFile) {
    Serial.println(F("SD write failed"));
    return;
  }

  if (rtcActive && !rtcNeedsSync) {
    dataFile.print(rtc.now().timestamp());
  } else if (gpsTimeValid()) {
    char ts[20];
    snprintf(ts, sizeof(ts), "%04u-%02u-%02uT%02u:%02u:%02u",
             gps.date.year(), gps.date.month(), gps.date.day(),
             gps.time.hour(), gps.time.minute(), gps.time.second());
    dataFile.print(ts);
  } else {
    dataFile.print(millis());
  }
  dataFile.print(",");
  dataFile.print(gps.location.lat(), 6);
  dataFile.print(",");
  dataFile.print(gps.location.lng(), 6);
  dataFile.print(",");
  dataFile.println(satCount());
  dataFile.close();
  Serial.println(F("Logged position"));
}
`;

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initSimulator();
  initCodeViewer();
  initWiringDiagram();
});

function initTabs() {
  const tabs = document.querySelectorAll('.tab');
  const contents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = tab.getAttribute('data-tab');
      
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => {
        c.classList.remove('active');
      });

      tab.classList.add('active');
      const targetContent = document.getElementById(targetId);
      if (targetContent) {
        targetContent.classList.add('active');
        
        if (targetId === 'wiring') {
          setTimeout(drawWiringDiagram, 50);
        }
      }
    });
  });
}

let simState = {
  running: false,
  routeRunning: false,
  lat: 40.7128,
  lng: -74.0060,
  speed: 0,
  alt: 10,
  sats: 0,
  hasFix: false,
  displayMode: 'latlon',
  trail: []
};

let simInterval = null;
let routeInterval = null;

function initSimulator() {
  const satsSlider = document.getElementById('simSats');
  const satsVal = document.getElementById('simSatsVal');
  if (satsSlider && satsVal) {
    satsSlider.addEventListener('input', () => {
      satsVal.textContent = satsSlider.value;
      if (simState.hasFix) {
        setSats(parseInt(satsSlider.value));
        updateLCD();
      }
    });
  }

  const btnStart = document.getElementById('btnStart');
  if (btnStart) btnStart.addEventListener('click', startGPSFix);
  
  const btnRoute = document.getElementById('btnRoute');
  if (btnRoute) btnRoute.addEventListener('click', simulateRoute);
  
  const btnReset = document.getElementById('btnReset');
  if (btnReset) btnReset.addEventListener('click', resetSim);

  ['simLat', 'simLng', 'simSpeed', 'simAlt'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        if (simState.hasFix) {
          const latVal = document.getElementById('simLat');
          const lngVal = document.getElementById('simLng');
          const speedVal = document.getElementById('simSpeed');
          const altVal = document.getElementById('simAlt');
          
          simState.lat = latVal ? parseFloat(latVal.value) : 0;
          simState.lng = lngVal ? parseFloat(lngVal.value) : 0;
          simState.speed = speedVal ? parseFloat(speedVal.value) : 0;
          simState.alt = altVal ? parseFloat(altVal.value) : 0;
          
          updateLCD();
          updateMap();
        }
      });
    }
  });

  drawMap();
  serialPrint('System Ready');
}

function startGPSFix() {
  if (simState.running) return;
  simState.running = true;

  const led = document.getElementById('gpsLed');
  const status = document.getElementById('gpsStatus');
  if (led) led.className = 'led searching';
  if (status) status.textContent = 'Acquiring...';

  serialPrint('Searching for satellites...');
  setLCD('Searching GPS...', 'Sats: 0');

  let satBuild = 0;
  const simSatsInput = document.getElementById('simSats');
  const targetSats = simSatsInput ? parseInt(simSatsInput.value) : 8;

  // Satellites keep coming in after the fix until the target count is reached
  const fixInterval = setInterval(() => {
    satBuild++;
    const currentSats = Math.min(satBuild, targetSats);
    setSats(currentSats);

    if (simState.hasFix) {
      updateLCD();
      if (currentSats >= targetSats) clearInterval(fixInterval);
      return;
    }

    setLCD('Searching GPS...', "Sats: " + currentSats);

    if (currentSats >= 3 && satBuild >= 4) {
      if (currentSats >= targetSats) clearInterval(fixInterval);
      simState.hasFix = true;
      
      const latInput = document.getElementById('simLat');
      const lngInput = document.getElementById('simLng');
      
      simState.lat = latInput ? parseFloat(latInput.value) : 40.7128;
      simState.lng = lngInput ? parseFloat(lngInput.value) : -74.0060;
      simState.trail = [{ lat: simState.lat, lng: simState.lng }];

      if (led) led.className = 'led fixed';
      if (status) status.textContent = 'Fix acquired';

      serialPrint('GPS Fix Acquired');
      serialPrint('Logging to SD card every 5s');

      updateLCD();
      updateMap();

      simInterval = setInterval(() => {
        if (simState.hasFix) {
          serialPrint("SD: [" + new Date().toLocaleTimeString() + "] Logged Pos: " + simState.lat.toFixed(4) + "," + simState.lng.toFixed(4));
        }
      }, 5000);
    }
  }, 800);
}

function simulateRoute() {
  if (!simState.hasFix) return;
  
  const btnRoute = document.getElementById('btnRoute');
  if (simState.routeRunning) {
    clearInterval(routeInterval);
    simState.routeRunning = false;
    if (btnRoute) btnRoute.textContent = 'Simulate Route';
    return;
  }

  simState.routeRunning = true;
  if (btnRoute) btnRoute.textContent = 'Stop Route';

  const baseLat = simState.lat;
  const baseLng = simState.lng;
  let angle = 0;

  routeInterval = setInterval(() => {
    angle += 0.05;
    simState.lat = baseLat + Math.sin(angle) * 0.01;
    simState.lng = baseLng + Math.cos(angle) * 0.015;

    const latInput = document.getElementById('simLat');
    const lngInput = document.getElementById('simLng');
    
    if (latInput) latInput.value = simState.lat.toFixed(4);
    if (lngInput) lngInput.value = simState.lng.toFixed(4);

    simState.trail.push({ lat: simState.lat, lng: simState.lng });
    if (simState.trail.length > 200) simState.trail.shift();

    updateLCD();
    updateMap();
  }, 500);
}

// Keep the status panel, slider and simulator state on the same satellite count
function setSats(count) {
  simState.sats = count;

  const satCountLabel = document.getElementById('satCount');
  if (satCountLabel) satCountLabel.textContent = count;

  const simSatsRange = document.getElementById('simSats');
  if (simSatsRange) simSatsRange.value = count;

  const simSatsValLabel = document.getElementById('simSatsVal');
  if (simSatsValLabel) simSatsValLabel.textContent = count;
}

function resetSim() {
  location.reload();
}

function updateLCD() {
  const lat = simState.lat;
  const lng = simState.lng;
  const sats = simState.sats;

  // Same layout as the sketch's updateLCD()
  const row1 = "Lat " + lat.toFixed(5).padStart(9) + " " + String(Math.min(sats, 99)).padStart(2);
  const row2 = "Lon " + lng.toFixed(5).padStart(10);

  setLCD(padLCD(row1), padLCD(row2));
}

function padLCD(str) {
  return str.substring(0, 16).padEnd(16, ' ');
}

function setLCD(row1, row2) {
  const r1 = document.getElementById('lcdRow1');
  const r2 = document.getElementById('lcdRow2');
  if (r1) r1.textContent = row1;
  if (r2) r2.textContent = row2;
}

function serialPrint(text) {
  const output = document.getElementById('serialOutput');
  if (output) {
    const timestamp = new Date().toLocaleTimeString();
    output.textContent += "[" + timestamp + "] " + text + "\n";
    output.scrollTop = output.scrollHeight;
  }
}

function drawMap() {
  const canvas = document.getElementById('mapCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = '#0d1a2a';
  ctx.fillRect(0, 0, w, h);
  drawGrid(ctx, w, h);
  const cx = w / 2;
  const cy = h / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#00b4d8';
  ctx.fill();
  const mapCoordsLabel = document.getElementById('mapCoords');
  if (mapCoordsLabel) mapCoordsLabel.textContent = simState.lat.toFixed(4) + ", " + simState.lng.toFixed(4);
}

function updateMap() {
  const canvas = document.getElementById('mapCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = '#0d1a2a';
  ctx.fillRect(0, 0, w, h);
  drawGrid(ctx, w, h);
  const cx = w / 2;
  const cy = h / 2;
  if (simState.trail.length > 1) {
    const scale = 20000;
    ctx.beginPath();
    ctx.strokeStyle = '#00b4d866';
    ctx.lineWidth = 2;
    for (let i = 0; i < simState.trail.length; i++) {
      const px = cx + (simState.trail[i].lng - simState.lng) * scale;
      const py = cy - (simState.trail[i].lat - simState.lat) * scale;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#00e676';
  ctx.fill();
  const mapCoordsLabel = document.getElementById('mapCoords');
  if (mapCoordsLabel) mapCoordsLabel.textContent = simState.lat.toFixed(4) + ", " + simState.lng.toFixed(4);
}

function drawGrid(ctx, w, h) {
  ctx.strokeStyle = '#1a2a3a';
  ctx.lineWidth = 0.5;
  for (let x = 0; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
}

function initCodeViewer() {
  const codeEl = document.getElementById('arduinoCode');
  if (codeEl) codeEl.innerHTML = highlightArduino(arduinoCode);
  const btnCopy = document.getElementById('btnCopy');
  if (btnCopy) {
    btnCopy.addEventListener('click', () => {
      navigator.clipboard.writeText(arduinoCode).then(() => {
        btnCopy.textContent = 'Copied!';
        setTimeout(() => btnCopy.textContent = 'Copy Code', 2000);
      });
    });
  }
}

function highlightArduino(code) {
  let html = escapeHtml(code);
  html = html.replace(/(\/\/.*)/g, '<span class="cmt">$1</span>');
  html = html.replace(/(#include\s*&lt;[^&]*&gt;)/g, '<span class="pp">$1</span>');
  const keywords = ['void', 'int', 'float', 'double', 'char', 'byte', 'static', 'const', 'unsigned', 'long', 'if', 'else', 'switch', 'case', 'break', 'return', 'for', 'while', 'true', 'false'];
  keywords.forEach(kw => {
    const re = new RegExp("\\\\b" + kw + "\\\\b", 'g');
    html = html.replace(re, '<span class="kw">' + kw + '</span>');
  });
  html = html.replace(/\\b(\\d+\\.?\\d*)\\b/g, '<span class="num">$1</span>');
  return html;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function initWiringDiagram() {
  const canvas = document.getElementById('wiringCanvas');
  if (canvas) {
    canvas.width = 800;
    canvas.height = 500;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
  }
  
  const checkAndDraw = () => {
    const section = document.getElementById('wiring');
    if (section && section.classList.contains('active')) {
      drawWiringDiagram();
    }
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        checkAndDraw();
      }
    });
  }, { threshold: 0.1 });

  if (canvas) observer.observe(canvas);
  
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      setTimeout(checkAndDraw, 100);
      setTimeout(checkAndDraw, 500);
    });
  });

  window.drawWiringNow = drawWiringDiagram;
  setTimeout(checkAndDraw, 500);
}

function drawWiringDiagram() {
  const canvas = document.getElementById('wiringCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  
  const loading = document.getElementById('wiringLoading');
  if (loading) loading.style.display = 'none';

  ctx.fillStyle = '#0d1a2a';
  ctx.fillRect(0, 0, w, h);

  // Each draw function returns its pin positions, so wires always end on a pin
  const uno = drawArduinoBoard(ctx, 300, 40, 200, 370);
  const lcd = drawModule(ctx, 40, 130, 160, 120, '16x2 LCD I2C', ['VCC', 'GND', 'SDA', 'SCL'], 'right', '#1a1a4a', '#3a3a8a');
  const rtc = drawModule(ctx, 40, 300, 160, 120, 'DS3231 RTC', ['VCC', 'GND', 'SCL', 'SDA'], 'right', '#1a1a4a', '#3a3a8a');
  const sd = drawModule(ctx, 600, 40, 160, 170, 'SD MODULE', ['VCC', 'GND', 'SCK', 'MISO', 'MOSI', 'CS'], 'left', '#1a1a1a', '#444');
  const gps = drawModule(ctx, 600, 250, 160, 130, 'NEO-6M GPS', ['TX', 'RX', 'VCC', 'GND'], 'left', '#1a4a1a', '#2a6a2a');

  drawWiringConnections(ctx, uno, lcd, rtc, sd, gps);
  drawWiringLegend(ctx, h);
}

function drawWiringConnections(ctx, uno, lcd, rtc, sd, gps) {
  // Power: net labels instead of wires; every +5V label is the Uno's 5V pin
  [lcd, rtc].forEach(m => {
    drawPowerLabel(ctx, m.VCC, 'right', '+5V');
    drawPowerLabel(ctx, m.GND, 'right', 'GND');
  });
  [sd, gps].forEach(m => {
    drawPowerLabel(ctx, m.VCC, 'left', '+5V');
    drawPowerLabel(ctx, m.GND, 'left', 'GND');
  });
  drawPowerLabel(ctx, uno['5V'], 'left', '+5V');
  drawPowerLabel(ctx, uno.GND, 'left', 'GND');

  // I2C bus shared by the LCD and the RTC: SDA -> A4, SCL -> A5
  const sdaX = 270, sclX = 250;
  const sda = '#00b4d8', scl = '#ff9800';
  drawPath(ctx, [lcd.SDA, [sdaX, lcd.SDA[1]], [sdaX, rtc.SDA[1]], rtc.SDA], sda);
  drawPath(ctx, [lcd.SCL, [sclX, lcd.SCL[1]], [sclX, rtc.SCL[1]], rtc.SCL], scl);
  drawPath(ctx, [uno.A4, [sdaX, uno.A4[1]]], sda);
  drawJunction(ctx, sdaX, uno.A4[1], sda);
  // A5 crosses the SDA line without connecting to it, shown as a hop
  drawPath(ctx, [uno.A5, [sdaX + 6, uno.A5[1]]], scl);
  drawHop(ctx, sdaX, uno.A5[1], scl);
  drawPath(ctx, [[sdaX - 6, uno.A5[1]], [sclX, uno.A5[1]]], scl);
  drawJunction(ctx, sclX, uno.A5[1], scl);

  // SD card on the SPI pins
  drawElbow(ctx, uno.D13, sd.SCK, 540, '#ffd60a');
  drawElbow(ctx, uno.D12, sd.MISO, 550, '#00e676');
  drawElbow(ctx, uno.D11, sd.MOSI, 560, '#ff6ec7');
  drawElbow(ctx, uno.D10, sd.CS, 570, '#b388ff');

  // GPS on SoftwareSerial: GPS TX -> D4 (Arduino RX), GPS RX -> D3 (Arduino TX)
  drawElbow(ctx, uno.D4, gps.TX, 540, '#00e676');
  drawElbow(ctx, uno.D3, gps.RX, 560, '#ffd60a');
}

// Wire that leaves one pin horizontally, turns at x = turnX, and enters the other
function drawElbow(ctx, from, to, turnX, color) {
  drawPath(ctx, [from, [turnX, from[1]], [turnX, to[1]], to], color);
}

function drawPath(ctx, points, color) {
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.moveTo(points[0][0], points[0][1]);
  points.slice(1).forEach(p => ctx.lineTo(p[0], p[1]));
  ctx.stroke();
}

function drawJunction(ctx, x, y, color) {
  ctx.beginPath();
  ctx.fillStyle = color;
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawHop(ctx, x, y, color) {
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.arc(x, y, 6, Math.PI, 0, false);
  ctx.stroke();
}

function drawPowerLabel(ctx, pin, side, label) {
  const dir = side === 'right' ? 1 : -1;
  const color = label === 'GND' ? '#9e9e9e' : '#e63946';
  drawPath(ctx, [pin, [pin[0] + dir * 12, pin[1]]], color);
  ctx.fillStyle = color;
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = side === 'right' ? 'left' : 'right';
  ctx.fillText(label, pin[0] + dir * 15, pin[1] + 3);
}

function drawWiringLegend(ctx, h) {
  ctx.fillStyle = '#9fb3c8';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('+5V and GND labels: connect every +5V to the Uno 5V pin and every GND to a Uno GND pin.', 40, h - 50);
  ctx.fillText('A dot joins wires. Where a wire hops over another, they are not connected.', 40, h - 32);
  ctx.fillText('LCD and RTC share the I2C bus (SDA = A4, SCL = A5). Module pin order varies: match by pin name.', 40, h - 14);
}

// Module box with labelled pins along one edge; returns { pinName: [x, y] }
function drawModule(ctx, x, y, w, h, title, pins, side, fill, stroke) {
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, x + w / 2, y + 22);

  const pos = {};
  const edgeX = side === 'right' ? x + w : x;
  ctx.font = '10px monospace';
  pins.forEach((pin, i) => {
    const py = y + 40 + i * 22;
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(edgeX - 5, py - 3, 10, 6);
    ctx.fillStyle = '#ccc';
    ctx.textAlign = side === 'right' ? 'right' : 'left';
    ctx.fillText(pin, side === 'right' ? edgeX - 10 : edgeX + 10, py + 3);
    pos[pin] = [edgeX, py];
  });
  return pos;
}

// Uno with power/analog pins on the left edge and digital pins on the right
function drawArduinoBoard(ctx, x, y, w, h) {
  ctx.fillStyle = '#0066aa';
  ctx.strokeStyle = '#0088cc';
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ARDUINO UNO', x + w / 2, y + 25);

  const pos = {};
  ctx.font = '10px monospace';
  const leftPins = ['5V', 'GND', 'GND ', 'VIN', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5'];
  leftPins.forEach((p, i) => {
    const py = y + 40 + i * 22;
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(x - 5, py - 3, 10, 6);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(p.trim(), x + 10, py + 3);
    if (!(p in pos)) pos[p] = [x, py];
  });

  const rightPins = ['AREF', 'GND', 'D13', 'D12', 'D11', 'D10', 'D9', 'D8',
                     'D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'D1/TX', 'D0/RX'];
  rightPins.forEach((p, i) => {
    const py = y + 40 + i * 20;
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(x + w - 5, py - 3, 10, 6);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'right';
    ctx.fillText(p, x + w - 10, py + 3);
    if (!(p in pos)) pos[p] = [x + w, py];
  });
  return pos;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
