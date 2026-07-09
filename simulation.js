// Physics & Scale Settings
const G = 0.15; // Gravitational constant scaled for screen dimensions
const DEFAULT_SUN_MASS = 10000;
const DEFAULT_SUN_RADIUS = 22;
const EARTH_MASS_FOR_MOON = 80;

let sunMassMultiplier = 1.0;
let simSpeed = 1.0;
let isPaused = false;
let activeMode = 'pan'; // 'pan' or 'launch'

// Zoom and Pan offsets
let offsetX = 0;
let offsetY = 0;
let zoom = 0.95;
let isDragging = false;
let startDragX = 0;
let startDragY = 0;

// Slingshot Planet Launcher State
let isDrawingSlingshot = false;
let slingshotStart = { x: 0, y: 0 };
let slingshotEnd = { x: 0, y: 0 };
let customPlanetsCount = 1;

// Web Audio API State
let audioCtx = null;
let isMuted = true;
let ambientOscs = [];
let ambientGain = null;

// DOM Elements
const simCanvas = document.getElementById('simulationCanvas');
const simCtx = simCanvas.getContext('2d');

const starsCanvas = document.getElementById('starsCanvas');
const starsCtx = starsCanvas.getContext('2d');

const sunMassSlider = document.getElementById('sunMassSlider');
const sunMassValue = document.getElementById('sunMassValue');
const simSpeedSlider = document.getElementById('simSpeedSlider');
const simSpeedValue = document.getElementById('simSpeedValue');

const btnPlayPause = document.getElementById('btnPlayPause');
const btnReset = document.getElementById('btnReset');
const btnClearTrails = document.getElementById('btnClearTrails');
const alertOverlay = document.getElementById('alertOverlay');
const planetStatsBody = document.getElementById('planetStatsBody');

const btnToggleAudio = document.getElementById('btnToggleAudio');
const dashboardToggle = document.getElementById('dashboardToggle');
const mainDashboard = document.getElementById('mainDashboard');

const modePan = document.getElementById('modePan');
const modeLaunch = document.getElementById('modeLaunch');

// Presets
const presets = {
    presetNormal: 1.0,
    presetHeavy: 3.5,
    presetSupernova: 8.0,
    presetLight: 0.25,
    presetZero: 0.0
};

// Planet templates (static orbital definitions)
const planetTemplates = [
    { id: 'mercury', name: 'Mercury', distance: 60, radius: 3.5, color: '#9e9e9e' },
    { id: 'venus', name: 'Venus', distance: 95, radius: 6.0, color: '#e29b3e' },
    { id: 'earth', name: 'Earth', distance: 135, radius: 6.8, color: '#3a86c8', hasMoon: true },
    { id: 'mars', name: 'Mars', distance: 180, radius: 4.8, color: '#e55039' },
    { id: 'jupiter', name: 'Jupiter', distance: 245, radius: 14.0, color: '#d4a373' },
    { id: 'saturn', name: 'Saturn', distance: 315, radius: 11.0, color: '#eddcd2', hasRings: true },
    { id: 'uranus', name: 'Uranus', distance: 380, radius: 8.5, color: '#a8dadc' },
    { id: 'neptune', name: 'Neptune', distance: 440, radius: 8.0, color: '#457b9d' }
];

// Objects
let sun = {
    x: 0,
    y: 0,
    mass: DEFAULT_SUN_MASS,
    radius: DEFAULT_SUN_RADIUS,
    color: '#ffcc00'
};

let planets = [];
let asteroids = [];
let stars = [];
let moon = null;

