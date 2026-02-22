const arduinoCode = `#include <TinyGPSPlus.h>
#include <SoftwareSerial.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// GPS Module connections
// GPS TX -> Arduino D4
// GPS RX -> Arduino D3
static const int RXPin = 4, TXPin = 3;
static const uint32_t GPSBaud = 9600;

TinyGPSPlus gps;
SoftwareSerial gpsSerial(RXPin, TXPin);

// LCD I2C address 0x27, 16 columns, 2 rows
LiquidCrystal_I2C lcd(0x27, 16, 2);

// Display mode cycle
int displayMode = 0;
unsigned long lastModeSwitch = 0;
const unsigned long MODE_INTERVAL = 3000; // 3 seconds per mode

// Custom characters for LCD
byte satIcon[8] = {
  0b00000, 0b01010, 0b00100, 0b01110,
  0b00100, 0b01010, 0b00000, 0b00000
};

byte arrowIcon[8] = {
  0b00000, 0b00100, 0b01110, 0b10101,
  0b00100, 0b00100, 0b00100, 0b00000
};

void setup() {
  Serial.begin(9600);
  gpsSerial.begin(GPSBaud);

  // Initialize LCD
  lcd.init();
  lcd.backlight();
  lcd.createChar(0, satIcon);
  lcd.createChar(1, arrowIcon);

  // Startup message
  lcd.setCursor(0, 0);
  lcd.print("GPS Tracker v1.0");
  lcd.setCursor(0, 1);
  lcd.print("Searching sats..");

  Serial.println(F("========================="));
  Serial.println(F(" Arduino GPS Tracker"));
  Serial.println(F(" with 16x2 LCD Display"));
  Serial.println(F("========================="));
  Serial.println();
}

void loop() {
  // Read GPS data
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }

  // Auto-cycle display modes every 3 seconds
  if (millis() - lastModeSwitch > MODE_INTERVAL) {
    lastModeSwitch = millis();
    displayMode = (displayMode + 1) % 4;
  }

  // Update display based on GPS fix status
  if (gps.location.isValid()) {
    updateDisplay();
    printSerialData();
  } else {
    showSearching();
  }

  delay(100);
}

void updateDisplay() {
  lcd.clear();

  switch (displayMode) {
    case 0: // Latitude and Longitude
      lcd.setCursor(0, 0);
      lcd.print("Lat:");
      lcd.print(gps.location.lat(), 4);
      lcd.setCursor(0, 1);
      lcd.print("Lon:");
      lcd.print(gps.location.lng(), 4);
      break;

    case 1: // Speed and Altitude
      lcd.setCursor(0, 0);
      lcd.print("Spd:");
      lcd.print(gps.speed.kmph(), 1);
      lcd.print(" km/h");
      lcd.setCursor(0, 1);
      lcd.print("Alt:");
      lcd.print(gps.altitude.meters(), 1);
      lcd.print(" m");
      break;

    case 2: // Satellites and HDOP
      lcd.setCursor(0, 0);
      lcd.write(byte(0)); // satellite icon
      lcd.print(" Sats: ");
      lcd.print(gps.satellites.value());
      lcd.setCursor(0, 1);
      lcd.print("HDOP: ");
      lcd.print(gps.hdop.hdop(), 1);
      break;

    case 3: // Date and Time (UTC)
      lcd.setCursor(0, 0);
      if (gps.date.isValid()) {
        char dateBuf[17];
        sprintf(dateBuf, "Date: %02d/%02d/%04d",
          gps.date.month(),
          gps.date.day(),
          gps.date.year());
        lcd.print(dateBuf);
      } else {
        lcd.print("Date: --/--/----");
      }
      lcd.setCursor(0, 1);
      if (gps.time.isValid()) {
        char timeBuf[17];
        sprintf(timeBuf, "Time: %02d:%02d:%02d",
          gps.time.hour(),
          gps.time.minute(),
          gps.time.second());
        lcd.print(timeBuf);
      } else {
        lcd.print("Time: --:--:--");
      }
      break;
  }
}

void showSearching() {
  static int dots = 0;
  lcd.setCursor(0, 0);
  lcd.print("Searching GPS   ");
  lcd.setCursor(0, 1);
  lcd.print("Satellites");
  for (int i = 0; i < dots; i++) lcd.print(".");
  for (int i = dots; i < 5; i++) lcd.print(" ");
  dots = (dots + 1) % 6;
}

void printSerialData() {
  static unsigned long lastPrint = 0;
  if (millis() - lastPrint < 2000) return;
  lastPrint = millis();

  Serial.print(F("Lat: "));
  Serial.print(gps.location.lat(), 6);
  Serial.print(F("  Lon: "));
  Serial.println(gps.location.lng(), 6);
  Serial.print(F("Speed: "));
  Serial.print(gps.speed.kmph());
  Serial.print(F(" km/h  Alt: "));
  Serial.print(gps.altitude.meters());
  Serial.println(F(" m"));
  Serial.print(F("Satellites: "));
  Serial.print(gps.satellites.value());
  Serial.print(F("  HDOP: "));
  Serial.println(gps.hdop.hdop());
  Serial.println(F("-------------------------"));
}`;

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initSimulator();
  initCodeViewer();
  initWiringDiagram();
});

