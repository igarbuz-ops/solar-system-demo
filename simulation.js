// ============================================================
//  SOLAR GRAVITY SIMULATOR — simulation.js
//  All English. Physics: Newtonian gravity, Euler integration
// ============================================================

// ---- Constants ----
const G                  = 0.15;
const DEFAULT_SUN_MASS   = 10000;
const DEFAULT_SUN_RADIUS = 22;
const EARTH_MASS_MOON    = 80;

// ---- State ----
let sunMassMultiplier = 1.0;
let simSpeed          = 1.0;
let isPaused          = false;
let activeMode        = 'pan'; // 'pan' | 'launch'

// Viewport
let offsetX = 0, offsetY = 0, zoom = 0.9;

// Pan dragging
let isDragging  = false;
let startDragX  = 0, startDragY = 0;

// Slingshot
let isSlingshot    = false;
let slingshotStart = { x: 0, y: 0 };
let slingshotEnd   = { x: 0, y: 0 };
let customCount    = 1;

// Audio
let audioCtx    = null;
let isMuted     = true;
let ambientGain = null;

// Touch pinch-zoom
let lastTouchDist   = 0;
let lastTouchMidX   = 0;
let lastTouchMidY   = 0;
let lastTouchZoom   = 1;
let lastTouchOffX   = 0;
let lastTouchOffY   = 0;

// ---- DOM ----
const simCanvas        = document.getElementById('simulationCanvas');
const simCtx           = simCanvas.getContext('2d');
const starsCanvas      = document.getElementById('starsCanvas');
const starsCtx         = starsCanvas.getContext('2d');

const sunMassSlider    = document.getElementById('sunMassSlider');
const sunMassValue     = document.getElementById('sunMassValue');
const simSpeedSlider   = document.getElementById('simSpeedSlider');
const simSpeedValue    = document.getElementById('simSpeedValue');

const btnPlayPause     = document.getElementById('btnPlayPause');
const btnReset         = document.getElementById('btnReset');
const btnClearTrails   = document.getElementById('btnClearTrails');
const btnToggleAudio   = document.getElementById('btnToggleAudio');
const btnTogglePanel   = document.getElementById('btnTogglePanel');
const btnClosePanel    = document.getElementById('btnClosePanel');
const mainPanel        = document.getElementById('mainPanel');
const alertOverlay     = document.getElementById('alertOverlay');
const planetStatsBody  = document.getElementById('planetStatsBody');
const modePan          = document.getElementById('modePan');
const modeLaunch       = document.getElementById('modeLaunch');
const hintBar          = document.getElementById('hintBar');
const btnDismissHint   = document.getElementById('btnDismissHint');

// ---- Planet Templates (100% English) ----
const PLANET_TEMPLATES = [
    { id:'mercury', name:'Mercury',  dist: 60,  r: 3.5,  color:'#9e9e9e' },
    { id:'venus',   name:'Venus',    dist: 95,  r: 6.0,  color:'#e29b3e' },
    { id:'earth',   name:'Earth',    dist:135,  r: 6.8,  color:'#3a86c8', hasMoon:true },
    { id:'mars',    name:'Mars',     dist:180,  r: 4.8,  color:'#e55039' },
    { id:'jupiter', name:'Jupiter',  dist:245,  r:14.0,  color:'#d4a373' },
    { id:'saturn',  name:'Saturn',   dist:315,  r:11.0,  color:'#eddcd2', hasRings:true },
    { id:'uranus',  name:'Uranus',   dist:380,  r: 8.5,  color:'#a8dadc' },
    { id:'neptune', name:'Neptune',  dist:440,  r: 8.0,  color:'#457b9d' },
];

// ---- Simulation Objects ----
let sun = { x:0, y:0, mass: DEFAULT_SUN_MASS, radius: DEFAULT_SUN_RADIUS };
let planets = [];
let asteroids = [];
let moon = null;
let stars = [];