// Audio Synthesizer Engine
function initAudio() {
    if (audioCtx) return;
    
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();
        
        // Master Gain
        ambientGain = audioCtx.createGain();
        ambientGain.gain.setValueAtTime(0.0, audioCtx.currentTime); // Start silent
        ambientGain.connect(audioCtx.destination);
        
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(250, audioCtx.currentTime);
        filter.connect(ambientGain);
        
        // Multi-oscillator space chord (C2, G2, C3, Eb3 - Minor Cosmic drone)
        const frequencies = [65.41, 98.00, 130.81, 155.56];
        frequencies.forEach(freq => {
            const osc = audioCtx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            
            const oscGain = audioCtx.createGain();
            oscGain.gain.setValueAtTime(0.2, audioCtx.currentTime);
            
            osc.connect(oscGain);
            oscGain.connect(filter);
            osc.start();
            ambientOscs.push(osc);
        });
        
        // Very slow LFO modulating filter frequency
        const lfo = audioCtx.createOscillator();
        lfo.frequency.setValueAtTime(0.05, audioCtx.currentTime); 
        
        const lfoGain = audioCtx.createGain();
        lfoGain.gain.setValueAtTime(100, audioCtx.currentTime);
        
        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);
        lfo.start();
        
        // Smoothly fade in ambient drone
        if (!isMuted) {
            ambientGain.gain.linearRampToValueAtTime(0.04, audioCtx.currentTime + 1.5);
        }
    } catch (e) {
        console.warn("Failed to initialize Web Audio API", e);
    }
}

function toggleAudio() {
    isMuted = !isMuted;
    
    if (!audioCtx) {
        initAudio();
    }
    
    if (isMuted) {
        btnToggleAudio.textContent = '🔇 Sound: Off';
        btnToggleAudio.classList.remove('active');
        if (ambientGain) {
            ambientGain.gain.linearRampToValueAtTime(0.0, audioCtx.currentTime + 0.3);
        }
    } else {
        btnToggleAudio.textContent = '🔊 Sound: On';
        btnToggleAudio.classList.add('active');
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        if (ambientGain) {
            ambientGain.gain.linearRampToValueAtTime(0.04, audioCtx.currentTime + 0.5);
        }
    }
}