function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
      if (tab.dataset.tab === 'wiring') {
        setTimeout(drawWiringDiagram, 100);
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
  routeIndex: 0,
  trail: []
};

let simInterval = null;
let routeInterval = null;

function initSimulator() {
  const satsSlider = document.getElementById('simSats');
  const satsVal = document.getElementById('simSatsVal');
  satsSlider.addEventListener('input', () => {
    satsVal.textContent = satsSlider.value;
  });

  document.getElementById('btnStart').addEventListener('click', startGPSFix);
  document.getElementById('btnRoute').addEventListener('click', simulateRoute);
  document.getElementById('btnReset').addEventListener('click', resetSim);
  document.getElementById('displayMode').addEventListener('change', (e) => {
    simState.displayMode = e.target.value;
    if (simState.hasFix) updateLCD();
  });

  ['simLat', 'simLng', 'simSpeed', 'simAlt'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      if (simState.hasFix) {
        simState.lat = parseFloat(document.getElementById('simLat').value) || 0;
        simState.lng = parseFloat(document.getElementById('simLng').value) || 0;
        simState.speed = parseFloat(document.getElementById('simSpeed').value) || 0;
        simState.alt = parseFloat(document.getElementById('simAlt').value) || 0;
        updateLCD();
        updateMap();
      }
    });
  });

  drawMap();
  serialPrint('=========================');
  serialPrint(' Arduino GPS Tracker');
  serialPrint(' with 16x2 LCD Display');
  serialPrint('=========================');
  serialPrint('');
  serialPrint('Waiting for GPS fix...');
}

function startGPSFix() {
  if (simState.running) return;
  simState.running = true;

  const led = document.getElementById('gpsLed');
  const status = document.getElementById('gpsStatus');
  led.className = 'led searching';
  status.textContent = 'Acquiring...';

  serialPrint('GPS module powered on');
  serialPrint('Searching for satellites...');

  setLCD('Searching GPS   ', 'Satellites..    ');

  let satBuild = 0;
  const targetSats = parseInt(document.getElementById('simSats').value) || 8;

  const fixInterval = setInterval(() => {
    satBuild++;
    const currentSats = Math.min(satBuild, targetSats);
    document.getElementById('satCount').textContent = currentSats;
    document.getElementById('simSats').value = currentSats;
    document.getElementById('simSatsVal').textContent = currentSats;

    let dots = '.'.repeat((satBuild % 5) + 1);
    setLCD('Searching GPS   ', `Sats: ${currentSats}${dots}     `);
    serialPrint(`Satellites found: ${currentSats}`);

    if (currentSats >= 3 && satBuild >= 4) {
      clearInterval(fixInterval);
      simState.hasFix = true;
      simState.sats = targetSats;
      simState.lat = parseFloat(document.getElementById('simLat').value) || 40.7128;
      simState.lng = parseFloat(document.getElementById('simLng').value) || -74.0060;
      simState.speed = parseFloat(document.getElementById('simSpeed').value) || 0;
      simState.alt = parseFloat(document.getElementById('simAlt').value) || 10;
      simState.trail = [{ lat: simState.lat, lng: simState.lng }];

      led.className = 'led fixed';
      status.textContent = 'Fix acquired';
      document.getElementById('hdop').textContent = '1.2';

      serialPrint('');
      serialPrint('*** GPS FIX ACQUIRED ***');
      serialPrint('-------------------------');

      updateLCD();
      updateMap();

      simInterval = setInterval(() => {
        printSerialData();
      }, 2000);
    }
  }, 800);
}