// ============================================================
//  WEB AUDIO SYNTHESIZER
// ============================================================
function initAudio() {
    if (audioCtx) return;
    try {
        audioCtx   = new (window.AudioContext || window.webkitAudioContext)();
        ambientGain = audioCtx.createGain();
        ambientGain.gain.value = 0;
        ambientGain.connect(audioCtx.destination);

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 260;
        filter.connect(ambientGain);

        // Cosmic drone chord
        [65.41, 98.0, 130.81, 155.56].forEach(freq => {
            const osc  = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.value = freq;
            gain.gain.value = 0.18;
            osc.connect(gain);
            gain.connect(filter);
            osc.start();
        });

        // Very-slow LFO on filter for movement
        const lfo  = audioCtx.createOscillator();
        const lfog = audioCtx.createGain();
        lfo.frequency.value = 0.04;
        lfog.gain.value = 90;
        lfo.connect(lfog);
        lfog.connect(filter.frequency);
        lfo.start();
    } catch(e) { console.warn('Audio init failed', e); }
}

function setAmbient(on) {
    if (!audioCtx || !ambientGain) return;
    const target = on ? 0.045 : 0;
    ambientGain.gain.linearRampToValueAtTime(target, audioCtx.currentTime + 0.6);
}

function playLaunchSound() {
    if (!audioCtx || isMuted) return;
    try {
        const osc  = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(110, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(700, audioCtx.currentTime + 0.28);
        gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.32);
    } catch(e) {}
}

function playBoomSound() {
    if (!audioCtx || isMuted) return;
    try {
        const bufSz = Math.floor(audioCtx.sampleRate * 1.0);
        const buf   = audioCtx.createBuffer(1, bufSz, audioCtx.sampleRate);
        const data  = buf.getChannelData(0);
        for (let i = 0; i < bufSz; i++) data[i] = Math.random() * 2 - 1;

        const noise  = audioCtx.createBufferSource();
        noise.buffer = buf;
        const filt   = audioCtx.createBiquadFilter();
        filt.type    = 'lowpass';
        filt.frequency.setValueAtTime(400, audioCtx.currentTime);
        filt.frequency.exponentialRampToValueAtTime(20, audioCtx.currentTime + 0.8);
        const gain   = audioCtx.createGain();
        gain.gain.setValueAtTime(0.38, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.85);
        noise.connect(filt);
        filt.connect(gain);
        gain.connect(audioCtx.destination);
        noise.start();
    } catch(e) {}
}

// ============================================================
//  STARS
// ============================================================
function initStars() {
    stars = Array.from({ length: 160 }, () => ({
        x:  Math.random() * starsCanvas.width,
        y:  Math.random() * starsCanvas.height,
        r:  Math.random() * 1.4 + 0.4,
        op: Math.random(),
        tw: 0.005 + Math.random() * 0.012,
        dx: (Math.random() - 0.5) * 0.04,
        dy: (Math.random() - 0.5) * 0.04,
    }));
}

function drawStars() {
    starsCtx.fillStyle = '#020209';
    starsCtx.fillRect(0, 0, starsCanvas.width, starsCanvas.height);
    for (const s of stars) {
        s.op += s.tw;
        if (s.op > 1 || s.op < 0.08) s.tw *= -1;
        s.x = (s.x + s.dx + starsCanvas.width)  % starsCanvas.width;
        s.y = (s.y + s.dy + starsCanvas.height) % starsCanvas.height;
        starsCtx.fillStyle = `rgba(255,255,255,${Math.abs(s.op).toFixed(2)})`;
        starsCtx.beginPath();
        starsCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        starsCtx.fill();
    }
}

// ============================================================
//  ALERT BUBBLES
// ============================================================
function showAlert(msg, type = 'warning') {
    const el = document.createElement('div');
    el.className = `alert-bubble alert-bubble-${type}`;
    const icon = type === 'danger' ? '💥' : type === 'success' ? '🚀' : '⚠️';
    el.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
    alertOverlay.appendChild(el);
    setTimeout(() => el.remove(), 5100);
}

// ============================================================
//  ORBIT MECHANICS
// ============================================================
function circularVelocity(r, M) {
    return Math.sqrt((G * M) / r);
}

