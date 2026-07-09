// Physics & Scale Settings
const G = 0.15; // Gravitational constant scaled for screen dimensions
const DEFAULT_SUN_MASS = 10000;
const DEFAULT_SUN_RADIUS = 22;

let sunMassMultiplier = 1.0;
let simSpeed = 1.0;
let isPaused = false;

// Zoom and Pan offsets
let offsetX = 0;
let offsetY = 0;
let zoom = 0.95;
let isDragging = false;
let startDragX = 0;
let startDragY = 0;

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

// Presets
const presets = {
    presetNormal: 1.0,
    presetHeavy: 3.5,
    presetSupernova: 8.0,
    presetLight: 0.25,
    presetZero: 0.0
};

// Planet configuration template
const planetTemplates = [
    { id: 'mercury', name: 'כוכב חמה (מרקורי)', distance: 60, radius: 3.5, color: '#9e9e9e', orbitSpeedScale: 1.0 },
    { id: 'venus', name: 'נוגה (ונוס)', distance: 95, radius: 6.0, color: '#e29b3e', orbitSpeedScale: 1.0 },
    { id: 'earth', name: 'כדור הארץ', distance: 135, radius: 6.8, color: '#3a86c8', orbitSpeedScale: 1.0 },
    { id: 'mars', name: 'מאדים (מארס)', distance: 180, radius: 4.8, color: '#e55039', orbitSpeedScale: 1.0 },
    { id: 'jupiter', name: 'צדק (יופיטר)', distance: 245, radius: 14.0, color: '#d4a373', orbitSpeedScale: 1.0, isGasGiant: true },
    { id: 'saturn', name: 'שבתאי (סאטורן)', distance: 315, radius: 11.0, color: '#eddcd2', orbitSpeedScale: 1.0, hasRings: true },
    { id: 'uranus', name: 'אורנוס', distance: 380, radius: 8.5, color: '#a8dadc', orbitSpeedScale: 1.0 },
    { id: 'neptune', name: 'נפטון', distance: 440, radius: 8.0, color: '#457b9d', orbitSpeedScale: 1.0 }
];

// Simulation Objects
let sun = {
    x: 0,
    y: 0,
    mass: DEFAULT_SUN_MASS,
    radius: DEFAULT_SUN_RADIUS,
    color: '#ffcc00'
};

let planets = [];
let stars = [];

// Initialize Stars Background
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
        // Twinkle effect
        star.opacity += star.twinkleSpeed;
        if (star.opacity > 1 || star.opacity < 0.1) {
            star.twinkleSpeed = -star.twinkleSpeed;
        }

        // Slow movement
        star.x += star.dx;
        star.y += star.dy;

        // Wrap around boundaries
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

// Display float alerts
function showAlert(message, type = 'warning') {
    const bubble = document.createElement('div');
    bubble.className = `alert-bubble alert-bubble-${type}`;
    
    let emoji = '⚠️';
    if (type === 'success') emoji = '✅';
    if (type === 'danger') emoji = '💥';
    
    bubble.innerHTML = `<span>${emoji}</span> <span>${message}</span>`;
    alertOverlay.appendChild(bubble);

    // Remove from DOM after transition completes
    setTimeout(() => {
        bubble.remove();
    }, 5000);
}

// Set up stable circular orbit velocity calculation
function getCircularOrbitVelocity(r, M) {
    // F_gravity = G * M * m / r^2
    // F_centrifugal = m * v^2 / r
    // => v = sqrt(G * M / r)
    return Math.sqrt((G * M) / r);
}

// Initialize/Reset planets
function initPlanets() {
    planets = [];
    const sunMass = DEFAULT_SUN_MASS * sunMassMultiplier;

    planetTemplates.forEach(template => {
        const r = template.distance;
        const v = getCircularOrbitVelocity(r, sunMass) * template.orbitSpeedScale;

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
            isGasGiant: template.isGasGiant || false,
            trail: [],
            status: 'stable', // 'stable', 'collided', 'escaped'
            distanceHistory: [],
            lastAlertTime: 0
        });
    });
}

// UI Event Listeners
sunMassSlider.addEventListener('input', (e) => {
    sunMassMultiplier = parseFloat(e.target.value);
    sunMassValue.textContent = `${sunMassMultiplier.toFixed(2)}x`;
    sun.mass = DEFAULT_SUN_MASS * sunMassMultiplier;
    
    // Scale the visual size of the Sun based on mass multiplier
    sun.radius = DEFAULT_SUN_RADIUS * Math.max(0.4, Math.cbrt(sunMassMultiplier));
});

simSpeedSlider.addEventListener('input', (e) => {
    simSpeed = parseFloat(e.target.value);
    simSpeedValue.textContent = `${simSpeed.toFixed(1)}x`;
});