function playLaunchSound() {
    if (!audioCtx || isMuted) return;
    
    try {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(120, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(650, audioCtx.currentTime + 0.3);
        
        gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc.start();
        osc.stop(audioCtx.currentTime + 0.35);
    } catch (e) {}
}

function playCollisionSound() {
    if (!audioCtx || isMuted) return;
    
    try {
        // Noise blast synthesizer
        const bufferSize = audioCtx.sampleRate * 1.2;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        
        const noiseNode = audioCtx.createBufferSource();
        noiseNode.buffer = buffer;
        
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(350, audioCtx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(10, audioCtx.currentTime + 0.85);
        
        const gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(0.35, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.85);
        
        noiseNode.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        noiseNode.start();
    } catch (e) {}
}

// Background Twinkling Stars
function initStars() {
    stars = [];
    const starCount = 150;
    for (let i = 0; i < starCount; i++) {
        stars.push({
            x: Math.random() * starsCanvas.width,
            y: Math.random() * starsCanvas.height,
            size: Math.random() * 1.5 + 0.5,
            opacity: Math.random(),
            twinkleSpeed: 0.005 + Math.random() * 0.015,
            dx: (Math.random() - 0.5) * 0.05,
            dy: (Math.random() - 0.5) * 0.05
        });
    }
}

function drawStars() {
    starsCtx.fillStyle = '#020208';
    starsCtx.fillRect(0, 0, starsCanvas.width, starsCanvas.height);

    for (let star of stars) {
        star.opacity += star.twinkleSpeed;
        if (star.opacity > 1 || star.opacity < 0.1) {
            star.twinkleSpeed = -star.twinkleSpeed;
        }

        star.x += star.dx;
        star.y += star.dy;

        if (star.x < 0) star.x = starsCanvas.width;
        if (star.x > starsCanvas.width) star.x = 0;
        if (star.y < 0) star.y = starsCanvas.height;
        if (star.y > starsCanvas.height) star.y = 0;

        starsCtx.fillStyle = `rgba(255, 255, 255, ${Math.abs(star.opacity)})`;
        starsCtx.beginPath();
        starsCtx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        starsCtx.fill();
    }
}

// Float Alerts
function showAlert(message, type = 'warning') {
    const bubble = document.createElement('div');
    bubble.className = `alert-bubble alert-bubble-${type}`;
    
    let emoji = '⚠️';
    if (type === 'success') emoji = '🚀';
    if (type === 'danger') emoji = '💥';
    
    bubble.innerHTML = `<span>${emoji}</span> <span>${message}</span>`;
    alertOverlay.appendChild(bubble);

    setTimeout(() => {
        bubble.remove();
    }, 5000);
}

// Orbit calculations
function getCircularOrbitVelocity(r, M) {
    return Math.sqrt((G * M) / r);
}

// Reset/Initialize simulation
function initPlanets() {
    planets = [];
    asteroids = [];
    const sunMass = DEFAULT_SUN_MASS * sunMassMultiplier;

    // Load planets
    planetTemplates.forEach(template => {
        const r = template.distance;
        const v = getCircularOrbitVelocity(r, sunMass);

        planets.push({
            id: template.id,
            name: template.name,
            x: r,
            y: 0,
            vx: 0,
            vy: -v,
            radius: template.radius,
            color: template.color,
            hasRings: template.hasRings || false,
            trail: [],
            status: 'stable',
            hasMoon: template.hasMoon || false
        });
    });

    // Initialize Moon
    moon = {
        rx: 16, // Relative distance offset from Earth
        ry: 0,
        rvx: 0,
        rvy: -getCircularOrbitVelocity(16, EARTH_MASS_FOR_MOON),
        radius: 1.5,
        color: '#d3d3d3',
        name: 'Moon',
        trail: [],
        status: 'stable'
    };

    // Load Asteroids (Orbiting in belt between Mars and Jupiter)
    const asteroidCount = 150;
    for (let i = 0; i < asteroidCount; i++) {
        const r = 195 + Math.random() * 32;
        const theta = Math.random() * Math.PI * 2;
        const v = getCircularOrbitVelocity(r, sunMass);
        
        asteroids.push({
            x: r * Math.cos(theta),
            y: r * Math.sin(theta),
            vx: -v * Math.sin(theta),
            vy: v * Math.cos(theta),
            radius: 0.8 + Math.random() * 0.9,
            color: 'rgba(160, 160, 180, 0.55)'
        });
    }
}

// UI Event Listeners
sunMassSlider.addEventListener('input', (e) => {
    sunMassMultiplier = parseFloat(e.target.value);
    sunMassValue.textContent = `${sunMassMultiplier.toFixed(2)}x`;
    sun.mass = DEFAULT_SUN_MASS * sunMassMultiplier;
    sun.radius = DEFAULT_SUN_RADIUS * Math.max(0.4, Math.cbrt(sunMassMultiplier));
});

simSpeedSlider.addEventListener('input', (e) => {
    simSpeed = parseFloat(e.target.value);
    simSpeedValue.textContent = `${simSpeed.toFixed(1)}x`;
});

btnPlayPause.addEventListener('click', () => {
    isPaused = !isPaused;
    btnPlayPause.textContent = isPaused ? 'Resume Sim' : 'Pause Sim';
    btnPlayPause.style.background = isPaused 
        ? 'linear-gradient(135deg, #00b4d8, #0077b6)' 
        : 'linear-gradient(135deg, var(--primary-color), #b5179e)';
});

btnReset.addEventListener('click', () => {
    sunMassMultiplier = 1.0;
    sunMassSlider.value = 1.0;
    sunMassValue.textContent = '1.00x';
    sun.mass = DEFAULT_SUN_MASS;
    sun.radius = DEFAULT_SUN_RADIUS;

    simSpeed = 1.0;
    simSpeedSlider.value = 1.0;
    simSpeedValue.textContent = '1.0x';

    isPaused = false;
    btnPlayPause.textContent = 'Pause Sim';
    btnPlayPause.style.background = 'linear-gradient(135deg, var(--primary-color), #b5179e)';

    offsetX = 0;
    offsetY = 0;
    zoom = 0.95;
    
    customPlanetsCount = 1;
    initPlanets();
    showAlert('Solar System reset to stable configuration.', 'success');
});

btnClearTrails.addEventListener('click', () => {
    planets.forEach(p => p.trail = []);
    if (moon) moon.trail = [];
});

btnToggleAudio.addEventListener('click', toggleAudio);

// Presets
Object.keys(presets).forEach(presetId => {
    const btn = document.getElementById(presetId);
    if (btn) {
        btn.addEventListener('click', () => {
            const val = presets[presetId];
            sunMassSlider.value = val;
            sunMassSlider.dispatchEvent(new Event('input'));
            showAlert(`Solar Mass set to ${val}x.`, 'info');
        });
    }
});

// Mode Toggles
modePan.addEventListener('click', () => {
    activeMode = 'pan';
    modePan.classList.add('active');
    modeLaunch.classList.remove('active');
    isDrawingSlingshot = false;
});

modeLaunch.addEventListener('click', () => {
    activeMode = 'launch';
    modeLaunch.classList.add('active');
    modePan.classList.remove('active');
});

// Mobile settings overlay toggle
dashboardToggle.addEventListener('click', () => {
    mainDashboard.classList.toggle('collapsed');
});

// Convert Screen coordinates to World coordinates
function getSimCoordinates(clientX, clientY) {
    const rect = simCanvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    return {
        x: (x - simCanvas.width / 2 - offsetX) / zoom,
        y: (y - simCanvas.height / 2 - offsetY) / zoom
    };
}

// Mouse / Touch Interaction Controls
function handleStart(clientX, clientY) {
    // If clicking the dashboard controls, ignore
    if (mainDashboard.contains(document.elementFromPoint(clientX, clientY)) ||
        dashboardToggle.contains(document.elementFromPoint(clientX, clientY))) {
        return;
    }

    if (!audioCtx) {
        initAudio(); // Initialize audio on first click
    }

    if (activeMode === 'pan') {
        isDragging = true;
        startDragX = clientX - offsetX;
        startDragY = clientY - offsetY;
    } else if (activeMode === 'launch') {
        isDrawingSlingshot = true;
        slingshotStart = { x: clientX, y: clientY };
        slingshotEnd = { x: clientX, y: clientY };
    }
}

function handleMove(clientX, clientY) {
    if (isDragging && activeMode === 'pan') {
        offsetX = clientX - startDragX;
        offsetY = clientY - startDragY;
    } else if (isDrawingSlingshot && activeMode === 'launch') {
        slingshotEnd = { x: clientX, y: clientY };
    }
}

function handleEnd() {
    if (isDragging) {
        isDragging = false;
    }

    if (isDrawingSlingshot) {
        isDrawingSlingshot = false;
        
        const dx = slingshotStart.x - slingshotEnd.x;
        const dy = slingshotStart.y - slingshotEnd.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Only launch if user dragged enough to create a velocity vector
        if (dist > 12) {
            const worldCoords = getSimCoordinates(slingshotStart.x, slingshotStart.y);
            
            // Scaled launcher force
            const speedMultiplier = 0.045 / zoom;
            const vx = dx * speedMultiplier;
            const vy = dy * speedMultiplier;

            const size = 4.5 + Math.random() * 5.0;
            const hue = Math.floor(Math.random() * 360);
            
            const customPlanet = {
                id: `custom_${Date.now()}`,
                name: `Custom #${customPlanetsCount++}`,
                x: worldCoords.x,
                y: worldCoords.y,
                vx: vx,
                vy: vy,
                radius: size,
                color: `hsl(${hue}, 85%, 65%)`,
                trail: [],
                status: 'stable',
                isCustom: true
            };

            planets.push(customPlanet);
            playLaunchSound();
            showAlert(`Launched ${customPlanet.name}!`, 'success');
        }
    }
}

// Mouse Listeners
simCanvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { // Left click
        handleStart(e.clientX, e.clientY);
    } else if (e.button === 1 || e.button === 2) { // Middle or Right click to Pan override
        isDragging = true;
        startDragX = e.clientX - offsetX;
        startDragY = e.clientY - offsetY;
    }
});