function initPlanets() {
    planets   = [];
    asteroids = [];
    moon      = null;
    customCount = 1;

    const M = DEFAULT_SUN_MASS * sunMassMultiplier;

    for (const t of PLANET_TEMPLATES) {
        const v = circularVelocity(t.dist, M);
        planets.push({
            id:       t.id,
            name:     t.name,
            x:        t.dist,
            y:        0,
            vx:       0,
            vy:       -v,
            radius:   t.r,
            color:    t.color,
            hasRings: !!t.hasRings,
            trail:    [],
            status:   'stable',
            isCustom: false,
        });
    }

    // Moon (relative to Earth)
    moon = {
        rx: 16, ry: 0,
        rvx: 0, rvy: -circularVelocity(16, EARTH_MASS_MOON),
        x: 135 + 16, y: 0,
        radius: 1.8, color: '#cccccc',
        name: 'Moon',
        trail: [],
        status: 'stable',
    };

    // Asteroid belt (between Mars & Jupiter)
    for (let i = 0; i < 160; i++) {
        const r     = 196 + Math.random() * 34;
        const theta = Math.random() * Math.PI * 2;
        const v     = circularVelocity(r, M);
        asteroids.push({
            x:  r * Math.cos(theta),
            y:  r * Math.sin(theta),
            vx: -v * Math.sin(theta),
            vy:  v * Math.cos(theta),
            r:   0.7 + Math.random() * 0.9,
            alive: true,
        });
    }
}

// ============================================================
//  UI EVENT HANDLERS
// ============================================================

// --- Sliders ---
sunMassSlider.addEventListener('input', e => {
    sunMassMultiplier = parseFloat(e.target.value);
    sunMassValue.textContent = `${sunMassMultiplier.toFixed(2)}×`;
    sun.mass   = DEFAULT_SUN_MASS  * sunMassMultiplier;
    sun.radius = DEFAULT_SUN_RADIUS * Math.max(0.4, Math.cbrt(sunMassMultiplier));
});

simSpeedSlider.addEventListener('input', e => {
    simSpeed = parseFloat(e.target.value);
    simSpeedValue.textContent = `${simSpeed.toFixed(1)}×`;
});

// --- Play/Pause ---
btnPlayPause.addEventListener('click', () => {
    isPaused = !isPaused;
    btnPlayPause.textContent      = isPaused ? '▶' : '⏸';
    btnPlayPause.title            = isPaused ? 'Resume' : 'Pause';
    btnPlayPause.style.background = isPaused
        ? 'linear-gradient(135deg,#00b4d8,#0077b6)'
        : '';
});

// --- Reset ---
btnReset.addEventListener('click', () => {
    sunMassMultiplier = 1.0;
    sunMassSlider.value = '1.0';
    sunMassValue.textContent = '1.00×';
    sun.mass   = DEFAULT_SUN_MASS;
    sun.radius = DEFAULT_SUN_RADIUS;

    simSpeed = 1.0;
    simSpeedSlider.value = '1.0';
    simSpeedValue.textContent = '1.0×';

    isPaused = false;
    btnPlayPause.textContent = '⏸';
    btnPlayPause.style.background = '';

    offsetX = 0; offsetY = 0; zoom = 0.9;
    initPlanets();
    showAlert('Solar System reset to stable configuration.', 'success');
});

// --- Clear Trails ---
btnClearTrails.addEventListener('click', () => {
    planets.forEach(p => p.trail = []);
    if (moon) moon.trail = [];
});

// --- Audio ---
btnToggleAudio.addEventListener('click', () => {
    if (!audioCtx) initAudio();
    isMuted = !isMuted;
    if (!isMuted && audioCtx?.state === 'suspended') audioCtx.resume();
    setAmbient(!isMuted);
    btnToggleAudio.textContent = isMuted ? '🔇' : '🔊';
    btnToggleAudio.title       = isMuted ? 'Unmute' : 'Mute';
    btnToggleAudio.classList.toggle('tool-btn-primary', !isMuted);
});

// --- Panel toggle ---
function showPanel() {
    mainPanel.classList.remove('hidden');
}
function hidePanel() {
    mainPanel.classList.add('hidden');
}

btnTogglePanel.addEventListener('click', () => {
    mainPanel.classList.toggle('hidden');
});

btnClosePanel.addEventListener('click', hidePanel);

// --- Hint dismiss ---
btnDismissHint.addEventListener('click', () => {
    hintBar.classList.add('hidden');
});

// --- Presets ---
document.querySelectorAll('[data-mass]').forEach(btn => {
    btn.addEventListener('click', () => {
        const val = parseFloat(btn.dataset.mass);
        sunMassSlider.value = val;
        sunMassSlider.dispatchEvent(new Event('input'));
        showAlert(`Solar mass set to ${val}×`, 'success');
    });
});