function simulateRoute() {
  if (!simState.hasFix) {
    serialPrint('ERROR: No GPS fix. Start GPS first.');
    return;
  }
  if (simState.routeRunning) {
    clearInterval(routeInterval);
    simState.routeRunning = false;
    document.getElementById('btnRoute').textContent = 'Simulate Route';
    simState.speed = 0;
    document.getElementById('simSpeed').value = 0;
    updateLCD();
    return;
  }

  simState.routeRunning = true;
  document.getElementById('btnRoute').textContent = 'Stop Route';
  serialPrint('Route simulation started');

  const baseLat = simState.lat;
  const baseLng = simState.lng;
  let angle = 0;
  const radius = 0.01;

  routeInterval = setInterval(() => {
    angle += 0.08;
    simState.lat = baseLat + Math.sin(angle) * radius;
    simState.lng = baseLng + Math.cos(angle) * radius * 1.5;
    simState.speed = 25 + Math.sin(angle * 2) * 15;
    simState.alt = 10 + Math.sin(angle * 0.5) * 20;

    document.getElementById('simLat').value = simState.lat.toFixed(4);
    document.getElementById('simLng').value = simState.lng.toFixed(4);
    document.getElementById('simSpeed').value = Math.round(simState.speed);
    document.getElementById('simAlt').value = Math.round(simState.alt);

    simState.trail.push({ lat: simState.lat, lng: simState.lng });
    if (simState.trail.length > 200) simState.trail.shift();

    updateLCD();
    updateMap();
  }, 500);
}

function resetSim() {
  clearInterval(simInterval);
  clearInterval(routeInterval);
  simState = {
    running: false,
    routeRunning: false,
    lat: 40.7128,
    lng: -74.0060,
    speed: 0,
    alt: 10,
    sats: 0,
    hasFix: false,
    displayMode: document.getElementById('displayMode').value,
    routeIndex: 0,
    trail: []
  };

  document.getElementById('gpsLed').className = 'led';
  document.getElementById('gpsStatus').textContent = 'Searching...';
  document.getElementById('satCount').textContent = '0';
  document.getElementById('hdop').textContent = '--';
  document.getElementById('simSats').value = 0;
  document.getElementById('simSatsVal').textContent = '0';
  document.getElementById('simLat').value = '40.7128';
  document.getElementById('simLng').value = '-74.0060';
  document.getElementById('simSpeed').value = '0';
  document.getElementById('simAlt').value = '10';
  document.getElementById('btnRoute').textContent = 'Simulate Route';

  setLCD('Initializing...', 'GPS Tracker v1.0');

  document.getElementById('serialOutput').textContent = '';
  serialPrint('--- System Reset ---');
  serialPrint('Waiting for GPS fix...');

  drawMap();
}