btnPlayPause.addEventListener('click', () => {
    isPaused = !isPaused;
    btnPlayPause.textContent = isPaused ? 'המשך סימולציה' : 'השהה סימולציה';
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
    btnPlayPause.textContent = 'השהה סימולציה';
    btnPlayPause.style.background = 'linear-gradient(135deg, var(--primary-color), #b5179e)';

    offsetX = 0;
    offsetY = 0;
    zoom = 0.95;

    initPlanets();
    showAlert('מערכת השמש אותחלה למצבה הדינמי היציב', 'success');
});

btnClearTrails.addEventListener('click', () => {
    planets.forEach(p => p.trail = []);
});

// Preset Buttons Setup
Object.keys(presets).forEach(presetId => {
    const btn = document.getElementById(presetId);
    if (btn) {
        btn.addEventListener('click', () => {
            const val = presets[presetId];
            sunMassSlider.value = val;
            sunMassSlider.dispatchEvent(new Event('input'));
            showAlert(`מסת השמש שונתה ל-${val}x (${btn.textContent})`, 'info');
        });
    }
});

// Canvas Interaction (Pan & Zoom)
simCanvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    startDragX = e.clientX - offsetX;
    startDragY = e.clientY - offsetY;
});

window.addEventListener('mousemove', (e) => {
    if (isDragging) {
        offsetX = e.clientX - startDragX;
        offsetY = e.clientY - startDragY;
    }
});

window.addEventListener('mouseup', () => {
    isDragging = false;
});

simCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomIntensity = 0.05;
    const mouseX = e.clientX - simCanvas.width / 2;
    const mouseY = e.clientY - simCanvas.height / 2;

    const oldZoom = zoom;
    if (e.deltaY < 0) {
        zoom = Math.min(zoom * (1 + zoomIntensity), 5.0);
    } else {
        zoom = Math.max(zoom * (1 - zoomIntensity), 0.15);
    }

    // Zoom to mouse cursor coordinate
    offsetX -= mouseX / oldZoom - mouseX / zoom;
    offsetY -= mouseY / oldZoom - mouseY / zoom;
});

// Handle Window Resizing
function resizeCanvases() {
    starsCanvas.width = window.innerWidth;
    starsCanvas.height = window.innerHeight;
    simCanvas.width = window.innerWidth;
    simCanvas.height = window.innerHeight;
    initStars();
}

window.addEventListener('resize', resizeCanvases);

// Update Loop (Physics calculation)
let frameCounter = 0;

function updatePhysics() {
    if (isPaused) return;

    // Use multiple physics substeps for integration stability at high speeds
    const substeps = 4;
    const dt = (0.12 * simSpeed) / substeps;

    for (let step = 0; step < substeps; step++) {
        planets.forEach(planet => {
            if (planet.status !== 'stable') return;

            // Vector pointing from planet to Sun
            const dx = sun.x - planet.x;
            const dy = sun.y - planet.y;
            const r = Math.sqrt(dx * dx + dy * dy);

            // 1. Collision detection (Planet crashed into the Sun)
            if (r < sun.radius + planet.radius) {
                planet.status = 'collided';
                planet.vx = 0;
                planet.vy = 0;
                showAlert(`כוכב הלכת ${planet.name} נמשך אל השמש והושמד כליל בקריסה כבידתית!`, 'danger');
                return;
            }

            // 2. Escape detection (Planet floated too far away)
            // If planet is far outside orbit radius and going away
            if (r > 1600) {
                planet.status = 'escaped';
                showAlert(`כוכב הלכת ${planet.name} ברח מכוח המשיכה של השמש ונפלט אל החלל העמוק!`, 'warning');
                return;
            }

            // 3. Gravity calculation (a = G * M_sun / r^2)
            const force = (G * sun.mass) / (r * r);
            const ax = force * (dx / r);
            const ay = force * (dy / r);

            // Euler integration
            planet.vx += ax * dt;
            planet.vy += ay * dt;
            planet.x += planet.vx * dt;
            planet.y += planet.vy * dt;
        });
    }

    // Log trails periodically (saves rendering memory and provides clean spacing)
    if (frameCounter % 2 === 0) {
        planets.forEach(planet => {
            if (planet.status === 'stable') {
                planet.trail.push({ x: planet.x, y: planet.y });
                if (planet.trail.length > 350) {
                    planet.trail.shift();
                }
            }
        });
    }
}