// --- Mode Toggles ---
modePan.addEventListener('click', () => {
    activeMode = 'pan';
    modePan.classList.add('active');
    modeLaunch.classList.remove('active');
    isSlingshot = false;
    simCanvas.style.cursor = 'grab';
});

modeLaunch.addEventListener('click', () => {
    activeMode = 'launch';
    modeLaunch.classList.add('active');
    modePan.classList.remove('active');
    simCanvas.style.cursor = 'crosshair';
});

// ============================================================
//  COORDINATE CONVERSION
// ============================================================
function screenToWorld(cx, cy) {
    return {
        x: (cx - simCanvas.width  / 2 - offsetX) / zoom,
        y: (cy - simCanvas.height / 2 - offsetY) / zoom,
    };
}

// ============================================================
//  POINTER INTERACTION (Mouse + Touch unified)
// ============================================================

// Ignore clicks that land on UI elements
function isOnUI(cx, cy) {
    const el = document.elementFromPoint(cx, cy);
    return el && (
        el.closest('.panel')   !== null ||
        el.closest('.toolbar') !== null ||
        el.closest('.hint-bar') !== null
    );
}

function handlePointerDown(cx, cy) {
    if (isOnUI(cx, cy)) return;

    // Wake audio on first interaction
    if (!audioCtx) initAudio();
    if (audioCtx?.state === 'suspended') audioCtx.resume();

    if (activeMode === 'pan') {
        isDragging = true;
        startDragX = cx - offsetX;
        startDragY = cy - offsetY;
    } else {
        isSlingshot    = true;
        slingshotStart = { x: cx, y: cy };
        slingshotEnd   = { x: cx, y: cy };
    }
}

function handlePointerMove(cx, cy) {
    if (isDragging)   { offsetX = cx - startDragX; offsetY = cy - startDragY; }
    if (isSlingshot)  { slingshotEnd = { x: cx, y: cy }; }
}

function handlePointerUp() {
    isDragging = false;

    if (isSlingshot) {
        isSlingshot = false;

        const dx   = slingshotStart.x - slingshotEnd.x;
        const dy   = slingshotStart.y - slingshotEnd.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 14) {
            const w    = screenToWorld(slingshotStart.x, slingshotStart.y);
            const spd  = 0.045 / zoom;
            const hue  = Math.floor(Math.random() * 360);
            const size = 4.5 + Math.random() * 5;

            planets.push({
                id:       `custom_${Date.now()}`,
                name:     `Custom #${customCount++}`,
                x:        w.x,
                y:        w.y,
                vx:       dx * spd,
                vy:       dy * spd,
                radius:   size,
                color:    `hsl(${hue},85%,65%)`,
                hasRings: false,
                trail:    [],
                status:   'stable',
                isCustom: true,
            });

            playLaunchSound();
            showAlert(`Custom Planet #${customCount - 1} launched!`, 'success');
        }
    }
}

// ---- Mouse events ----
simCanvas.addEventListener('mousedown', e => {
    if (e.button === 0) handlePointerDown(e.clientX, e.clientY);
});
window.addEventListener('mousemove', e => handlePointerMove(e.clientX, e.clientY));
window.addEventListener('mouseup',   () => handlePointerUp());

simCanvas.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.07 : 0.93;
    const mx = e.clientX - simCanvas.width  / 2;
    const my = e.clientY - simCanvas.height / 2;
    const old = zoom;
    zoom = Math.max(0.15, Math.min(zoom * factor, 5.5));
    offsetX -= mx / old - mx / zoom;
    offsetY -= my / old - my / zoom;
}, { passive: false });

simCanvas.addEventListener('contextmenu', e => e.preventDefault());

// ---- Touch events (mobile-optimized) ----
simCanvas.addEventListener('touchstart', e => {
    e.preventDefault();

    if (e.touches.length === 1) {
        const t = e.touches[0];
        if (!isOnUI(t.clientX, t.clientY)) {
            handlePointerDown(t.clientX, t.clientY);
        }
    } else if (e.touches.length === 2) {
        // Two-finger: cancel any single-finger action and start pinch
        isDragging  = false;
        isSlingshot = false;

        const t0 = e.touches[0], t1 = e.touches[1];
        lastTouchDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
        lastTouchZoom = zoom;
        lastTouchOffX = offsetX;
        lastTouchOffY = offsetY;
        lastTouchMidX = (t0.clientX + t1.clientX) / 2;
        lastTouchMidY = (t0.clientY + t1.clientY) / 2;
    }
}, { passive: false });