function updateLCD() {
  const lat = simState.lat;
  const lng = simState.lng;
  const speed = simState.speed;
  const alt = simState.alt;
  const sats = simState.sats;
  const mode = simState.displayMode;

  let row1 = '', row2 = '';

  switch (mode) {
    case 'latlon':
      row1 = `Lat: ${lat.toFixed(4)}`;
      row2 = `Lon:${lng.toFixed(4)}`;
      break;
    case 'speed':
      row1 = `Spd:${speed.toFixed(1)} km/h`;
      row2 = `Alt:${alt.toFixed(1)} m`;
      break;
    case 'sats':
      row1 = `* Sats: ${sats}`;
      row2 = `HDOP: 1.2`;
      break;
    case 'time':
      const now = new Date();
      row1 = `Date: ${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')}/${now.getFullYear()}`;
      row2 = `Time: ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
      break;
  }

  setLCD(padLCD(row1), padLCD(row2));
}

function padLCD(str) {
  return str.substring(0, 16).padEnd(16, ' ');
}

function setLCD(row1, row2) {
  document.getElementById('lcdRow1').textContent = row1;
  document.getElementById('lcdRow2').textContent = row2;
}

function printSerialData() {
  if (!simState.hasFix) return;
  serialPrint(`Lat: ${simState.lat.toFixed(6)}  Lon: ${simState.lng.toFixed(6)}`);
  serialPrint(`Speed: ${simState.speed.toFixed(1)} km/h  Alt: ${simState.alt.toFixed(1)} m`);
  serialPrint(`Satellites: ${simState.sats}  HDOP: 1.2`);
  serialPrint('-------------------------');
}

function serialPrint(text) {
  const output = document.getElementById('serialOutput');
  const timestamp = new Date().toLocaleTimeString();
  output.textContent += `[${timestamp}] ${text}\n`;
  output.scrollTop = output.scrollHeight;
}

function drawMap() {
  const canvas = document.getElementById('mapCanvas');
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
  ctx.strokeStyle = '#00b4d855';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 15, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 30, 0, Math.PI * 2);
  ctx.stroke();

  document.getElementById('mapCoords').textContent = `${simState.lat.toFixed(4)}, ${simState.lng.toFixed(4)}`;
}

function updateMap() {
  const canvas = document.getElementById('mapCanvas');
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = '#0d1a2a';
  ctx.fillRect(0, 0, w, h);

  drawGrid(ctx, w, h);

  const cx = w / 2;
  const cy = h / 2;

  if (simState.trail.length > 1) {
    const latCenter = simState.lat;
    const lngCenter = simState.lng;
    const scale = 20000;

    ctx.beginPath();
    ctx.strokeStyle = '#00b4d866';
    ctx.lineWidth = 2;

    for (let i = 0; i < simState.trail.length; i++) {
      const px = cx + (simState.trail[i].lng - lngCenter) * scale;
      const py = cy - (simState.trail[i].lat - latCenter) * scale;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    for (let i = 0; i < simState.trail.length; i++) {
      const px = cx + (simState.trail[i].lng - lngCenter) * scale;
      const py = cy - (simState.trail[i].lat - latCenter) * scale;
      const alpha = (i / simState.trail.length) * 0.5;
      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 180, 216, ${alpha})`;
      ctx.fill();
    }
  }

  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#00e676';
  ctx.fill();
  ctx.shadowColor = '#00e676';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = '#00e67644';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, 18, 0, Math.PI * 2);
  ctx.stroke();

  if (simState.speed > 1) {
    const angle = Math.atan2(
      simState.trail.length > 1 ? simState.trail[simState.trail.length - 1].lat - simState.trail[simState.trail.length - 2].lat : 0,
      simState.trail.length > 1 ? simState.trail[simState.trail.length - 1].lng - simState.trail[simState.trail.length - 2].lng : 0
    );
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-angle + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(-5, -8);
    ctx.lineTo(5, -8);
    ctx.closePath();
    ctx.fillStyle = '#ffd60a';
    ctx.fill();
    ctx.restore();
  }

  ctx.fillStyle = '#7b8794';
  ctx.font = '11px monospace';
  ctx.fillText(`${simState.lat.toFixed(6)}N`, 10, 20);
  ctx.fillText(`${Math.abs(simState.lng).toFixed(6)}${simState.lng < 0 ? 'W' : 'E'}`, 10, 35);
  ctx.fillText(`${simState.speed.toFixed(1)} km/h`, 10, h - 15);
  ctx.fillText(`${simState.sats} sats`, w - 60, 20);

  document.getElementById('mapCoords').textContent = `${simState.lat.toFixed(4)}, ${simState.lng.toFixed(4)}`;
}