window.addEventListener('mousemove', (e) => {
    handleMove(e.clientX, e.clientY);
});

window.addEventListener('mouseup', handleEnd);

// Touch Listeners (Mobile Panning & Slingshot)
let touchStartDist = 0;
let initialTouchZoom = 1.0;
let initialTouchOffset = { x: 0, y: 0 };

simCanvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
        // Single finger handles Launcher or Panning
        handleStart(e.touches[0].clientX, e.touches[0].clientY);
    } else if (e.touches.length === 2) {
        // Two fingers handles Pinch Zooming & Panning
        isDrawingSlingshot = false; // Cancel launch
        isDragging = false;
        
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        touchStartDist = Math.sqrt(dx * dx + dy * dy);
        
        initialTouchZoom = zoom;
        initialTouchOffset = { x: offsetX, y: offsetY };
        
        startDragX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - offsetX;
        startDragY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - offsetY;
    }
});

simCanvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
    } else if (e.touches.length === 2) {
        // Two finger pinch to zoom
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        const ratio = dist / touchStartDist;
        zoom = Math.max(0.15, Math.min(initialTouchZoom * ratio, 5.0));

        // Two finger drag to pan
        const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        offsetX = centerX - startDragX;
        offsetY = centerY - startDragY;
    }
});

simCanvas.addEventListener('touchend', handleEnd);