simCanvas.addEventListener('touchmove', e => {
    e.preventDefault();

    if (e.touches.length === 1 && !isSlingshot && !isDragging) return;

    if (e.touches.length === 1) {
        const t = e.touches[0];
        handlePointerMove(t.clientX, t.clientY);
    } else if (e.touches.length === 2) {
        const t0 = e.touches[0], t1 = e.touches[1];
        const newDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
        const midX    = (t0.clientX + t1.clientX) / 2;
        const midY    = (t0.clientY + t1.clientY) / 2;

        // Pinch zoom
        const scale = newDist / lastTouchDist;
        const oldZ  = zoom;
        zoom = Math.max(0.15, Math.min(lastTouchZoom * scale, 5.5));

        // Pinch pan
        const dmx = midX - lastTouchMidX;
        const dmy = midY - lastTouchMidY;
        offsetX = lastTouchOffX + dmx + (midX - simCanvas.width / 2) * (1 / oldZ - 1 / zoom);
        offsetY = lastTouchOffY + dmy + (midY - simCanvas.height / 2) * (1 / oldZ - 1 / zoom);
    }
}, { passive: false });

simCanvas.addEventListener('touchend', e => {
    e.preventDefault();
    if (e.touches.length === 0) handlePointerUp();
}, { passive: false });

// ============================================================
//  RESIZE
// ============================================================
function resizeCanvases() {
    starsCanvas.width  = simCanvas.width  = window.innerWidth;
    starsCanvas.height = simCanvas.height = window.innerHeight;
    initStars();
}
window.addEventListener('resize', resizeCanvases);

// ============================================================
//  PHYSICS UPDATE
// ============================================================
let frame = 0;

function updatePhysics() {
    if (isPaused) return;
    const STEPS = 4;
    const dt    = (0.12 * simSpeed) / STEPS;

    for (let step = 0; step < STEPS; step++) {

        // ---- Planets ----
        for (const p of planets) {
            if (p.status !== 'stable') continue;
            const dx = sun.x - p.x, dy = sun.y - p.y;
            const r  = Math.hypot(dx, dy);

            if (r < sun.radius + p.radius) {
                p.status = 'collided'; p.vx = p.vy = 0;
                playBoomSound();
                showAlert(`${p.name} was incinerated by the Sun!`, 'danger');
                continue;
            }
            if (r > 2200) {
                p.status = 'escaped';
                showAlert(`${p.name} escaped into deep space!`, 'warning');
                continue;
            }
            const a = (G * sun.mass) / (r * r);
            p.vx += a * (dx / r) * dt;
            p.vy += a * (dy / r) * dt;
            p.x  += p.vx * dt;
            p.y  += p.vy * dt;
        }

        // ---- Moon ----
        if (moon && moon.status === 'stable') {
            const earth = planets.find(p => p.id === 'earth');
            if (earth && earth.status === 'stable') {
                const mr = Math.hypot(moon.rx, moon.ry);
                if (mr < earth.radius + moon.radius) {
                    moon.status = 'collided';
                    playBoomSound();
                    showAlert('The Moon crashed into Earth!', 'danger');
                } else {
                    const a = (G * EARTH_MASS_MOON) / (mr * mr);
                    moon.rvx -= a * (moon.rx / mr) * dt;
                    moon.rvy -= a * (moon.ry / mr) * dt;
                    moon.rx  += moon.rvx * dt;
                    moon.ry  += moon.rvy * dt;
                    moon.x    = earth.x + moon.rx;
                    moon.y    = earth.y + moon.ry;
                }
            }
        }

        // ---- Asteroids ----
        for (const a of asteroids) {
            if (!a.alive) continue;
            const dx = sun.x - a.x, dy = sun.y - a.y;
            const r  = Math.hypot(dx, dy);
            if (r < sun.radius) { a.alive = false; continue; }
            const f  = (G * sun.mass) / (r * r);
            a.vx += f * (dx / r) * dt;
            a.vy += f * (dy / r) * dt;
            a.x  += a.vx * dt;
            a.y  += a.vy * dt;
        }
    }

    // ---- Trails (every 2nd frame) ----
    if (frame % 2 === 0) {
        for (const p of planets) {
            if (p.status !== 'stable') continue;
            p.trail.push({ x: p.x, y: p.y });
            if (p.trail.length > 380) p.trail.shift();
        }
        if (moon && moon.status === 'stable') {
            moon.trail.push({ x: moon.x, y: moon.y });
            if (moon.trail.length > 160) moon.trail.shift();
        }
    }
}

