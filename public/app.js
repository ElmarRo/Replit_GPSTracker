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

TinyGPSPlus gps;
SoftwareSerial gpsSerial(RXPin, TXPin);
LiquidCrystal_I2C lcd(0x27, 16, 2);
RTC_DS3231 rtc;

bool sdActive = false;
bool rtcActive = false;
unsigned long lastLog = 0;

void setup() {
  Serial.begin(9600);
  gpsSerial.begin(GPSBaud);

  lcd.init();
  lcd.backlight();
  lcd.print("GPS Logger v1.2");

  if (!SD.begin(chipSelect)) {
    Serial.println("SD Fail");
  } else {
    sdActive = true;
    if (!SD.exists("gpslog.csv")) {
      File dataFile = SD.open("gpslog.csv", FILE_WRITE);
      if (dataFile) {
        dataFile.println("Timestamp,Lat,Lon,Sats");
        dataFile.close();
      }
    }
  }

  if (!rtc.begin()) {
    Serial.println("RTC Fail");
  } else {
    rtcActive = true;
  }
  
  delay(2000);
  lcd.clear();
}

void loop() {
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }

  if (gps.location.isValid()) {
    // Update LCD
    lcd.setCursor(0, 0);
    lcd.print("Sats: ");
    lcd.print(gps.satellites.value());
    lcd.print("    "); // Clear trailing chars

    lcd.setCursor(0, 1);
    lcd.print("Pos: ");
    lcd.print(gps.location.lat(), 4);
    lcd.print(",");
    lcd.print(gps.location.lng(), 4);

    // Log every 5 seconds
    if (millis() - lastLog >= 5000) {
      lastLog = millis();
      logToSD();
    }
  } else {
    lcd.setCursor(0, 0);
    lcd.print("Searching GPS...");
    lcd.setCursor(0, 1);
    lcd.print("Sats: ");
    lcd.print(gps.satellites.value());
  }
}

void logToSD() {
  if (!sdActive) return;

  File dataFile = SD.open("gpslog.csv", FILE_WRITE);
  if (dataFile) {
    if (rtcActive) {
      DateTime now = rtc.now();
      dataFile.print(now.timestamp());
    } else {
      dataFile.print(millis());
    }
    dataFile.print(",");
    dataFile.print(gps.location.lat(), 6);
    dataFile.print(",");
    dataFile.print(gps.location.lng(), 6);
    dataFile.print(",");
    dataFile.println(gps.satellites.value());
    dataFile.close();
    Serial.println("Logged position");
  }
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
        c.style.display = 'none';
      });

      tab.classList.add('active');
      const targetContent = document.getElementById(targetId);
      if (targetContent) {
        targetContent.classList.add('active');
        targetContent.style.display = 'block';
        
        // Explicitly trigger wiring diagram redraw when tab becomes visible
        if (targetId === 'wiring') {
          console.log('Wiring tab active, drawing diagram...');
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

  const fixInterval = setInterval(() => {
    satBuild++;
    const currentSats = Math.min(satBuild, targetSats);
    
    const satCountLabel = document.getElementById('satCount');
    if (satCountLabel) satCountLabel.textContent = currentSats;
    
    const simSatsRange = document.getElementById('simSats');
    if (simSatsRange) simSatsRange.value = currentSats;
    
    const simSatsValLabel = document.getElementById('simSatsVal');
    if (simSatsValLabel) simSatsValLabel.textContent = currentSats;

    setLCD('Searching GPS...', "Sats: " + currentSats);

    if (currentSats >= 3 && satBuild >= 4) {
      clearInterval(fixInterval);
      simState.hasFix = true;
      simState.sats = targetSats;
      
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

function resetSim() {
  location.reload();
}

function updateLCD() {
  const lat = simState.lat;
  const lng = simState.lng;
  const sats = simState.sats;

  const row1 = "Sats: " + sats;
  const row2 = "Pos: " + lat.toFixed(4) + "," + lng.toFixed(4);

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
  // Initial draw attempt
  setTimeout(drawWiringDiagram, 500);
  
  // Also draw when the window is resized
  window.addEventListener('resize', () => {
    if (document.getElementById('wiring').classList.contains('active')) {
      drawWiringDiagram();
    }
  });
}

function drawWiringDiagram() {
  const canvas = document.getElementById('wiringCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = '#0d1a2a';
  ctx.fillRect(0, 0, w, h);
  drawArduinoBoard(ctx, 300, 50, 200, 340);
  drawGPSModule(ctx, 50, 50, 180, 140);
  drawLCDModule(ctx, 570, 50, 190, 120);
  drawSDModule(ctx, 570, 200, 190, 140);
  drawRTCModule(ctx, 50, 230, 180, 120);
}

function drawRTCModule(ctx, x, y, w, h) {
  ctx.fillStyle = '#1a1a4a';
  ctx.strokeStyle = '#3a3a8a';
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('DS3231 RTC', x + w / 2, y + 20);
  ctx.textAlign = 'left';
  const pins = ['VCC', 'GND', 'SDA', 'SCL'];
  pins.forEach((pin, i) => {
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(x + w - 5, y + 40 + i * 20, 10, 6);
    ctx.fillStyle = '#ccc';
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(pin, x + w - 12, y + 47 + i * 20);
    ctx.textAlign = 'left';
  });
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
  ctx.fillText('ARDUINO UNO', x + w / 2, y + 25);
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
}

function drawLCDModule(ctx, x, y, w, h) {
  ctx.fillStyle = '#1a1a4a';
  ctx.strokeStyle = '#3a3a8a';
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#33ff33';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('16x2 LCD I2C', x + w / 2, y + 60);
}

function drawSDModule(ctx, x, y, w, h) {
  ctx.fillStyle = '#1a1a1a';
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SD MODULE', x + w / 2, y + 20);
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