// Draw Loop
function drawSimulation() {
    simCtx.clearRect(0, 0, simCanvas.width, simCanvas.height);

    // Redraw stars canvas in parallel loop
    drawStars();

    // Draw coordinate space relative to center + panning + zoom
    simCtx.save();
    simCtx.translate(simCanvas.width / 2 + offsetX, simCanvas.height / 2 + offsetY);
    simCtx.scale(zoom, zoom);

    // 1. Draw Orbit Lines/Trails
    planets.forEach(planet => {
        if (planet.trail.length < 2) return;

        simCtx.beginPath();
        simCtx.moveTo(planet.trail[0].x, planet.trail[0].y);
        for (let i = 1; i < planet.trail.length; i++) {
            simCtx.lineTo(planet.trail[i].x, planet.trail[i].y);
        }
        
        // Fading orbital trail style
        simCtx.strokeStyle = planet.color;
        simCtx.lineWidth = 1.2 / zoom;
        simCtx.globalAlpha = 0.35;
        simCtx.stroke();
        simCtx.globalAlpha = 1.0;
    });

    // 2. Draw the Sun (with custom procedural solar flares/glow)
    if (sunMassMultiplier > 0) {
        simCtx.save();
        simCtx.beginPath();
        simCtx.arc(sun.x, sun.y, sun.radius, 0, Math.PI * 2);

        // Sun's dynamic radial gradient glow
        const glowRadius = sun.radius * (1.5 + Math.sin(Date.now() / 200) * 0.05);
        const grad = simCtx.createRadialGradient(sun.x, sun.y, sun.radius * 0.5, sun.x, sun.y, glowRadius);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.2, '#ffea00');
        grad.addColorStop(0.6, '#ff6700');
        grad.addColorStop(1, 'rgba(255, 60, 0, 0)');
        
        simCtx.fillStyle = grad;
        simCtx.shadowBlur = 25 * zoom;
        simCtx.shadowColor = '#ff6700';
        simCtx.fill();
        simCtx.restore();
    } else {
        // Draw a "dead" dark dwarf star core
        simCtx.beginPath();
        simCtx.arc(sun.x, sun.y, sun.radius, 0, Math.PI * 2);
        simCtx.fillStyle = '#22222a';
        simCtx.strokeStyle = '#444454';
        simCtx.lineWidth = 2;
        simCtx.stroke();
        simCtx.fill();
    }

    // 3. Draw Planets
    planets.forEach(planet => {
        if (planet.status !== 'stable') return;

        simCtx.save();
        
        // Planet body shadow relative to light source (the Sun)
        const dx = planet.x - sun.x;
        const dy = planet.y - sun.y;
        const angle = Math.atan2(dy, dx);

        // Draw Rings for Saturn
        if (planet.hasRings) {
            simCtx.save();
            simCtx.translate(planet.x, planet.y);
            simCtx.rotate(0.25); // Tilt the rings slightly
            simCtx.beginPath();
            simCtx.ellipse(0, 0, planet.radius * 2.0, planet.radius * 0.6, 0, 0, Math.PI * 2);
            simCtx.strokeStyle = 'rgba(237, 220, 210, 0.45)';
            simCtx.lineWidth = 4 / zoom;
            simCtx.stroke();
            simCtx.restore();
        }

        // Draw planet sphere
        simCtx.beginPath();
        simCtx.arc(planet.x, planet.y, planet.radius, 0, Math.PI * 2);
        
        // Create 3D spherical shading pointing away from Sun
        const planetGrad = simCtx.createRadialGradient(
            planet.x - (planet.radius * 0.3) * Math.cos(angle),
            planet.y - (planet.radius * 0.3) * Math.sin(angle),
            planet.radius * 0.1,
            planet.x,
            planet.y,
            planet.radius
        );
        planetGrad.addColorStop(0, '#ffffff');
        planetGrad.addColorStop(0.4, planet.color);
        planetGrad.addColorStop(1, '#000000'); // dark side shadow

        simCtx.fillStyle = planetGrad;
        simCtx.shadowBlur = 4 * zoom;
        simCtx.shadowColor = planet.color;
        simCtx.fill();

        // Draw planet text labels
        simCtx.shadowBlur = 0;
        simCtx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        simCtx.font = `${Math.max(10, 11 / zoom)}px Rubik`;
        simCtx.textAlign = 'center';
        simCtx.fillText(planet.name.split(' ')[0], planet.x, planet.y - planet.radius - 6);

        simCtx.restore();
    });

    simCtx.restore();
}

// Update the interactive stats panel in the UI
function updateStatsTable() {
    if (frameCounter % 6 !== 0) return; // Throttle to 10 FPS for optimal rendering

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
            
            // Relational speed
            const velocity = Math.sqrt(planet.vx * planet.vx + planet.vy * planet.vy);
            speedText = (velocity * 30000).toLocaleString(undefined, { maximumFractionDigits: 0 });
            
            statusBadge = '<span class="badge badge-stable">יציב</span>';
        } else if (planet.status === 'collided') {
            statusBadge = '<span class="badge badge-collided">התנגש בשמש</span>';
        } else if (planet.status === 'escaped') {
            statusBadge = '<span class="badge badge-escaped">נפלט לחלל</span>';
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