// Wheel Zoom
simCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomIntensity = 0.06;
    const mouseX = e.clientX - simCanvas.width / 2;
    const mouseY = e.clientY - simCanvas.height / 2;

    const oldZoom = zoom;
    if (e.deltaY < 0) {
        zoom = Math.min(zoom * (1 + zoomIntensity), 5.0);
    } else {
        zoom = Math.max(zoom * (1 - zoomIntensity), 0.15);
    }

    offsetX -= mouseX / oldZoom - mouseX / zoom;
    offsetY -= mouseY / oldZoom - mouseY / zoom;
});

// Disable Right-Click Menu on Canvas to allow right-click panning
simCanvas.addEventListener('contextmenu', e => e.preventDefault());

// Window resize
function resizeCanvases() {
    starsCanvas.width = window.innerWidth;
    starsCanvas.height = window.innerHeight;
    simCanvas.width = window.innerWidth;
    simCanvas.height = window.innerHeight;
    initStars();
}

window.addEventListener('resize', resizeCanvases);

// Physics Engine Updates
let frameCounter = 0;

function updatePhysics() {
    if (isPaused) return;

    const substeps = 4;
    const dt = (0.12 * simSpeed) / substeps;

    for (let step = 0; step < substeps; step++) {
        // 1. Update Planets
        planets.forEach(planet => {
            if (planet.status !== 'stable') return;

            const dx = sun.x - planet.x;
            const dy = sun.y - planet.y;
            const r = Math.sqrt(dx * dx + dy * dy);

            // Crash detection
            if (r < sun.radius + planet.radius) {
                planet.status = 'collided';
                planet.vx = 0;
                planet.vy = 0;
                playCollisionSound();
                showAlert(`${planet.name} collided with the Sun and was incinerated!`, 'danger');
                return;
            }

            // Escape detection
            if (r > 2000) {
                planet.status = 'escaped';
                showAlert(`${planet.name} escaped the solar gravity into deep space!`, 'warning');
                return;
            }

            // Newtonian gravity
            const force = (G * sun.mass) / (r * r);
            planet.vx += force * (dx / r) * dt;
            planet.vy += force * (dy / r) * dt;
            planet.x += planet.vx * dt;
            planet.y += planet.vy * dt;
        });

        // 2. Update Earth's Moon (relative orbit simulation)
        if (moon && moon.status === 'stable') {
            const earth = planets.find(p => p.id === 'earth');
            
            if (earth && earth.status === 'stable') {
                // Gravity on moon from Earth
                const mr = Math.sqrt(moon.rx * moon.rx + moon.ry * moon.ry);
                
                if (mr < earth.radius + moon.radius) {
                    moon.status = 'collided';
                    playCollisionSound();
                    showAlert(`The Moon crashed into the Earth!`, 'danger');
                } else {
                    const localForce = (G * EARTH_MASS_FOR_MOON) / (mr * mr);
                    
                    moon.rvx -= localForce * (moon.rx / mr) * dt;
                    moon.rvy -= localForce * (moon.ry / mr) * dt;
                    
                    moon.rx += moon.rvx * dt;
                    moon.ry += moon.rvy * dt;

                    // Absolute coordinates
                    moon.x = earth.x + moon.rx;
                    moon.y = earth.y + moon.ry;
                }
            } else {
                // If Earth is destroyed or escaped, the Moon is pulled by the Sun's gravity directly
                const dx = sun.x - moon.x;
                const dy = sun.y - moon.y;
                const r = Math.sqrt(dx * dx + dy * dy);

                if (r < sun.radius + moon.radius) {
                    moon.status = 'collided';
                    playCollisionSound();
                    showAlert(`The Moon crashed into the Sun!`, 'danger');
                } else if (r > 2000) {
                    moon.status = 'escaped';
                } else {
                    const force = (G * sun.mass) / (r * r);
                    const absoluteVx = (earth ? earth.vx : 0) + moon.rvx;
                    const absoluteVy = (earth ? earth.vy : 0) + moon.rvy;
                    
                    const ax = force * (dx / r);
                    const ay = force * (dy / r);

                    const newAbsoluteVx = absoluteVx + ax * dt;
                    const newAbsoluteVy = absoluteVy + ay * dt;

                    moon.x += newAbsoluteVx * dt;
                    moon.y += newAbsoluteVy * dt;

                    // Store speed back into relative space just to keep properties
                    moon.rvx = newAbsoluteVx;
                    moon.rvy = newAbsoluteVy;
                }
            }
        }

        // 3. Update Asteroid Belt Particles
        asteroids.forEach(ast => {
            const dx = sun.x - ast.x;
            const dy = sun.y - ast.y;
            const r = Math.sqrt(dx * dx + dy * dy);
            
            if (r < sun.radius) {
                // Disappear into Sun
                ast.x = 999999;
                ast.y = 999999;
                return;
            }

            const force = (G * sun.mass) / (r * r);
            ast.vx += force * (dx / r) * dt;
            ast.vy += force * (dy / r) * dt;
            ast.x += ast.vx * dt;
            ast.y += ast.vy * dt;
        });
    }

    // Add Trails periodically
    if (frameCounter % 2 === 0) {
        planets.forEach(planet => {
            if (planet.status === 'stable') {
                planet.trail.push({ x: planet.x, y: planet.y });
                if (planet.trail.length > 350) planet.trail.shift();
            }
        });

        if (moon && moon.status === 'stable') {
            moon.trail.push({ x: moon.x, y: moon.y });
            if (moon.trail.length > 150) moon.trail.shift();
        }
    }
}