function drawGrid(ctx, w, h) {
  ctx.strokeStyle = '#1a2a3a';
  ctx.lineWidth = 0.5;
  for (let x = 0; x < w; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  ctx.strokeStyle = '#2a3a4a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.lineTo(w / 2, h);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();
}

function initCodeViewer() {
  const codeEl = document.getElementById('arduinoCode');
  codeEl.innerHTML = highlightArduino(arduinoCode);

  document.getElementById('btnCopy').addEventListener('click', () => {
    navigator.clipboard.writeText(arduinoCode).then(() => {
      const btn = document.getElementById('btnCopy');
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = 'Copy Code', 2000);
    });
  });
}

function highlightArduino(code) {
  let html = escapeHtml(code);

  html = html.replace(/(\/\/.*)/g, '<span class="cmt">$1</span>');
  html = html.replace(/(#include\s*&lt;[^&]*&gt;)/g, '<span class="pp">$1</span>');

  const keywords = ['void', 'int', 'float', 'double', 'char', 'byte', 'static', 'const', 'unsigned', 'long', 'if', 'else', 'switch', 'case', 'break', 'return', 'for', 'while', 'true', 'false'];
  keywords.forEach(kw => {
    const re = new RegExp(`\\b(${kw})\\b`, 'g');
    html = html.replace(re, '<span class="kw">$1</span>');
  });

  html = html.replace(/\b(\d+\.?\d*)\b/g, '<span class="num">$1</span>');
  html = html.replace(/(F?\(&quot;[^&]*&quot;\))/g, '<span class="str">$1</span>');
  html = html.replace(/(&quot;[^&]*&quot;)/g, '<span class="str">$1</span>');

  return html;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function initWiringDiagram() {
  setTimeout(drawWiringDiagram, 200);
}

function drawWiringDiagram() {
  const canvas = document.getElementById('wiringCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = '#0d1a2a';
  ctx.fillRect(0, 0, w, h);

  drawArduinoBoard(ctx, 300, 80, 200, 340);
  drawGPSModule(ctx, 50, 120, 180, 140);
  drawLCDModule(ctx, 570, 120, 190, 120);

  drawWire(ctx, 230, 165, 300, 200, '#e63946', 'VCC - 5V');
  drawWire(ctx, 230, 185, 300, 240, '#666', 'GND');
  drawWire(ctx, 230, 205, 300, 280, '#00e676', 'TX - D4');
  drawWire(ctx, 230, 225, 300, 310, '#ffd60a', 'RX - D3');

  drawWire(ctx, 500, 200, 570, 165, '#e63946', '5V - VCC');
  drawWire(ctx, 500, 240, 570, 185, '#666', 'GND');
  drawWire(ctx, 500, 360, 570, 205, '#00b4d8', 'A4 - SDA');
  drawWire(ctx, 500, 380, 570, 225, '#ff9800', 'A5 - SCL');

  ctx.fillStyle = '#7b8794';
  ctx.font = '12px sans-serif';
  ctx.fillText('Wire connections shown with labels', w / 2 - 120, h - 20);
}

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
  ctx.fillText('ARDUINO', x + w / 2, y + 25);
  ctx.fillText('UNO R3', x + w / 2, y + 42);
  ctx.textAlign = 'left';

  ctx.fillStyle = '#333';
  ctx.fillRect(x + 60, y - 10, 40, 15);
  ctx.fillStyle = '#888';
  ctx.fillRect(x + 63, y - 8, 34, 11);
  ctx.fillStyle = '#7b8794';
  ctx.font = '9px monospace';
  ctx.fillText('USB', x + 68, y);

  const pins = ['5V', 'GND', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'];
  pins.forEach((pin, i) => {
    const py = y + 70 + i * 30;
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(x - 5, py - 4, 10, 8);
    ctx.fillStyle = '#ccc';
    ctx.font = '10px monospace';
    ctx.fillText(pin, x + 10, py + 3);
  });

  const rightPins = ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', '5V', 'GND'];
  rightPins.forEach((pin, i) => {
    const py = y + 70 + i * 30;
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(x + w - 5, py - 4, 10, 8);
    ctx.fillStyle = '#ccc';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(pin, x + w - 12, py + 3);
    ctx.textAlign = 'left';
  });

  ctx.fillStyle = '#111';
  roundRect(ctx, x + 70, y + 260, 60, 60, 4);
  ctx.fill();
  ctx.fillStyle = '#333';
  roundRect(ctx, x + 75, y + 265, 50, 50, 2);
  ctx.fill();
  ctx.fillStyle = '#888';
  ctx.font = '8px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ATmega328P', x + 100, y + 295);
  ctx.textAlign = 'left';
}

function drawGPSModule(ctx, x, y, w, h) {
  ctx.fillStyle = '#1a4a1a';
  ctx.strokeStyle = '#2a6a2a';
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('NEO-6M GPS', x + w / 2, y + 20);
  ctx.textAlign = 'left';

  ctx.fillStyle = '#2a5a2a';
  ctx.fillRect(x + 20, y + 30, 60, 60);
  ctx.strokeStyle = '#4a8a4a';
  ctx.strokeRect(x + 20, y + 30, 60, 60);
  ctx.fillStyle = '#8a8a8a';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ANTENNA', x + 50, y + 65);
  ctx.textAlign = 'left';

  ctx.fillStyle = '#e63946';
  ctx.beginPath();
  ctx.arc(x + w - 25, y + 55, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ccc';
  ctx.font = '8px sans-serif';
  ctx.fillText('LED', x + w - 35, y + 75);

  const gpsPins = ['VCC', 'GND', 'TX', 'RX'];
  gpsPins.forEach((pin, i) => {
    const py = y + 105 + i * 0;
    const px = x + w - 5;
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(px, y + 45 + i * 20, 10, 6);
    ctx.fillStyle = '#ccc';
    ctx.font = '9px monospace';
    ctx.fillText(pin, px - 25, y + 52 + i * 20);
  });
}

function drawLCDModule(ctx, x, y, w, h) {
  ctx.fillStyle = '#1a1a4a';
  ctx.strokeStyle = '#3a3a8a';
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#1a3a1a';
  ctx.fillRect(x + 15, y + 15, w - 30, 50);
  ctx.strokeStyle = '#4a4a4a';
  ctx.strokeRect(x + 15, y + 15, w - 30, 50);
  ctx.fillStyle = '#33ff33';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('16x2 LCD', x + w / 2, y + 38);
  ctx.fillText('I2C DISPLAY', x + w / 2, y + 52);
  ctx.textAlign = 'left';

  ctx.fillStyle = '#222';
  ctx.fillRect(x + 30, y + 80, 50, 30);
  ctx.fillStyle = '#888';
  ctx.font = '8px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('I2C', x + 55, y + 95);
  ctx.fillText('Adapter', x + 55, y + 105);
  ctx.textAlign = 'left';

  const lcdPins = ['VCC', 'GND', 'SDA', 'SCL'];
  lcdPins.forEach((pin, i) => {
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(x - 5, y + 45 + i * 20, 10, 6);
    ctx.fillStyle = '#ccc';
    ctx.font = '9px monospace';
    ctx.fillText(pin, x + 8, y + 52 + i * 20);
  });
}

function drawWire(ctx, x1, y1, x2, y2, color, label) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  const midX = (x1 + x2) / 2;
  ctx.bezierCurveTo(midX, y1, midX, y2, x2, y2);
  ctx.stroke();

  const lx = (x1 + x2) / 2;
  const ly = (y1 + y2) / 2 - 8;
  ctx.fillStyle = '#0d1a2a';
  ctx.font = '9px sans-serif';
  const tw = ctx.measureText(label).width;
  ctx.fillRect(lx - tw / 2 - 3, ly - 8, tw + 6, 12);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(label, lx, ly);
  ctx.textAlign = 'left';
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