// ============================================================
//  RENDERING
// ============================================================
function drawSimulation() {
    simCtx.clearRect(0, 0, simCanvas.width, simCanvas.height);
    drawStars();

    simCtx.save();
    simCtx.translate(simCanvas.width / 2 + offsetX, simCanvas.height / 2 + offsetY);
    simCtx.scale(zoom, zoom);

    // 1. Planet trails
    for (const p of planets) {
        if (p.trail.length < 2) continue;
        simCtx.beginPath();
        simCtx.moveTo(p.trail[0].x, p.trail[0].y);
        for (let i = 1; i < p.trail.length; i++) simCtx.lineTo(p.trail[i].x, p.trail[i].y);
        simCtx.strokeStyle = p.color;
        simCtx.lineWidth   = 1.2 / zoom;
        simCtx.globalAlpha = 0.32;
        simCtx.stroke();
        simCtx.globalAlpha = 1;
    }

    // 2. Moon trail
    if (moon && moon.trail.length >= 2 && moon.status === 'stable') {
        simCtx.beginPath();
        simCtx.moveTo(moon.trail[0].x, moon.trail[0].y);
        for (let i = 1; i < moon.trail.length; i++) simCtx.lineTo(moon.trail[i].x, moon.trail[i].y);
        simCtx.strokeStyle = 'rgba(200,200,220,0.4)';
        simCtx.lineWidth   = 0.8 / zoom;
        simCtx.stroke();
    }

    // 3. Asteroids
    simCtx.fillStyle = 'rgba(170,170,190,0.6)';
    for (const a of asteroids) {
        if (!a.alive) continue;
        simCtx.beginPath();
        simCtx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
        simCtx.fill();
    }

    // 4. Sun
    if (sunMassMultiplier > 0) {
        const pulse = sun.radius * (1.55 + Math.sin(Date.now() / 190) * 0.05);
        const grad  = simCtx.createRadialGradient(0, 0, sun.radius * 0.45, 0, 0, pulse);
        grad.addColorStop(0,   '#ffffff');
        grad.addColorStop(0.2, '#ffe000');
        grad.addColorStop(0.6, '#ff6200');
        grad.addColorStop(1,   'rgba(255,60,0,0)');
        simCtx.save();
        simCtx.beginPath();
        simCtx.arc(0, 0, pulse, 0, Math.PI * 2);
        simCtx.fillStyle   = grad;
        simCtx.shadowBlur  = 30 * zoom;
        simCtx.shadowColor = '#ff6200';
        simCtx.fill();
        simCtx.restore();
    } else {
        // Dead star
        simCtx.beginPath();
        simCtx.arc(0, 0, sun.radius, 0, Math.PI * 2);
        simCtx.fillStyle = '#1a1a22';
        simCtx.fill();
        simCtx.strokeStyle = '#383848';
        simCtx.lineWidth   = 2;
        simCtx.stroke();
    }

    // 5. Planets
    for (const p of planets) {
        if (p.status !== 'stable') continue;
        simCtx.save();

        // Saturn's rings
        if (p.hasRings) {
            simCtx.save();
            simCtx.translate(p.x, p.y);
            simCtx.rotate(0.26);
            simCtx.beginPath();
            simCtx.ellipse(0, 0, p.radius * 2.0, p.radius * 0.58, 0, 0, Math.PI * 2);
            simCtx.strokeStyle = 'rgba(237,220,210,0.45)';
            simCtx.lineWidth   = 3.5 / zoom;
            simCtx.stroke();
            simCtx.restore();
        }

        // Sphere shading
        const ang  = Math.atan2(p.y - sun.y, p.x - sun.x);
        const gx   = p.x - Math.cos(ang) * p.radius * 0.32;
        const gy   = p.y - Math.sin(ang) * p.radius * 0.32;
        const grad = simCtx.createRadialGradient(gx, gy, p.radius * 0.08, p.x, p.y, p.radius);
        grad.addColorStop(0,   '#ffffff');
        grad.addColorStop(0.4, p.color);
        grad.addColorStop(1,   '#010105');

        simCtx.beginPath();
        simCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        simCtx.fillStyle   = grad;
        simCtx.shadowBlur  = 5 * zoom;
        simCtx.shadowColor = p.color;
        simCtx.fill();

        // Label
        simCtx.shadowBlur = 0;
        simCtx.fillStyle  = 'rgba(255,255,255,0.72)';
        simCtx.font       = `600 ${Math.max(10, 11 / zoom)}px Outfit`;
        simCtx.textAlign  = 'center';
        simCtx.fillText(p.name, p.x, p.y - p.radius - 5);

        simCtx.restore();
    }

    // 6. Moon
    if (moon && moon.status === 'stable') {
        const earth = planets.find(p => p.id === 'earth');
        if (earth && earth.status === 'stable') {
            simCtx.save();
            simCtx.beginPath();
            simCtx.arc(moon.x, moon.y, moon.radius, 0, Math.PI * 2);
            simCtx.fillStyle   = moon.color;
            simCtx.shadowBlur  = 4 * zoom;
            simCtx.shadowColor = '#cccccc';
            simCtx.fill();
            simCtx.restore();
        }
    }

    simCtx.restore(); // ← end world transform

    // 7. Slingshot indicator (screen-space, no world transform)
    if (isSlingshot && activeMode === 'launch') {
        const sx = slingshotStart.x, sy = slingshotStart.y;
        const ex = slingshotEnd.x,   ey = slingshotEnd.y;

        simCtx.save();
        simCtx.setLineDash([5, 5]);
        simCtx.beginPath();
        simCtx.moveTo(sx, sy);
        simCtx.lineTo(ex, ey);
        simCtx.strokeStyle = 'rgba(0,232,122,0.85)';
        simCtx.lineWidth   = 2.5;
        simCtx.stroke();
        simCtx.setLineDash([]);

        // Origin dot
        simCtx.beginPath();
        simCtx.arc(sx, sy, 6, 0, Math.PI * 2);
        simCtx.fillStyle = '#00e87a';
        simCtx.fill();

        // Target dot
        simCtx.beginPath();
        simCtx.arc(ex, ey, 5, 0, Math.PI * 2);
        simCtx.fillStyle = '#ff304f';
        simCtx.fill();

        simCtx.restore();
    }
}