// Rendering
function drawSimulation() {
    simCtx.clearRect(0, 0, simCanvas.width, simCanvas.height);
    drawStars();

    simCtx.save();
    simCtx.translate(simCanvas.width / 2 + offsetX, simCanvas.height / 2 + offsetY);
    simCtx.scale(zoom, zoom);

    // 1. Draw Planet Trails
    planets.forEach(planet => {
        if (planet.trail.length < 2) return;

        simCtx.beginPath();
        simCtx.moveTo(planet.trail[0].x, planet.trail[0].y);
        for (let i = 1; i < planet.trail.length; i++) {
            simCtx.lineTo(planet.trail[i].x, planet.trail[i].y);
        }
        
        simCtx.strokeStyle = planet.color;
        simCtx.lineWidth = 1.2 / zoom;
        simCtx.globalAlpha = 0.35;
        simCtx.stroke();
        simCtx.globalAlpha = 1.0;
    });

    // 2. Draw Moon Trail
    if (moon && moon.trail.length >= 2 && moon.status === 'stable') {
        simCtx.beginPath();
        simCtx.moveTo(moon.trail[0].x, moon.trail[0].y);
        for (let i = 1; i < moon.trail.length; i++) {
            simCtx.lineTo(moon.trail[i].x, moon.trail[i].y);
        }
        simCtx.strokeStyle = 'rgba(211, 211, 211, 0.45)';
        simCtx.lineWidth = 0.8 / zoom;
        simCtx.stroke();
    }

    // 3. Draw Asteroids
    simCtx.fillStyle = 'rgba(175, 175, 195, 0.65)';
    asteroids.forEach(ast => {
        if (ast.x > 5000) return; // ignore destroyed ones
        simCtx.beginPath();
        simCtx.arc(ast.x, ast.y, ast.radius, 0, Math.PI * 2);
        simCtx.fill();
    });

    // 4. Draw Sun
    if (sunMassMultiplier > 0) {
        simCtx.save();
        simCtx.beginPath();
        simCtx.arc(sun.x, sun.y, sun.radius, 0, Math.PI * 2);

        const glowRadius = sun.radius * (1.55 + Math.sin(Date.now() / 180) * 0.05);
        const grad = simCtx.createRadialGradient(sun.x, sun.y, sun.radius * 0.5, sun.x, sun.y, glowRadius);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.18, '#ffea00');
        grad.addColorStop(0.58, '#ff6700');
        grad.addColorStop(1, 'rgba(255, 60, 0, 0)');
        
        simCtx.fillStyle = grad;
        simCtx.shadowBlur = 25 * zoom;
        simCtx.shadowColor = '#ff6700';
        simCtx.fill();
        simCtx.restore();
    } else {
        // Dead dwarf core
        simCtx.beginPath();
        simCtx.arc(sun.x, sun.y, sun.radius, 0, Math.PI * 2);
        simCtx.fillStyle = '#202028';
        simCtx.strokeStyle = '#404050';
        simCtx.lineWidth = 2;
        simCtx.stroke();
        simCtx.fill();
    }

    // 5. Draw Planets
    planets.forEach(planet => {
        if (planet.status !== 'stable') return;

        simCtx.save();
        
        const dx = planet.x - sun.x;
        const dy = planet.y - sun.y;
        const angle = Math.atan2(dy, dx);

        // Draw Rings (Saturn)
        if (planet.hasRings) {
            simCtx.save();
            simCtx.translate(planet.x, planet.y);
            simCtx.rotate(0.25);
            simCtx.beginPath();
            simCtx.ellipse(0, 0, planet.radius * 2.0, planet.radius * 0.6, 0, 0, Math.PI * 2);
            simCtx.strokeStyle = 'rgba(237, 220, 210, 0.45)';
            simCtx.lineWidth = 3.5 / zoom;
            simCtx.stroke();
            simCtx.restore();
        }

        // Draw Planet Body
        simCtx.beginPath();
        simCtx.arc(planet.x, planet.y, planet.radius, 0, Math.PI * 2);
        
        const planetGrad = simCtx.createRadialGradient(
            planet.x - (planet.radius * 0.3) * Math.cos(angle),
            planet.y - (planet.radius * 0.3) * Math.sin(angle),
            planet.radius * 0.1,
            planet.x,
            planet.y,
            planet.radius
        );
        planetGrad.addColorStop(0, '#ffffff');
        planetGrad.addColorStop(0.35, planet.color);
        planetGrad.addColorStop(1, '#020208');

        simCtx.fillStyle = planetGrad;
        simCtx.shadowBlur = 4 * zoom;
        simCtx.shadowColor = planet.color;
        simCtx.fill();

        // Planet Label
        simCtx.shadowBlur = 0;
        simCtx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        simCtx.font = `600 ${Math.max(10, 11 / zoom)}px Outfit`;
        simCtx.textAlign = 'center';
        simCtx.fillText(planet.name, planet.x, planet.y - planet.radius - 6);

        simCtx.restore();
    });

    // 6. Draw Moon
    if (moon && moon.status === 'stable') {
        const earth = planets.find(p => p.id === 'earth');
        if (earth && earth.status === 'stable') {
            simCtx.save();
            simCtx.beginPath();
            simCtx.arc(moon.x, moon.y, moon.radius, 0, Math.PI * 2);
            simCtx.fillStyle = moon.color;
            simCtx.shadowBlur = 3 * zoom;
            simCtx.shadowColor = '#ffffff';
            simCtx.fill();
            simCtx.restore();
        }
    }

    // 7. Draw Drag slingshot indicator
    if (isDrawingSlingshot && activeMode === 'launch') {
        simCtx.restore(); // Restore translate state to draw absolute lines in screen coordinates
        
        // Draw dotted slingshot line
        simCtx.beginPath();
        simCtx.setLineDash([5, 5]);
        simCtx.moveTo(slingshotStart.x, slingshotStart.y);
        simCtx.lineTo(slingshotEnd.x, slingshotEnd.y);
        simCtx.strokeStyle = 'rgba(0, 255, 136, 0.8)';
        simCtx.lineWidth = 2.5;
        simCtx.stroke();
        simCtx.setLineDash([]); // Reset dash

        // Draw slingshot origin circle
        simCtx.beginPath();
        simCtx.arc(slingshotStart.x, slingshotStart.y, 6, 0, Math.PI * 2);
        simCtx.fillStyle = '#00ff88';
        simCtx.fill();

        // Draw slingshot reticle
        simCtx.beginPath();
        simCtx.arc(slingshotEnd.x, slingshotEnd.y, 4, 0, Math.PI * 2);
        simCtx.fillStyle = '#ff3366';
        simCtx.fill();

        simCtx.save();
        simCtx.translate(simCanvas.width / 2 + offsetX, simCanvas.height / 2 + offsetY);
        simCtx.scale(zoom, zoom);
    }

    simCtx.restore();
}

