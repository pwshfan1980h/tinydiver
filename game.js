/* ============================================
   TINYDIVER — Game Engine (PoC)
   Frogger-like underwater diving game
   ============================================ */

(() => {
  // ---- CONSTANTS ----
  const WORLD_HEIGHT = 3000;        // total scrollable depth in px
  const VIEW_WIDTH = () => window.innerWidth;
  const VIEW_HEIGHT = () => window.innerHeight;
  const DIVER_SIZE = 48;
  const DIVER_SPEED = 1.8;          // Reduced speed significantly for a heavier feel
  const FRICTION = 0.90;            // Adjusted for floatier water physics
  const BUBBLE_CHANCE = 0.15;       // chance to spawn bubble per frame while moving
  const MAX_BUBBLES = 40;
  const DARKNESS_MAX_OPACITY = 0.85;
  const ABYSS_DARKNESS_REDUCTION = 0.18;
  const DEEP_PREDATOR_SPEED_BONUS = 0.22;
  const TREASURE_ESCAPE_SPEED_BONUS = 0.08;
  const DIVER_HITBOX_INSET = 6;
  const PREDATOR_HITBOX_SCALE = 0.76;

  // Depth zone boundaries (fraction of WORLD_HEIGHT)
  const ZONES = [
    { name: 'SURFACE', top: 0, bot: 0.12, color1: '#4dd9e8', color2: '#1ab0c4', label: 'SURFACE' },
    { name: 'SHALLOWS', top: 0.12, bot: 0.35, color1: '#1ab0c4', color2: '#0e7a96', label: 'SHALLOWS' },
    { name: 'MIDWATER', top: 0.35, bot: 0.58, color1: '#0e7a96', color2: '#08405a', label: 'MID-WATER' },
    { name: 'DEEP', top: 0.58, bot: 0.80, color1: '#0b4e6d', color2: '#082338', label: 'THE DEEP' },
    { name: 'ABYSS', top: 0.80, bot: 1.0, color1: '#082338', color2: '#041626', label: 'THE ABYSS' },
  ];

  // ---- STATE ----
  const keys = { w: false, a: false, s: false, d: false };
  let diver = {
    x: 0, y: 80,
    vx: 0, vy: 0,
    angle: 0, // Adding visual rotation for the diver
    facingLeft: false,
    moving: false,
    hasTreasure: false,
    won: false,
    dead: false,
    invincible: false,
    lives: 3
  };
  let cameraY = 0;
  let predators = [];
  let bubbles = [];
  let frameCount = 0;

  // ---- DOM REFS ----
  const container = document.getElementById('game-container');
  const gameWorld = document.getElementById('game-world');
  const waterBg = document.getElementById('water-bg');
  const depthVignette = document.getElementById('depth-vignette');
  const darknessLayer = document.getElementById('darkness-layer');
  const flashlightBeam = document.getElementById('flashlight-beam');
  const depthBarFill = document.getElementById('depth-bar-fill');
  const depthBarDiver = document.getElementById('depth-bar-diver');
  const depthLabel = document.getElementById('depth-label');
  const objectiveBanner = document.getElementById('objective-banner');

  // ---- AUDIO SYSTEM ----
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'bubble') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400 + Math.random() * 200, now);
      osc.frequency.exponentialRampToValueAtTime(800 + Math.random() * 200, now + 0.1);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'hit') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.3);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'treasure') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(554.37, now + 0.1);
      osc.frequency.setValueAtTime(659.25, now + 0.2);
      osc.frequency.setValueAtTime(880, now + 0.3);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.6);
      osc.start(now);
      osc.stop(now + 0.6);
    } else if (type === 'gameover') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 1.5);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.linearRampToValueAtTime(0, now + 1.5);
      osc.start(now);
      osc.stop(now + 1.5);
    }
  }

  // ---- SVG DEFINITIONS ----

  function createDiverSVG() {
    return `
    <svg width="60" height="30" viewBox="0 0 60 30" xmlns="http://www.w3.org/2000/svg">
      <!-- High-End Diver Silhouette (Horizontal) -->
      
      <!-- Left Flipper (Background) -->
      <path d="M 12 10 L 2 12 L 6 16 L 15 15 Z" fill="#111" opacity="0.8">
        <animateTransform attributeName="transform" type="rotate" values="0 15 15; -15 15 15; 0 15 15" dur="0.8s" repeatCount="indefinite"/>
      </path>
      
      <!-- Right Flipper (Foreground) -->
      <path d="M 12 18 L 2 22 L 8 26 L 15 20 Z" fill="#2ECC71">
        <animateTransform attributeName="transform" type="rotate" values="0 15 20; 15 15 20; 0 15 20" dur="0.8s" repeatCount="indefinite" begin="0.4s"/>
      </path>
      
      <!-- Legs -->
      <path d="M 12 12 L 25 12 L 25 18 L 12 18 Z" fill="#1a1a2e"/>

      <!-- Oxygen Tank -->
      <rect x="22" y="6" width="18" height="8" rx="3" fill="#ecf0f1"/>
      <rect x="20" y="8" width="4" height="4" rx="1" fill="#bdc3c7"/>
      
      <!-- Torso Wetsuit -->
      <ellipse cx="32" cy="18" rx="12" ry="7" fill="#16213e"/>
      <path d="M 22 18 Q 32 26 42 18 L 40 12 Q 32 10 24 12 Z" fill="#0f172a"/>

      <!-- Accent Strip on Wetsuit -->
      <path d="M 25 15 L 38 15" fill="none" stroke="#e74c3c" stroke-width="1.5"/>

      <!-- Arms (Foreground) -->
      <path d="M 33 20 L 45 23 L 47 21 L 35 18 Z" fill="#1e293b"/>
      <!-- Hand holding flashlight -->
      <circle cx="48" cy="22" r="2" fill="#111"/>
      <rect x="47" y="21" width="6" height="3" rx="1" fill="#7f8c8d" transform="rotate(15 48 22)"/>
      <!-- Flashlight beam (faint) -->
      <polygon points="52,22 80,10 80,34" fill="rgba(255, 255, 255, 0.15)"/>

      <!-- Head & Hood -->
      <circle cx="45" cy="15" r="6" fill="#111"/>
      
      <!-- Face/Mask -->
      <path d="M 46 12 Q 52 12 51 18 L 47 18 Z" fill="#3498db" opacity="0.8"/>
      <!-- Regulator -->
      <circle cx="48" cy="19" r="1.5" fill="#95a5a6"/>
      <path d="M 40 10 Q 45 8 48 19" fill="none" stroke="#333" stroke-width="1.5"/>
    </svg>`;
  }

  function createSharkSVG(scale = 1, primaryColor = '#5a6e82', secondaryColor = '#6b8299') {
    const w = 100 * scale;
    const h = 60 * scale;
    return `
    <svg width="${w}" height="${h}" viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg">
      <path d="M 8 30 Q 24 13 56 12 Q 84 12 95 28 Q 84 44 56 45 Q 24 46 8 30 Z" fill="${primaryColor}"/>
      <path d="M 10 31 Q 24 20 56 20 Q 81 20 90 31 Q 81 40 56 40 Q 24 41 10 31 Z" fill="${secondaryColor}" opacity="0.9"/>
      <path d="M 45 14 L 52 0 L 60 15 Z" fill="#3e5368"/>
      <path d="M 8 30 L -3 17 L 2 30 L -3 44 L 8 32 Z" fill="#3e5368">
        <animateTransform attributeName="transform" type="rotate" values="-6 8 30; 6 8 30; -6 8 30" dur="0.55s" repeatCount="indefinite"/>
      </path>
      <path d="M 55 38 L 70 45 L 61 34 Z" fill="#3e5368"/>
      <circle cx="76" cy="24" r="2.3" fill="#0b0f14"/>
      <path d="M 82 31 L 92 31" stroke="#111827" stroke-width="1.7" stroke-linecap="round"/>
      <path d="M 68 30 L 73 33 M 64 31 L 69 34 M 60 32 L 65 35" stroke="#2b3644" stroke-width="1.2" stroke-linecap="round"/>
      <animateTransform attributeName="transform" type="translate" values="0,0; 0,-3; 0,3; 0,0" dur="2s" repeatCount="indefinite"/>
    </svg>`;
  }

  function createPufferfishSVG(scale = 1, skinColor = '#f39c12', spotColor = '#f1c40f') {
    const s = 50 * scale;
    return `
    <svg width="${s}" height="${s}" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
      <!-- Spiky body -->
      <circle cx="25" cy="25" r="18" fill="${skinColor}"/>
      <circle cx="25" cy="25" r="16" fill="${spotColor}"/>
      <!-- Spikes -->
      ${[...Array(12)].map((_, i) => {
      const angle = (i / 12) * Math.PI * 2;
      const x1 = 25 + Math.cos(angle) * 16;
      const y1 = 25 + Math.sin(angle) * 16;
      const x2 = 25 + Math.cos(angle) * 22;
      const y2 = 25 + Math.sin(angle) * 22;
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#e67e22" stroke-width="2.5" stroke-linecap="round"/>`;
    }).join('')}
      <ellipse cx="25" cy="30" rx="10" ry="7" fill="#d0b374" opacity="0.45"/>
      <circle cx="18" cy="20" r="4.4" fill="#0f172a"/>
      <circle cx="31" cy="20" r="4.4" fill="#0f172a"/>
      <circle cx="19" cy="19" r="1.1" fill="#d1d5db" opacity="0.8"/>
      <circle cx="32" cy="19" r="1.1" fill="#d1d5db" opacity="0.8"/>
      <path d="M 22 30 L 28 30" stroke="#7a2e1f" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M 7 25 L 1 19 L 4 25 L 1 31 Z" fill="#8d5b29"/>
      <!-- Puff animation -->
      <animateTransform attributeName="transform" type="scale" values="1; 1.08; 1" dur="1.5s" repeatCount="indefinite" additive="sum" origin="25 25"/>
    </svg>`;
  }

  function createJellyfishSVG(scale = 1, domeColor = '180, 120, 255', innerColor = '200, 150, 255') {
    const w = 50 * scale;
    const h = 70 * scale;
    return `
    <svg width="${w}" height="${h}" viewBox="0 0 50 70" xmlns="http://www.w3.org/2000/svg">
      <!-- Bell / dome -->
      <ellipse cx="25" cy="18" rx="20" ry="16" fill="rgba(${domeColor}, 0.5)" stroke="rgba(${innerColor},0.6)" stroke-width="1"/>
      <ellipse cx="25" cy="18" rx="16" ry="12" fill="rgba(${domeColor}, 0.3)"/>
      <!-- Inner glow -->
      <ellipse cx="25" cy="16" rx="8" ry="6" fill="rgba(255,200,255,0.3)"/>
      <path d="M 19 21 L 31 21" stroke="rgba(${innerColor},0.45)" stroke-width="1.2" stroke-linecap="round"/>
      <!-- Tentacles -->
      ${[10, 17, 25, 33, 40].map((x, i) => `
        <path d="M ${x} 32 Q ${x + 3} 45 ${x - 2} 60 Q ${x + 2} 65 ${x} 70" 
              fill="none" stroke="rgba(${domeColor},0.4)" stroke-width="1.5" stroke-linecap="round">
          <animate attributeName="d" 
            values="M ${x} 32 Q ${x + 3} 45 ${x - 2} 60 Q ${x + 2} 65 ${x} 70;
                    M ${x} 32 Q ${x - 4} 48 ${x + 3} 58 Q ${x - 1} 67 ${x + 2} 70;
                    M ${x} 32 Q ${x + 3} 45 ${x - 2} 60 Q ${x + 2} 65 ${x} 70"
            dur="${1.5 + i * 0.2}s" repeatCount="indefinite"/>
        </path>
      `).join('')}
      <!-- Pulse animation -->
      <animateTransform attributeName="transform" type="scale" values="1 1; 1.03 0.92; 1 1" dur="2s" repeatCount="indefinite" additive="sum"/>
    </svg>`;
  }

  function createSmallFishSVG(color = '#ffb347') {
    return `
    <svg width="20" height="12" viewBox="0 0 20 12" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="10" cy="6" rx="8" ry="5" fill="${color}"/>
      <polygon points="2,6 -2,2 -2,10" fill="${color}"/>
      <circle cx="14.2" cy="5" r="1.2" fill="#0f172a"/>
    </svg>`;
  }

  function createKelpSVG(height = 200) {
    const segments = Math.floor(height / 30);
    let path = `M 8 ${height}`;
    for (let i = segments; i >= 0; i--) {
      const y = i * 30;
      const cx = (i % 2 === 0) ? 14 : 2;
      path += ` Q ${cx} ${y + 15} 8 ${y}`;
    }
    const leafPaths = [];
    for (let i = 1; i < segments; i++) {
      const y = i * 30;
      const side = i % 2 === 0 ? 1 : -1;
      const lx = 8 + side * 12;
      leafPaths.push(`<ellipse cx="${lx}" cy="${y}" rx="8" ry="4" fill="#27ae60" opacity="0.7" transform="rotate(${side * 20} ${lx} ${y})"/>`);
    }
    return `
    <svg width="30" height="${height}" viewBox="0 0 30 ${height}" xmlns="http://www.w3.org/2000/svg">
      <path d="${path}" fill="none" stroke="#2ecc71" stroke-width="4" stroke-linecap="round"/>
      <path d="${path}" fill="none" stroke="#27ae60" stroke-width="2" stroke-linecap="round" opacity="0.6" transform="translate(1,0)"/>
      ${leafPaths.join('')}
    </svg>`;
  }

  function createTreasureSVG() {
    return `
    <svg width="60" height="50" viewBox="0 0 60 50" xmlns="http://www.w3.org/2000/svg">
      <!-- Chest body -->
      <rect x="5" y="20" width="50" height="28" rx="3" fill="#8B4513"/>
      <rect x="7" y="22" width="46" height="24" rx="2" fill="#A0522D"/>
      <!-- Chest lid (slightly open) -->
      <path d="M 5 20 Q 30 5 55 20" fill="#8B4513" stroke="#6B3410" stroke-width="1"/>
      <path d="M 8 20 Q 30 8 52 20" fill="#A0522D"/>
      <!-- Gold gleam inside -->
      <ellipse cx="30" cy="18" rx="15" ry="5" fill="#FFD700" opacity="0.8"/>
      <ellipse cx="30" cy="18" rx="10" ry="3" fill="#FFF8DC" opacity="0.5"/>
      <!-- Lock -->
      <rect x="26" y="28" width="8" height="8" rx="1" fill="#FFD700"/>
      <circle cx="30" cy="31" r="2" fill="#8B4513"/>
      <!-- Metal bands -->
      <line x1="5" y1="30" x2="55" y2="30" stroke="#6B3410" stroke-width="2"/>
      <line x1="5" y1="40" x2="55" y2="40" stroke="#6B3410" stroke-width="2"/>
      <!-- Sparkles -->
      <circle cx="20" cy="15" r="1.5" fill="#FFF" opacity="0.8">
        <animate attributeName="opacity" values="0.8;0.2;0.8" dur="1.5s" repeatCount="indefinite"/>
      </circle>
      <circle cx="38" cy="12" r="1" fill="#FFF" opacity="0.6">
        <animate attributeName="opacity" values="0.6;0.1;0.6" dur="2s" repeatCount="indefinite"/>
      </circle>
      <circle cx="28" cy="10" r="1.2" fill="#FFF" opacity="0.7">
        <animate attributeName="opacity" values="0.7;0.2;0.7" dur="1.8s" repeatCount="indefinite"/>
      </circle>
    </svg>`;
  }

  function createSeafloorSVG(width) {
    // Procedural rocky/sandy bottom
    let rockPath = `M 0 40`;
    const steps = Math.ceil(width / 30);
    for (let i = 0; i <= steps; i++) {
      const x = i * 30;
      const y = 20 + Math.sin(i * 0.8) * 12 + Math.random() * 8;
      rockPath += ` L ${x} ${y}`;
    }
    rockPath += ` L ${width} 60 L 0 60 Z`;

    return `
    <svg width="${width}" height="60" viewBox="0 0 ${width} 60" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="30" width="${width}" height="30" fill="#2c1810"/>
      <path d="${rockPath}" fill="#3d2817"/>
      <path d="${rockPath}" fill="#4a3520" opacity="0.5" transform="translate(0, 5)"/>
      <!-- Sand speckles -->
      ${[...Array(20)].map(() => {
      const x = Math.random() * width;
      const y = 35 + Math.random() * 20;
      return `<circle cx="${x}" cy="${y}" r="${1 + Math.random()}" fill="rgba(194,178,128,0.3)"/>`;
    }).join('')}
    </svg>`;
  }

  function createBackgroundWhaleSVG() {
    return `
    <svg viewBox="0 0 240 90" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M18 44 Q42 20 98 22 Q170 24 212 40 Q224 44 228 50 Q216 58 202 60 Q168 66 112 66 Q48 66 18 44 Z" fill="rgba(12, 28, 40, 0.9)"/>
      <path d="M210 36 L236 24 L226 42 L236 58 L210 50 Z" fill="rgba(14, 33, 48, 0.92)"/>
      <path d="M118 22 L136 6 L142 22 Z" fill="rgba(18, 39, 56, 0.85)"/>
    </svg>`;
  }

  function createBackgroundSchoolSVG() {
    const fish = Array(8).fill(0).map((_, i) => {
      const x = 18 + i * 28;
      const y = 18 + (i % 2 === 0 ? 0 : 8);
      return `<path d="M ${x} ${y} Q ${x + 10} ${y - 6} ${x + 20} ${y} Q ${x + 10} ${y + 6} ${x} ${y} Z" fill="rgba(25, 55, 75, 0.8)"/>`;
    }).join('');
    return `<svg viewBox="0 0 260 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${fish}</svg>`;
  }

  function createBackgroundRuinSVG() {
    return `
    <svg viewBox="0 0 260 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M10 130 L10 64 L42 58 L42 130 Z" fill="rgba(20, 37, 46, 0.75)"/>
      <path d="M62 130 L62 44 L106 36 L106 130 Z" fill="rgba(24, 45, 56, 0.76)"/>
      <path d="M126 130 L126 78 L170 70 L170 130 Z" fill="rgba(18, 32, 44, 0.75)"/>
      <path d="M190 130 L190 52 L240 46 L240 130 Z" fill="rgba(20, 40, 52, 0.78)"/>
      <path d="M0 130 L260 130 L260 140 L0 140 Z" fill="rgba(13, 25, 34, 0.8)"/>
    </svg>`;
  }

  function createParallaxBackgrounds() {
    const backLayer = document.getElementById('parallax-back');
    const midLayer = document.getElementById('parallax-mid');
    backLayer.innerHTML = '';
    midLayer.innerHTML = '';

    for (let i = 0; i < 5; i++) {
      const whale = document.createElement('div');
      whale.className = 'bg-drifter whale-silhouette';
      whale.innerHTML = createBackgroundWhaleSVG();
      whale.style.width = (280 + Math.random() * 220) + 'px';
      whale.style.left = (Math.random() * 100) + '%';
      whale.style.top = (WORLD_HEIGHT * 0.28 + Math.random() * WORLD_HEIGHT * 0.62) + 'px';
      whale.style.opacity = (0.24 + Math.random() * 0.16).toFixed(2);
      const dir = Math.random() > 0.5 ? 1 : -1;
      whale.dataset.speed = String((0.08 + Math.random() * 0.16) * dir);
      whale.dataset.baseY = String(parseFloat(whale.style.top));
      whale.dataset.phase = String(Math.random() * Math.PI * 2);
      whale.dataset.driftAmp = String(5 + Math.random() * 10);
      backLayer.appendChild(whale);
    }

    for (let i = 0; i < 10; i++) {
      const school = document.createElement('div');
      school.className = 'bg-drifter school-silhouette';
      school.innerHTML = createBackgroundSchoolSVG();
      school.style.width = (180 + Math.random() * 140) + 'px';
      school.style.left = (Math.random() * 100) + '%';
      school.style.top = (WORLD_HEIGHT * 0.22 + Math.random() * WORLD_HEIGHT * 0.66) + 'px';
      school.style.opacity = (0.18 + Math.random() * 0.14).toFixed(2);
      const dir = Math.random() > 0.5 ? 1 : -1;
      school.dataset.speed = String((0.16 + Math.random() * 0.2) * dir);
      school.dataset.baseY = String(parseFloat(school.style.top));
      school.dataset.phase = String(Math.random() * Math.PI * 2);
      school.dataset.driftAmp = String(3 + Math.random() * 7);
      backLayer.appendChild(school);
    }

    for (let i = 0; i < 7; i++) {
      const ruin = document.createElement('div');
      ruin.className = 'bg-reef-silhouette';
      ruin.innerHTML = createBackgroundRuinSVG();
      ruin.style.width = (180 + Math.random() * 120) + 'px';
      ruin.style.left = (i * 16 + Math.random() * 8) + '%';
      ruin.style.top = (WORLD_HEIGHT * 0.48 + Math.random() * WORLD_HEIGHT * 0.46) + 'px';
      ruin.style.opacity = (0.2 + Math.random() * 0.2).toFixed(2);
      midLayer.appendChild(ruin);
    }
  }

  function createKrakenSVG(scale = 1, coreColor = '#8e44ad', edgeColor = '#2c3e50') {
    const w = 150 * scale;
    const h = 150 * scale;
    return `
    <svg width="${w}" height="${h}" viewBox="0 0 150 150" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="krakenGrad${coreColor.replace('#', '')}" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="${coreColor}"/>
          <stop offset="100%" stop-color="${edgeColor}"/>
        </radialGradient>
      </defs>
      
      <path d="M 75 10 Q 120 20 100 70 Q 75 90 50 70 Q 30 20 75 10" fill="url(#krakenGrad${coreColor.replace('#', '')})"/>
      <ellipse cx="66" cy="64" rx="6" ry="5" fill="#0b0f14"/>
      <ellipse cx="84" cy="64" rx="6" ry="5" fill="#0b0f14"/>
      <path d="M 70 82 L 80 82 L 75 92 Z" fill="#d4a84f"/>

      ${[40, 55, 75, 95, 110].map((x, i) => `
        <path d="M ${x} 80 Q ${x - 20 + i * 10} 120 ${x + 10 - i * 5} 140 Q ${x} 150 ${x - 10 + i * 5} 145" 
              fill="none" stroke="${coreColor}" stroke-width="${12 - Math.abs(2 - i) * 2}" stroke-linecap="round">
          <animate attributeName="d" 
            values="M ${x} 80 Q ${x - 20 + i * 10} 120 ${x + 10 - i * 5} 140 Q ${x} 150 ${x - 10 + i * 5} 145;
                    M ${x} 80 Q ${x + 20 - i * 10} 110 ${x - 10 + i * 5} 145 Q ${x} 150 ${x + 10 - i * 5} 140;
                    M ${x} 80 Q ${x - 20 + i * 10} 120 ${x + 10 - i * 5} 140 Q ${x} 150 ${x - 10 + i * 5} 145"
            dur="${2 + i * 0.3}s" repeatCount="indefinite"/>
        </path>
      `).join('')}
    </svg>`;
  }

  function createEelSVG(scale = 1, skinColor = '#27ae60') {
    const w = 180 * scale;
    const h = 40 * scale;
    return `
    <svg width="${w}" height="${h}" viewBox="0 0 180 40" xmlns="http://www.w3.org/2000/svg">
      <!-- Snake body -->
      <path d="M 10 20 Q 30 5 50 20 T 90 20 T 130 20 T 170 20" fill="none" class="eel-body" stroke="${skinColor}" stroke-width="15" stroke-linecap="round">
        <animate attributeName="d" 
          values="M 10 20 Q 30 5 50 20 T 90 20 T 130 20 T 170 20;
                  M 10 20 Q 30 35 50 20 T 90 20 T 130 20 T 170 20;
                  M 10 20 Q 30 5 50 20 T 90 20 T 130 20 T 170 20"
          dur="1s" repeatCount="indefinite"/>
      </path>
      
      <!-- Head -->
      <ellipse cx="160" cy="20" rx="15" ry="10" fill="${skinColor}" />
      <circle cx="165" cy="17" r="3" fill="#e74c3c"/>
      <circle cx="166" cy="17" r="1.5" fill="#111"/>

      <!-- Mouth & Teeth -->
      <path d="M 170 20 L 175 22 L 172 26" fill="none" stroke="#fff" stroke-width="1"/>
      <path d="M 155 24 Q 165 26 175 22" fill="none" stroke="#111" stroke-width="2"/>
    </svg>`;
  }

  function createBarracudaSVG(scale = 1, bodyColor = '#95a5a6') {
    const w = 140 * scale;
    const h = 40 * scale;
    return `
    <svg width="${w}" height="${h}" viewBox="0 0 140 40" xmlns="http://www.w3.org/2000/svg">
      <path d="M 10 20 Q 30 8 95 10 Q 125 11 130 20 Q 125 29 95 30 Q 30 32 10 20 Z" fill="${bodyColor}"/>
      <path d="M 10 20 L 0 10 L 0 30 Z" fill="#7f8c8d"/>
      <circle cx="108" cy="17" r="3.2" fill="#fff"/>
      <circle cx="109" cy="17" r="1.8" fill="#1f2937"/>
      <path d="M 100 23 L 114 23" stroke="#1f2937" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
  }

  function createMantaSVG(scale = 1, topColor = '#2c3e50', underColor = '#34495e') {
    const w = 150 * scale;
    const h = 70 * scale;
    return `
    <svg width="${w}" height="${h}" viewBox="0 0 150 70" xmlns="http://www.w3.org/2000/svg">
      <path d="M 8 36 Q 45 5 76 16 Q 108 5 144 36 Q 108 46 76 56 Q 45 46 8 36 Z" fill="${topColor}"/>
      <path d="M 28 37 Q 76 48 124 37 Q 76 62 28 37 Z" fill="${underColor}" opacity="0.65"/>
      <path d="M 72 34 Q 76 40 80 34" stroke="#111827" stroke-width="2" fill="none"/>
      <circle cx="66" cy="30" r="2" fill="#111827"/>
      <circle cx="84" cy="30" r="2" fill="#111827"/>
    </svg>`;
  }

  function createAnglerSVG(scale = 1, bodyColor = '#4b5563', lureColor = '#f7d066') {
    const w = 90 * scale;
    const h = 56 * scale;
    return `
    <svg width="${w}" height="${h}" viewBox="0 0 90 56" xmlns="http://www.w3.org/2000/svg">
      <path d="M 8 30 Q 20 12 44 12 Q 72 12 82 28 Q 72 44 44 44 Q 20 44 8 30 Z" fill="${bodyColor}"/>
      <path d="M 8 30 L 0 20 L 0 40 Z" fill="#374151"/>
      <path d="M 40 15 Q 52 0 60 8" stroke="#9ca3af" stroke-width="2.2" fill="none"/>
      <circle cx="62" cy="8" r="4" fill="${lureColor}" opacity="0.9"/>
      <circle cx="58" cy="24" r="4" fill="#fff"/>
      <circle cx="59" cy="24" r="2" fill="#111827"/>
      <path d="M 55 33 L 72 33" stroke="#111827" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
  }

  // ---- INIT ----
  function init() {
    gameWorld.style.height = WORLD_HEIGHT + 'px';

    diver.x = VIEW_WIDTH() / 2 - DIVER_SIZE / 2;
    diver.y = 80;

    createDiver();
    createSeafloor();
    createKelp();
    createTreasure();
    createPredators();
    createLightRays();
    createAmbientParticles();
    createParallaxBackgrounds();

    setupInput();
    updateBackground(0);

    // Hide objective after 4s
    setTimeout(() => objectiveBanner.classList.remove('show'), 4000);

    // Create message overlay
    const msgEl = document.createElement('div');
    msgEl.id = 'message-overlay';
    container.appendChild(msgEl);

    requestAnimationFrame(gameLoop);
  }

  // ---- CREATE GAME OBJECTS ----

  function createDiver() {
    const el = document.createElement('div');
    el.className = 'diver idle';
    el.id = 'diver';
    el.innerHTML = createDiverSVG();
    gameWorld.appendChild(el);
  }

  function createSeafloor() {
    const el = document.createElement('div');
    el.id = 'seafloor';
    el.style.position = 'absolute';
    el.style.bottom = '0';
    el.style.left = '0';
    el.style.width = '100%';
    el.innerHTML = createSeafloorSVG(Math.max(VIEW_WIDTH(), 1920));
    gameWorld.appendChild(el);
  }

  function createKelp() {
    const kelpCount = Math.floor(VIEW_WIDTH() / 100);
    for (let i = 0; i < kelpCount; i++) {
      const group = document.createElement('div');
      group.className = 'kelp-group';
      const height = 120 + Math.random() * 180;
      group.innerHTML = createKelpSVG(height);
      group.style.left = (i * 100 + Math.random() * 60) + 'px';
      group.style.bottom = '20px';
      group.style.position = 'absolute';

      const strand = group.querySelector('svg');
      if (strand) {
        strand.classList.add('kelp-strand');
        strand.style.animationDuration = (3 + Math.random() * 3) + 's';
        strand.style.animationDelay = (Math.random() * 2) + 's';
      }

      gameWorld.appendChild(group);
    }
  }

  function createTreasure() {
    const el = document.createElement('div');
    el.className = 'treasure';
    el.id = 'treasure';
    el.innerHTML = createTreasureSVG();
    el.style.left = (VIEW_WIDTH() / 2 - 30) + 'px';
    el.style.top = (WORLD_HEIGHT - 100) + 'px';
    gameWorld.appendChild(el);
  }

  function createPredators() {
    predators = [];

    // Distribution across depth zones
    const predatorDefs = [
      // Surface / Shallows: small fish schools everywhere
      { type: 'fish', y: WORLD_HEIGHT * 0.10, speed: 1.2, scale: 1 },
      { type: 'fish', y: WORLD_HEIGHT * 0.13, speed: -1.6, scale: 1 },
      { type: 'fish', y: WORLD_HEIGHT * 0.15, speed: 2.2, scale: 1 },
      { type: 'fish', y: WORLD_HEIGHT * 0.18, speed: -1.0, scale: 1 },
      { type: 'fish', y: WORLD_HEIGHT * 0.20, speed: 1.5, scale: 1 },
      { type: 'fish', y: WORLD_HEIGHT * 0.23, speed: -2.0, scale: 1 },
      { type: 'fish', y: WORLD_HEIGHT * 0.25, speed: 1.8, scale: 1 },
      { type: 'fish', y: WORLD_HEIGHT * 0.28, speed: -2.5, scale: 1 },
      { type: 'fish', y: WORLD_HEIGHT * 0.31, speed: 0.8, scale: 1 },
      { type: 'fish', y: WORLD_HEIGHT * 0.33, speed: 3.0, scale: 1 },

      // Mid-water: Mixed sharks, pufferfish, and schools
      { type: 'shark', y: WORLD_HEIGHT * 0.35, speed: 1.5, scale: 0.9, colors: ['#5a6e82', '#6b8299'] }, // Standard
      { type: 'shark', y: WORLD_HEIGHT * 0.38, speed: -1.8, scale: 1.0, colors: ['#7f8c8d', '#95a5a6'] }, // Gray
      { type: 'barracuda', y: WORLD_HEIGHT * 0.40, speed: 2.6, scale: 1.0, colors: ['#95a5a6'] },
      { type: 'puffer', y: WORLD_HEIGHT * 0.42, speed: 1.2, scale: 0.8, colors: ['#f39c12', '#f1c40f'] },
      { type: 'shark', y: WORLD_HEIGHT * 0.45, speed: 2.0, scale: 1.1, colors: ['#34495e', '#2c3e50'] }, // Dark
      { type: 'fish', y: WORLD_HEIGHT * 0.47, speed: -2.3, scale: 1 },
      { type: 'angler', y: WORLD_HEIGHT * 0.49, speed: -1.4, scale: 1.0, colors: ['#475569', '#f1c40f'] },
      { type: 'eel', y: WORLD_HEIGHT * 0.50, speed: 3.5, scale: 1.0, colors: ['#27ae60'] }, // Green
      { type: 'shark', y: WORLD_HEIGHT * 0.52, speed: -2.3, scale: 1.2, colors: ['#e74c3c', '#c0392b'] }, // Aggressive red
      { type: 'puffer', y: WORLD_HEIGHT * 0.55, speed: -1.5, scale: 1.0, colors: ['#e67e22', '#d35400'] }, // Orange
      { type: 'manta', y: WORLD_HEIGHT * 0.57, speed: 1.6, scale: 1.1, colors: ['#2c3e50', '#4b5563'] },

      // Deep: Tense, larger predators, colorful bioluminescence 
      { type: 'eel', y: WORLD_HEIGHT * 0.60, speed: -4.0, scale: 1.2, colors: ['#8e44ad'] }, // Purple eel
      { type: 'angler', y: WORLD_HEIGHT * 0.62, speed: 1.4, scale: 1.2, colors: ['#1f2937', '#f39c12'] },
      { type: 'shark', y: WORLD_HEIGHT * 0.65, speed: 2.8, scale: 1.5, colors: ['#2c3e50', '#1a252f'] }, // Massive dark shark
      { type: 'barracuda', y: WORLD_HEIGHT * 0.67, speed: -3.4, scale: 1.1, colors: ['#7f8c8d'] },
      { type: 'eel', y: WORLD_HEIGHT * 0.70, speed: 4.5, scale: 1.4, colors: ['#e74c3c'] }, // Blood red eel
      { type: 'puffer', y: WORLD_HEIGHT * 0.72, speed: -1.6, scale: 1.3, colors: ['#9b59b6', '#8e44ad'] }, // Purple puffer
      { type: 'shark', y: WORLD_HEIGHT * 0.75, speed: 2.5, scale: 1.6, colors: ['#111', '#222'] }, // Nearly black shark
      { type: 'kraken', y: WORLD_HEIGHT * 0.78, speed: 1.0, scale: 1.1, colors: ['#8e44ad', '#2c3e50'] }, // Standard kraken
      { type: 'jelly', y: WORLD_HEIGHT * 0.80, speed: -0.8, scale: 1.0, colors: ['180, 120, 255', '200, 150, 255'] }, // Purple Jelly

      // Abyss: Overwhelming, giant, terrifying variants
      { type: 'jelly', y: WORLD_HEIGHT * 0.82, speed: 1.2, scale: 1.5, colors: ['255, 100, 100', '255, 150, 150'] }, // Red Jelly
      { type: 'eel', y: WORLD_HEIGHT * 0.84, speed: -5.0, scale: 2.0, colors: ['#f1c40f'] }, // Lightning yellow eel
      { type: 'shark', y: WORLD_HEIGHT * 0.86, speed: -3.5, scale: 2.2, colors: ['#000', '#111'] }, // Leviathan shark
      { type: 'kraken', y: WORLD_HEIGHT * 0.88, speed: -1.2, scale: 1.8, colors: ['#c0392b', '#000'] }, // HUGE red kraken
      { type: 'manta', y: WORLD_HEIGHT * 0.90, speed: 1.7, scale: 1.9, colors: ['#111827', '#374151'] },
      { type: 'angler', y: WORLD_HEIGHT * 0.91, speed: -1.8, scale: 1.4, colors: ['#111827', '#f4d03f'] },
      { type: 'jelly', y: WORLD_HEIGHT * 0.92, speed: -0.6, scale: 2.0, colors: ['100, 255, 150', '150, 255, 200'] }, // Green Jelly
      { type: 'barracuda', y: WORLD_HEIGHT * 0.93, speed: -4.2, scale: 1.6, colors: ['#bdc3c7'] },
      { type: 'eel', y: WORLD_HEIGHT * 0.94, speed: 5.5, scale: 2.5, colors: ['#2980b9'] }, // Giant blue eel
      { type: 'shark', y: WORLD_HEIGHT * 0.96, speed: 4.0, scale: 2.5, colors: ['#c0392b', '#8e44ad'] }, // Abyssal horror shark
      { type: 'puffer', y: WORLD_HEIGHT * 0.97, speed: -2.8, scale: 1.5, colors: ['#7f8c8d', '#e74c3c'] },
      { type: 'kraken', y: WORLD_HEIGHT * 0.98, speed: 1.5, scale: 2.2, colors: ['#000', '#222'] }, // Shadow kraken
    ];

    predatorDefs.forEach((def, i) => {
      const el = document.createElement('div');
      el.className = 'predator';

      let svg, w, h;
      switch (def.type) {
        case 'shark':
          svg = createSharkSVG(def.scale, def.colors ? def.colors[0] : undefined, def.colors ? def.colors[1] : undefined);
          w = 100 * def.scale; h = 60 * def.scale;
          break;
        case 'kraken':
          svg = createKrakenSVG(def.scale, def.colors ? def.colors[0] : undefined, def.colors ? def.colors[1] : undefined);
          w = 150 * def.scale; h = 150 * def.scale;
          break;
        case 'eel':
          svg = createEelSVG(def.scale, def.colors ? def.colors[0] : undefined);
          w = 180 * def.scale; h = 40 * def.scale;
          break;
        case 'puffer':
          svg = createPufferfishSVG(def.scale, def.colors ? def.colors[0] : undefined, def.colors ? def.colors[1] : undefined);
          w = 50 * def.scale; h = 50 * def.scale;
          break;
        case 'jelly':
          svg = createJellyfishSVG(def.scale, def.colors ? def.colors[0] : undefined, def.colors ? def.colors[1] : undefined);
          w = 50 * def.scale; h = 70 * def.scale;
          break;
        case 'barracuda':
          svg = createBarracudaSVG(def.scale, def.colors ? def.colors[0] : undefined);
          w = 140 * def.scale; h = 40 * def.scale;
          break;
        case 'manta':
          svg = createMantaSVG(def.scale, def.colors ? def.colors[0] : undefined, def.colors ? def.colors[1] : undefined);
          w = 150 * def.scale; h = 70 * def.scale;
          break;
        case 'angler':
          svg = createAnglerSVG(def.scale, def.colors ? def.colors[0] : undefined, def.colors ? def.colors[1] : undefined);
          w = 90 * def.scale; h = 56 * def.scale;
          break;
        case 'fish':
          // Small school of fish
          svg = Array(5).fill(0).map((_, j) => {
            const colors = ['#6b7c93', '#4a5f73', '#5c7085', '#7f8c8d', '#566573'];
            return `<div class="small-fish" style="position:absolute; left:${j * 22}px; top:${Math.sin(j) * 8}px; animation: school-swim ${1 + j * 0.2}s ease-in-out infinite ${j * 0.15}s">${createSmallFishSVG(colors[Math.floor(Math.random() * colors.length)])}</div>`;
          }).join('');
          w = 120; h = 30;
          el.innerHTML = svg;
          break;
        default:
          svg = createSharkSVG(def.scale);
          w = 100 * def.scale; h = 60 * def.scale;
      }

      if (def.type !== 'fish') {
        el.innerHTML = svg;
      }

      const startX = def.speed > 0 ? -w : VIEW_WIDTH();

      const pred = {
        el,
        x: startX,
        y: def.y,
        baseY: def.y,
        vx: def.speed,
        w, h,
        type: def.type,
        phase: Math.random() * Math.PI * 2
      };

      el.style.left = pred.x + 'px';
      el.style.top = pred.y + 'px';

      if (def.speed < 0) {
        el.classList.add('facing-left');
      }

      gameWorld.appendChild(el);
      predators.push(pred);
    });
  }

  function createLightRays() {
    const count = 8;
    for (let i = 0; i < count; i++) {
      const ray = document.createElement('div');
      ray.className = 'light-ray';
      ray.style.left = (Math.random() * 100) + '%';
      ray.style.height = (150 + Math.random() * 300) + 'px';
      ray.style.width = (1 + Math.random() * 3) + 'px';
      ray.style.animationDelay = (Math.random() * 6) + 's';
      ray.style.animationDuration = (4 + Math.random() * 4) + 's';
      ray.style.opacity = 0.1 + Math.random() * 0.15;
      gameWorld.appendChild(ray);
    }
  }

  function createAmbientParticles() {
    const count = 30;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.left = (Math.random() * 100) + '%';
      p.style.top = (Math.random() * WORLD_HEIGHT) + 'px';
      p.style.width = p.style.height = (2 + Math.random() * 3) + 'px';
      p.style.animationDelay = (Math.random() * 12) + 's';
      p.style.animationDuration = (8 + Math.random() * 8) + 's';
      gameWorld.appendChild(p);
    }
  }

  // ---- INPUT ----
  function setupInput() {
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (keys.hasOwnProperty(key)) keys[key] = true;
    });
    window.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      if (keys.hasOwnProperty(key)) keys[key] = false;
    });
  }

  // ---- GAME LOOP ----
  function gameLoop() {
    if (!updateGameFrame()) return;
    requestAnimationFrame(gameLoop);
  }

  function updateGameFrame() {
    if (diver.dead) return false;
    frameCount++;
    updateDiver();
    updatePredators();
    updateCamera();
    updateParallax();
    updateBackground(diver.y / WORLD_HEIGHT);
    updateHUD();
    checkCollisions();
    if (frameCount % 3 === 0) spawnBubbles();
    cleanBubbles();
    return true;
  }

  function updateParallax() {
    document.getElementById('parallax-back').style.transform = `translateY(${cameraY * 0.8}px)`;
    document.getElementById('parallax-mid').style.transform = `translateY(${cameraY * 0.5}px)`;

    // Shift drifting silhouettes slowly horizontally.
    const silhouettes = document.querySelectorAll('.bg-drifter');
    silhouettes.forEach((s) => {
      const currentLeft = parseFloat(s.style.left) || 0;
      const speed = parseFloat(s.dataset.speed || '0');
      let newLeft = currentLeft + speed;

      // wrap around
      if (newLeft > 110 && speed > 0) newLeft = -20;
      if (newLeft < -20 && speed < 0) newLeft = 110;

      s.style.left = newLeft + '%';

      const baseY = parseFloat(s.dataset.baseY || s.style.top || '0');
      const phase = parseFloat(s.dataset.phase || '0');
      const driftAmp = parseFloat(s.dataset.driftAmp || '0');
      s.style.top = (baseY + Math.sin(frameCount * 0.01 + phase) * driftAmp) + 'px';
    });
  }

  function updateDiver() {
    if (diver.won || diver.dead) return;

    // Apply input velocities
    let ax = 0, ay = 0;
    if (keys.a) ax -= DIVER_SPEED;
    if (keys.d) ax += DIVER_SPEED;
    if (keys.w) ay -= DIVER_SPEED;
    if (keys.s) ay += DIVER_SPEED;

    diver.vx += ax * 0.3;
    diver.vy += ay * 0.3;

    // Water friction
    diver.vx *= FRICTION;
    diver.vy *= FRICTION;

    // Slight sinking in deep water
    const depthFrac = diver.y / WORLD_HEIGHT;
    diver.vy += depthFrac * 0.03;

    diver.x += diver.vx;
    diver.y += diver.vy;

    // Clamp
    diver.x = Math.max(0, Math.min(VIEW_WIDTH() - DIVER_SIZE, diver.x));
    diver.y = Math.max(10, Math.min(WORLD_HEIGHT - 120, diver.y));

    // Facing direction and rotation logic based on movement vector
    if (Math.abs(diver.vx) > 0.1 || Math.abs(diver.vy) > 0.1) {
      // Calculate velocity angle
      const targetAngle = Math.atan2(diver.vy, diver.vx) * (180 / Math.PI);

      // Default horizontal facing state (the SVG is facing right by default)
      if (keys.a && !keys.d) {
        diver.facingLeft = true;
      } else if (keys.d && !keys.a) {
        diver.facingLeft = false;
      }

      // Smoothly rotate visual representation towards velocity vector
      // If facing left, we mirror it in CSS, so the base SVG needs to point based on adjusted vector
      let renderAngle = targetAngle;
      if (diver.facingLeft) {
        if (targetAngle > 0) renderAngle = 180 - targetAngle;
        else renderAngle = -180 - targetAngle;
      }

      // Simple smooth dampening
      // If the angle jumps across the 180/-180 boundary we just snap to avoid spinning
      if (Math.abs(renderAngle - diver.angle) > 90) {
        diver.angle = renderAngle;
      } else {
        diver.angle += (renderAngle - diver.angle) * 0.2;
      }
    } else {
      // Gently return to horizontal when idle
      diver.angle += (0 - diver.angle) * 0.1;
    }

    diver.moving = Math.abs(diver.vx) > 0.5 || Math.abs(diver.vy) > 0.5;

    // Update DOM
    const el = document.getElementById('diver');

    // Position
    el.style.left = diver.x + 'px';
    el.style.top = diver.y + 'px';

    // Transformations (Rotation & Flipping)
    const flipTransform = diver.facingLeft ? 'scaleX(-1)' : 'scaleX(1)';
    const rotateTransform = `rotate(${diver.angle}deg)`;
    el.style.transform = `${flipTransform} ${rotateTransform}`;

    if (diver.moving) {
      el.classList.remove('idle');
    } else {
      el.classList.add('idle');
    }

    // Flashlight Light position
    // Center it on the diver but offset it towards where they are looking
    const beamDisplayX = diver.x + DIVER_SIZE / 2;
    // Account for camera Y
    const beamDisplayY = diver.y + DIVER_SIZE / 2 - cameraY;

    flashlightBeam.style.left = beamDisplayX + 'px';
    flashlightBeam.style.top = beamDisplayY + 'px';

    // Slight jitter to make the flashlight feel like it's scattering in water
    if (diver.y > WORLD_HEIGHT * 0.4) {
      flashlightBeam.style.transform = `scale(${1 + Math.random() * 0.05})`;
    } else {
      flashlightBeam.style.transform = 'scale(1)';
    }

  }

  function updatePredators() {
    // Collect indices to remove if eaten
    const eatenIndices = new Set();

    predators.forEach((p, i) => {
      if (eatenIndices.has(i)) return; // Already eaten

      p.x += p.vx * getPredatorSpeedMultiplier(p);

      // Wrap around screen
      if (p.vx > 0 && p.x > VIEW_WIDTH() + 50) {
        p.x = -p.w - 20;
      } else if (p.vx < 0 && p.x < -p.w - 50) {
        p.x = VIEW_WIDTH() + 20;
      }

      // Per-type movement behavior to increase lane variety.
      if (p.type === 'jelly' || p.type === 'kraken') {
        p.y += Math.sin(frameCount * 0.02 + p.x * 0.01) * 0.5;
      } else if (p.type === 'manta') {
        p.y = p.baseY + Math.sin(frameCount * 0.03 + p.phase) * 18;
      } else if (p.type === 'angler') {
        p.y = p.baseY + Math.sin(frameCount * 0.025 + p.phase) * 8;
      } else if (p.type === 'barracuda') {
        const burst = 1 + Math.max(0, Math.sin(frameCount * 0.06 + p.phase)) * 0.35;
        p.x += p.vx * (burst - 1);
      }

      p.el.style.left = p.x + 'px';
      p.el.style.top = p.y + 'px';

      // Check if predators eat each other (size difference of at least 30%)
      const pRect = { x: p.x, y: p.y, w: p.w, h: p.h };

      predators.forEach((other, j) => {
        if (i === j || eatenIndices.has(j) || other.type === 'fish' || p.type === 'fish') return;

        const otherRect = { x: other.x, y: other.y, w: other.w, h: other.h };

        if (rectsOverlap(pRect, otherRect)) {
          const pArea = p.w * p.h;
          const otherArea = other.w * other.h;

          if (pArea > otherArea * 1.5) {
            // P eats other
            eatenIndices.add(j);
            other.el.style.transition = 'transform 0.2s, opacity 0.2s';
            other.el.style.transform = 'scale(0)';
            other.el.style.opacity = '0';
            setTimeout(() => other.el.remove(), 200);

            // Make eating predator slightly bigger
            p.w *= 1.05;
            p.h *= 1.05;
            p.el.querySelector('svg').style.width = p.w + 'px';
            p.el.querySelector('svg').style.height = p.h + 'px';
          } else if (otherArea > pArea * 1.5) {
            // Other eats P
            eatenIndices.add(i);
            p.el.style.transition = 'transform 0.2s, opacity 0.2s';
            p.el.style.transform = 'scale(0)';
            p.el.style.opacity = '0';
            setTimeout(() => p.el.remove(), 200);

            other.w *= 1.05;
            other.h *= 1.05;
            other.el.querySelector('svg').style.width = other.w + 'px';
            other.el.querySelector('svg').style.height = other.h + 'px';
          }
        }
      });
    });

    // Remove eaten from array
    predators = predators.filter((_, i) => !eatenIndices.has(i));
  }

  function getPredatorSpeedMultiplier(predator) {
    const depthFrac = Math.max(0, Math.min(1, predator.y / WORLD_HEIGHT));
    const deepPressure = Math.max(0, (depthFrac - 0.45) / 0.55);
    let multiplier = 1 + deepPressure * DEEP_PREDATOR_SPEED_BONUS;
    if (diver.hasTreasure) multiplier += TREASURE_ESCAPE_SPEED_BONUS;
    return multiplier;
  }

  function updateCamera() {
    // Camera follows diver vertically, keeping diver in upper third of screen
    const targetCameraY = diver.y - VIEW_HEIGHT() * 0.35;
    cameraY += (targetCameraY - cameraY) * 0.08;
    cameraY = Math.max(0, Math.min(WORLD_HEIGHT - VIEW_HEIGHT(), cameraY));
    gameWorld.style.transform = `translateY(${-cameraY}px)`;
  }

  function updateBackground(depthFrac) {
    depthFrac = Math.max(0, Math.min(1, depthFrac));

    // Find current zone
    let zone = ZONES[0];
    for (const z of ZONES) {
      if (depthFrac >= z.top && depthFrac < z.bot) {
        zone = z;
        break;
      }
    }
    if (depthFrac >= ZONES[ZONES.length - 1].top) zone = ZONES[ZONES.length - 1];

    // Use zone palette to keep each depth band readable.
    waterBg.style.background = `linear-gradient(180deg, ${zone.color1} 0%, ${zone.color2} 100%)`;

    // Vignette gets stronger with depth
    const vigStrength = depthFrac * 0.7;
    depthVignette.style.background = `radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,0,${vigStrength}) 100%)`;

    // Dynamic Lighting Darkness and Flashlight (starts getting very dark past Mid-water)
    if (depthFrac > 0.4) {
      // Linearly increase darkness from 0.4 to 0.8 depth
      let darkOp = (depthFrac - 0.4) / 0.4;
      darkOp = Math.min(1, darkOp);
      const abyssFrac = Math.max(0, (depthFrac - 0.8) / 0.2);
      const abyssLift = 1 - abyssFrac * ABYSS_DARKNESS_REDUCTION;
      darknessLayer.style.opacity = darkOp * DARKNESS_MAX_OPACITY * abyssLift;
      // Turn on the flashlight when it gets dark
      flashlightBeam.style.opacity = darkOp * 0.75;
    } else {
      darknessLayer.style.opacity = 0;
      flashlightBeam.style.opacity = 0;
    }

    // Caustics fade out with depth
    const causticsEl = document.getElementById('caustics-overlay');
    causticsEl.style.opacity = Math.max(0, 1 - depthFrac * 2.5);
  }

  function updateHUD() {
    const depthFrac = Math.max(0, Math.min(1, diver.y / WORLD_HEIGHT));
    const pct = depthFrac * 100;

    depthBarFill.style.width = pct + '%';
    depthBarDiver.style.left = pct + '%';

    // Find zone name
    let zoneName = 'SURFACE';
    for (const z of ZONES) {
      if (depthFrac >= z.top) zoneName = z.label;
    }
    depthLabel.textContent = zoneName;

    // Color the label based on depth
    const hue = 190 - depthFrac * 120;
    const lightness = 80 - depthFrac * 40;
    depthLabel.style.color = `hsl(${hue}, 70%, ${lightness}%)`;
  }

  function checkCollisions() {
    if (diver.invincible || diver.won) return;

    const diverRect = {
      x: diver.x + DIVER_HITBOX_INSET,
      y: diver.y + DIVER_HITBOX_INSET,
      w: DIVER_SIZE - DIVER_HITBOX_INSET * 2,
      h: DIVER_SIZE - DIVER_HITBOX_INSET * 2,
    };

    // Check predator collisions
    for (const p of predators) {
      if (p.type === 'fish') continue; // small fish are harmless decoration

      const predRect = {
        x: p.x + p.w * 0.15,
        y: p.y + p.h * 0.15,
        w: p.w * PREDATOR_HITBOX_SCALE,
        h: p.h * PREDATOR_HITBOX_SCALE,
      };

      if (rectsOverlap(diverRect, predRect)) {
        onDiverHit();
        return;
      }
    }

    // Check treasure pickup
    if (!diver.hasTreasure) {
      const treasureEl = document.getElementById('treasure');
      if (treasureEl) {
        const tx = parseFloat(treasureEl.style.left);
        const ty = parseFloat(treasureEl.style.top);
        const tRect = { x: tx, y: ty, w: 60, h: 50 };

        if (rectsOverlap(diverRect, tRect)) {
          diver.hasTreasure = true;
          playSound('treasure');
          treasureEl.style.animation = 'treasure-grabbed 0.5s ease-out forwards';
          setTimeout(() => treasureEl.remove(), 500);
          showMessage('🏆 GOT IT! Swim back up!', 2000);
          objectiveBanner.querySelector('span').textContent = '🏊 Swim back to the surface!';
          objectiveBanner.classList.add('show');
          setTimeout(() => objectiveBanner.classList.remove('show'), 3000);
        }
      }
    }

    // Check win (return to surface with treasure)
    if (diver.hasTreasure && diver.y < 60) {
      diver.won = true;
      showMessage('🎉 YOU MADE IT! 🎉', 999999);
    }
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function onDiverHit() {
    diver.invincible = true;
    diver.lives -= 1;

    // Update hearts
    const heartEl = document.getElementById(`life-${diver.lives + 1}`);
    if (heartEl) {
      heartEl.classList.add('lost');
    }

    const el = document.getElementById('diver');
    el.classList.add('hit');
    playSound('hit');

    if (diver.lives > 0) {
      showMessage('CHOMP! 🦈', 1000);
      // Knock diver upward
      diver.vy = -8;
      diver.vx = (Math.random() - 0.5) * 10;
      setTimeout(() => {
        el.classList.remove('hit');
        diver.invincible = false;
      }, 1100);
    } else {
      // Game Over
      playSound('gameover');
      diver.dead = true;
      el.classList.remove('hit');
      el.style.display = 'none'; // hide diver
      document.getElementById('game-over-screen').classList.add('show');
    }
  }

  function showMessage(text, duration) {
    const el = document.getElementById('message-overlay');
    el.textContent = text;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), duration);
  }

  // ---- BUBBLES ----
  function spawnBubbles() {
    if (!diver.moving || bubbles.length >= MAX_BUBBLES) return;

    if (Math.random() < BUBBLE_CHANCE) {
      const bub = document.createElement('div');
      bub.className = 'bubble';
      const size = 3 + Math.random() * 6;
      bub.style.width = size + 'px';
      bub.style.height = size + 'px';

      // Emit bubbles from the regulator (the right side of head if facing right)
      let emitX = diver.x + DIVER_SIZE - 5;
      if (diver.facingLeft) {
        emitX = diver.x + 5;
      }

      bub.style.left = (emitX + (Math.random() - 0.5) * 10) + 'px';
      bub.style.top = (diver.y + 10) + 'px';
      bub.style.animationDuration = (1.5 + Math.random() * 2) + 's';
      gameWorld.appendChild(bub);
      bubbles.push({ el: bub, born: frameCount });
      playSound('bubble');
    }
  }

  function cleanBubbles() {
    bubbles = bubbles.filter(b => {
      if (frameCount - b.born > 180) {
        b.el.remove();
        return false;
      }
      return true;
    });
  }

  function renderGameToText() {
    const mode = diver.dead ? 'dead' : (diver.won ? 'won' : 'running');
    const treasureEl = document.getElementById('treasure');
    return JSON.stringify({
      note: 'Coordinates use top-left origin; +x right, +y downward.',
      mode,
      worldHeight: WORLD_HEIGHT,
      cameraY: Math.round(cameraY),
      player: {
        x: Math.round(diver.x),
        y: Math.round(diver.y),
        vx: Number(diver.vx.toFixed(2)),
        vy: Number(diver.vy.toFixed(2)),
        lives: diver.lives,
        hasTreasure: diver.hasTreasure
      },
      treasure: treasureEl ? {
        x: Math.round(parseFloat(treasureEl.style.left) || 0),
        y: Math.round(parseFloat(treasureEl.style.top) || 0)
      } : null,
      predators: predators.map((p) => ({
        type: p.type,
        x: Math.round(p.x),
        y: Math.round(p.y),
        vx: Number(p.vx.toFixed(2)),
        w: Math.round(p.w),
        h: Math.round(p.h)
      }))
    });
  }

  window.render_game_to_text = renderGameToText;
  window.advanceTime = (ms) => {
    const steps = Math.max(1, Math.round(ms / (1000 / 60)));
    for (let i = 0; i < steps; i++) {
      if (!updateGameFrame()) break;
    }
  };

  // ---- START ----
  init();
})();