// ============================================================
//  STATS TABLE
// ============================================================
function updateStats() {
    if (frame % 6 !== 0) return;

    let html = '';

    for (const p of planets) {
        const dx   = p.x - sun.x, dy = p.y - sun.y;
        const dist = p.status === 'stable' ? (Math.hypot(dx, dy) / 100).toFixed(2) : '—';
        const spd  = p.status === 'stable'
            ? (Math.hypot(p.vx, p.vy) * 30000).toLocaleString(undefined, { maximumFractionDigits: 0 })
            : '—';
        const badge = p.status === 'stable'
            ? '<span class="badge badge-stable">Stable</span>'
            : p.status === 'collided'
                ? '<span class="badge badge-collided">Crashed</span>'
                : '<span class="badge badge-escaped">Escaped</span>';

        html += `<tr>
            <td><strong>${p.name}</strong></td>
            <td>${dist}</td>
            <td>${spd}</td>
            <td>${badge}</td>
        </tr>`;
    }

    // Moon row
    if (moon) {
        const dist  = moon.status === 'stable'
            ? (Math.hypot(moon.rx, moon.ry) / 100).toFixed(2) : '—';
        const spd   = moon.status === 'stable'
            ? (Math.hypot(moon.rvx, moon.rvy) * 30000).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—';
        const badge = moon.status === 'stable'
            ? '<span class="badge badge-stable">Stable</span>'
            : '<span class="badge badge-collided">Crashed</span>';

        html += `<tr>
            <td><strong>🌙 Moon</strong></td>
            <td>${dist}</td>
            <td>${spd}</td>
            <td>${badge}</td>
        </tr>`;
    }

    planetStatsBody.innerHTML = html;
}

// ============================================================
//  MAIN LOOP
// ============================================================
function loop() {
    updatePhysics();
    drawSimulation();
    updateStats();
    frame++;
    requestAnimationFrame(loop);
}

// ============================================================
//  INIT
// ============================================================
resizeCanvases();
initPlanets();
loop();