// Update UI stats table
function updateStatsTable() {
    if (frameCounter % 6 !== 0) return; // Throttle to 10 FPS

    let html = '';
    planets.forEach(planet => {
        let distanceText = '-';
        let speedText = '-';
        let statusBadge = '';

        if (planet.status === 'stable') {
            const dx = planet.x - sun.x;
            const dy = planet.y - sun.y;
            const r = Math.sqrt(dx * dx + dy * dy);
            distanceText = (r / 100).toFixed(2);
            
            const velocity = Math.sqrt(planet.vx * planet.vx + planet.vy * planet.vy);
            speedText = (velocity * 30000).toLocaleString(undefined, { maximumFractionDigits: 0 });
            
            statusBadge = '<span class="badge badge-stable">Stable</span>';
        } else if (planet.status === 'collided') {
            statusBadge = '<span class="badge badge-collided">Crashed</span>';
        } else if (planet.status === 'escaped') {
            statusBadge = '<span class="badge badge-escaped">Escaped</span>';
        }

        html += `
            <tr>
                <td><strong>${planet.name}</strong></td>
                <td>${distanceText}</td>
                <td>${speedText}</td>
                <td>${statusBadge}</td>
            </tr>
        `;
    });

    // Append Moon status to table
    if (moon) {
        let distanceText = '-';
        let speedText = '-';
        let statusBadge = '';

        if (moon.status === 'stable') {
            // Distance from Earth
            distanceText = (Math.sqrt(moon.rx * moon.rx + moon.ry * moon.ry) / 100).toFixed(2);
            const velocity = Math.sqrt(moon.rvx * moon.rvx + moon.rvy * moon.rvy);
            speedText = (velocity * 30000).toLocaleString(undefined, { maximumFractionDigits: 0 });
            statusBadge = '<span class="badge badge-stable">Stable</span>';
        } else if (moon.status === 'collided') {
            statusBadge = '<span class="badge badge-collided">Crashed</span>';
        } else if (moon.status === 'escaped') {
            statusBadge = '<span class="badge badge-escaped">Escaped</span>';
        }

        html += `
            <tr>
                <td><strong>🌙 Moon</strong></td>
                <td>${distanceText}</td>
                <td>${speedText}</td>
                <td>${statusBadge}</td>
            </tr>
        `;
    }

    planetStatsBody.innerHTML = html;
}

// Master Loop
function loop() {
    updatePhysics();
    drawSimulation();
    updateStatsTable();

    frameCounter++;
    requestAnimationFrame(loop);
}

// Program Entry Point
resizeCanvases();
initPlanets();
loop();
