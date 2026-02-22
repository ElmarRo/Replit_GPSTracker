# Arduino GPS Tracker with LCD Display

## Overview
An interactive web-based Arduino GPS Tracker simulator and project reference. Users can simulate GPS operations, view the complete Arduino sketch, and reference wiring diagrams for building a real hardware project.

## Project Architecture
- **server.js** - Express server serving static files on port 5000
- **public/index.html** - Main HTML with three tabs: Simulator, Arduino Code, Wiring & Components
- **public/styles.css** - Dark-themed styling for the entire application
- **public/app.js** - Simulator logic, map rendering, LCD emulation, wiring diagram canvas, code viewer

## Features
- Interactive GPS simulator with LCD display emulation (green-on-dark, 16x2 characters)
- GPS position map with trail visualization on canvas
- SD card data logging simulation (CSV format)
- Serial monitor output simulation
- Route simulation with moving position
- Complete Arduino sketch (TinyGPSPlus + LiquidCrystal_I2C + SoftwareSerial + SD)
- Canvas-drawn wiring diagram showing Arduino UNO, NEO-6M GPS, 16x2 LCD I2C, and SD Module connections
- Component list and connection table

## Tech Stack
- Node.js 20 + Express
- Vanilla HTML/CSS/JS (no frameworks)
- Canvas API for map and wiring diagram rendering
