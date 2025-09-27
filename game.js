'use strict';

// Simple Doom-style raycaster with textured walls disabled (flat colors).
// P1: WASD/QE + Mouse look, Shift sprint. P2: Arrows + IJKL (optional).

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Internal render resolution for crisp scaling
const INTERNAL_WIDTH = 320;
const INTERNAL_HEIGHT = 180;
const SPLIT = false; // split-screen disabled
canvas.width = INTERNAL_WIDTH;
canvas.height = INTERNAL_HEIGHT;

function resizeCanvas() {
	const ratio = INTERNAL_WIDTH / INTERNAL_HEIGHT;
	const w = window.innerWidth;
	const h = window.innerHeight;
	let cw = w;
	let ch = Math.round(w / ratio);
	if (ch > h) {
		ch = h;
		cw = Math.round(h * ratio);
	}
	canvas.style.width = cw + 'px';
	canvas.style.height = ch + 'px';
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// World map (1 = wall, 0 = empty)
const MAP_W = 16;
const MAP_H = 16;
const MAP = [
	1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
	1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
	1,0,0,0,0,0,0,1,1,1,0,0,0,1,0,1,
	1,0,0,0,0,1,1,1,1,1,1,0,0,1,0,1,
	1,0,0,0,0,1,0,0,0,1,0,0,0,1,0,1,
	1,0,0,0,0,1,0,0,0,1,1,0,0,1,0,1,
	1,0,0,0,0,1,0,0,0,1,0,1,1,1,0,1,
	1,0,0,0,0,1,1,1,1,1,0,1,0,0,0,1,
	1,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1,
	1,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1,
	1,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1,
	1,0,0,0,1,0,0,0,0,0,0,1,0,0,0,1,
	1,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1,
	1,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1,
	1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
	1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1
];

function mapAt(x, y) {
	if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return 1;
	return MAP[y * MAP_W + x];
}

function createPlayer(x, y, angle) {
    return {
        x,
        y,
        angle,
        pitch: 0, // vertical look offset in radians
        fov: Math.PI / 3,
        moveSpeed: 3.0,
        turnSpeed: 2.4
    };
}

const player1 = createPlayer(3.5, 3.5, 0);
const player2 = createPlayer(5.5, 5.5, Math.PI * 0.75);

// Enemies
const enemies = [
	{ x: 8.5, y: 8.5, radius: 0.14, speed: 1.3, health: 3, color: '#c44', scale: 0.55 },
	{ x: 11.5, y: 4.5, radius: 0.14, speed: 1.3, health: 3, color: '#c44', scale: 0.55 }
];

// Casino tables
const casinoTables = [
	{ x: 2.5, y: 2.5, type: 'blackjack', name: 'Blackjack Table', color: '#8B4513', radius: 0.3 },
	{ x: 9.5, y: 9.5, type: 'poker', name: 'Poker Table', color: '#654321', radius: 0.3 },
	{ x: 12.5, y: 6.5, type: 'roulette', name: 'Roulette Wheel', color: '#FFD700', radius: 0.3 },
	{ x: 6.5, y: 12.5, type: 'slots', name: 'Slot Machine', color: '#FF69B4', radius: 0.2 },
	{ x: 9.5, y: 12.5, type: 'craps', name: 'Craps Table', color: '#32CD32', radius: 0.3 },
	{ x: 2.5, y: 14.5, type: 'wavecontrol', name: 'Wave Control', color: '#FF0000', radius: 0.3 }
];

// Shooting state and player stats
const weapon = { cooldown: 0, rate: 0.8, flash: 0, recoil: 0, ammo: 8, maxAmmo: 8 };
let playerHP = 5;
const playerMaxHP = 5;
let playerChips = 10;
let playerScore = 0;
let damageFlash = 0; // red screen tint timer
let paused = false; // pause when menus are open
let roundCompleteMessage = 0; // timer for round complete message

// Casino game UI state
let casinoGameOpen = false;
let currentCasinoGame = null;
let casinoGameResult = null;
let casinoGameResultTimer = 0;

// Blackjack table state
let blackjackTableOpen = false;
let blackjackTableGame = {
    playerHand: [],
    dealerHand: [],
    playerTotal: 0,
    dealerTotal: 0,
    gameState: 'waiting', // waiting, playing, finished
    bet: 1,
    shoe: []
};

// Casino/Wave system
let currentWave = 1;
let enemiesKilled = 0;
let enemiesToKill = 5; // enemies needed to complete wave
let waveInProgress = true;
let waveStartTime = 0;
let nextWaveDelay = 3; // seconds between waves

// Player upgrades
const upgrades = {
    damage: 1,      // damage multiplier
    fireRate: 1,    // fire rate multiplier  
    maxHP: 5,       // max health
    ammoCapacity: 8, // max ammo
    speed: 1        // movement speed multiplier
};

const keys = new Set();
window.addEventListener('keydown', (e) => {
	keys.add(e.key);
});
window.addEventListener('keyup', (e) => {
	keys.delete(e.key);
});

function isWallAt(x, y) {
    return mapAt(Math.floor(x), Math.floor(y)) > 0;
}

function canMoveTo(x, y, radius) {
    // Check four corners of the player's circle against walls
    if (isWallAt(x - radius, y - radius)) return false;
    if (isWallAt(x + radius, y - radius)) return false;
    if (isWallAt(x - radius, y + radius)) return false;
    if (isWallAt(x + radius, y + radius)) return false;
    return true;
}

function tryMove(playerRef, nx, ny) {
    const radius = 0.18;
    let dx = nx - playerRef.x;
    let dy = ny - playerRef.y;

    // Sub-step movement to avoid tunneling at high speeds
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.1));
    const stepX = dx / steps;
    const stepY = dy / steps;

    for (let i = 0; i < steps; i++) {
        // Move along X axis first
        const px = playerRef.x + stepX;
        if (canMoveTo(px, playerRef.y, radius)) {
            playerRef.x = px;
        }
        // Then Y axis
        const py = playerRef.y + stepY;
        if (canMoveTo(playerRef.x, py, radius)) {
            playerRef.y = py;
        }
    }
}

function updatePlayerFromKeys(p, dt, keyMap) {
    const speed = p.moveSpeed; // sprint disabled
    const turn = p.turnSpeed;
    if (keyMap.turnLeft()) p.angle -= turn * dt;
    if (keyMap.turnRight()) p.angle += turn * dt;

    let forward = 0;
    let strafe = 0;
    if (keyMap.forward()) forward += 1;
    if (keyMap.backward()) forward -= 1;
    if (keyMap.strafeLeft()) strafe -= 1;
    if (keyMap.strafeRight()) strafe += 1;

    if (forward !== 0 || strafe !== 0) {
        const sin = Math.sin(p.angle);
        const cos = Math.cos(p.angle);
        const dx = (cos * forward - sin * strafe) * speed * dt;
        const dy = (sin * forward + cos * strafe) * speed * dt;
        tryMove(p, p.x + dx, p.y + dy);
    }
}

const keyMaps = {
    p1: {
        forward: () => keys.has('w') || keys.has('W'),
        backward: () => keys.has('s') || keys.has('S'),
        strafeLeft: () => keys.has('a') || keys.has('A'),
        strafeRight: () => keys.has('d') || keys.has('D'),
        turnLeft: () => false, // mouse handles look
        turnRight: () => false,
        sprint: () => false
    },
    p2: {
        forward: () => keys.has('i') || keys.has('I'),
        backward: () => keys.has('k') || keys.has('K'),
        strafeLeft: () => keys.has('j') || keys.has('J'),
        strafeRight: () => keys.has('l') || keys.has('L'),
        turnLeft: () => keys.has('ArrowLeft'),
        turnRight: () => keys.has('ArrowRight'),
        sprint: () => false
    }
};

function update(dt) {
    const isPaused = paused || bj.open;
    if (!isPaused) {
        updatePlayerFromKeys(player1, dt, keyMaps.p1);
        if (SPLIT) updatePlayerFromKeys(player2, dt, keyMaps.p2);
    }

	// Enemy simple chase AI toward player1
    if (!isPaused) for (let i = enemies.length - 1; i >= 0; i--) {
		const e = enemies[i];
		const vx = player1.x - e.x;
		const vy = player1.y - e.y;
		const dist = Math.hypot(vx, vy);
		if (dist > 0.0001) {
			const ux = vx / dist;
			const uy = vy / dist;
			const nx = e.x + ux * e.speed * dt;
			const ny = e.y + uy * e.speed * dt;
			// reuse collision checks
			if (canMoveTo(nx, e.y, e.radius * 0.9)) e.x = nx;
			if (canMoveTo(e.x, ny, e.radius * 0.9)) e.y = ny;
		}
		// contact damage simple
		if (Math.hypot(e.x - player1.x, e.y - player1.y) < e.radius + 0.2) {
			playerHP = Math.max(0, playerHP - dt * 0.5);
			damageFlash = Math.max(damageFlash, 0.35);
		}
		// remove dead and drop chips + score
		if (e.health <= 0) { 
			enemies.splice(i, 1); 
			playerChips += 2; 
			playerScore += 100; 
			enemiesKilled++;
		}
	}

    // Weapon cooldown/flash and damage flash
    if (!isPaused) {
        if (weapon.cooldown > 0) weapon.cooldown -= dt;
        if (weapon.flash > 0) weapon.flash -= dt;
        if (weapon.recoil > 0) weapon.recoil -= dt * 3;
        if (damageFlash > 0) damageFlash = Math.max(0, damageFlash - dt * 1.8);
        if (roundCompleteMessage > 0) roundCompleteMessage -= dt;
        if (casinoGameResultTimer > 0) casinoGameResultTimer -= dt;
        
        // Check wave completion
        checkWaveComplete();
    }
}

function castRay(px, py, rayAngle) {
	// DDA raycasting
    const sin = Math.sin(rayAngle);
    const cos = Math.cos(rayAngle);

    let mapX = Math.floor(px);
    let mapY = Math.floor(py);

	const deltaDistX = Math.abs(1 / (cos === 0 ? 1e-6 : cos));
	const deltaDistY = Math.abs(1 / (sin === 0 ? 1e-6 : sin));

	let stepX, stepY;
	let sideDistX, sideDistY;

    if (cos < 0) { stepX = -1; sideDistX = (px - mapX) * deltaDistX; }
    else { stepX = 1; sideDistX = (mapX + 1.0 - px) * deltaDistX; }

    if (sin < 0) { stepY = -1; sideDistY = (py - mapY) * deltaDistY; }
    else { stepY = 1; sideDistY = (mapY + 1.0 - py) * deltaDistY; }

	let hit = 0;
	let side = 0;
	while (!hit && mapX >= 0 && mapY >= 0 && mapX < MAP_W && mapY < MAP_H) {
		if (sideDistX < sideDistY) {
			sideDistX += deltaDistX;
			mapX += stepX;
			side = 0;
		} else {
			sideDistY += deltaDistY;
			mapY += stepY;
			side = 1;
		}
		if (mapAt(mapX, mapY) > 0) hit = 1;
	}

	let perpWallDist;
	if (side === 0) perpWallDist = (sideDistX - deltaDistX);
	else perpWallDist = (sideDistY - deltaDistY);
    return { distance: perpWallDist, side };
}

const depthBuffer = new Float32Array(INTERNAL_WIDTH);

function renderViewport(px, py, angle, fov, pitch, xOffset, width, height) {
    // Clear to sky/ground per viewport, applying pitch offset
    const horizon = Math.floor(height / 2 - pitch * 120);
    ctx.fillStyle = '#2a2f3a';
    ctx.fillRect(xOffset, 0, width, Math.max(0, horizon));
    ctx.fillStyle = '#1a1c20';
    ctx.fillRect(xOffset, Math.max(0, horizon), width, height - Math.max(0, horizon));

    const numRays = width;
    const angleStep = fov / numRays;
    const startAngle = angle - fov / 2;

    for (let x = 0; x < numRays; x++) {
        const rayAngle = startAngle + x * angleStep;
        const result = castRay(px, py, rayAngle);
        let dist = Math.max(0.0001, result.distance);
        const corrected = dist * Math.cos(rayAngle - angle);
        const lineHeight = Math.min(height, Math.floor(height / corrected));
        const drawStart = Math.floor((height - lineHeight) / 2 - pitch * 120);

        const shade = Math.max(0, Math.min(1, 1 - corrected / 12));
        const base = result.side ? 180 : 210;
        const c = Math.floor(base * shade);
        ctx.fillStyle = `rgb(${c}, ${c}, ${c})`;
        ctx.fillRect(xOffset + x, drawStart, 1, lineHeight);

		// write depth buffer for this column
		if (xOffset + x >= 0 && xOffset + x < depthBuffer.length) {
			depthBuffer[xOffset + x] = corrected;
		}
    }
}

function renderEnemies(px, py, angle, fov, pitch, xOffset, width, height) {
	for (const e of enemies) {
		const dx = e.x - px;
		const dy = e.y - py;
		const dist = Math.hypot(dx, dy);
		if (dist < 0.0001) continue;
		const angleTo = Math.atan2(dy, dx);
		let rel = angleTo - angle;
		// normalize to [-PI, PI]
		while (rel > Math.PI) rel -= Math.PI * 2;
		while (rel < -Math.PI) rel += Math.PI * 2;
		// culled if behind FOV with margin
		if (Math.abs(rel) > fov / 2 + 0.2) continue;

		const corrected = dist * Math.cos(rel);
        const scale = e.scale || 1.0;
        const spriteH = Math.min(height, Math.floor((height / corrected) * scale));
        const spriteW = spriteH; // billboard square
		const centerX = Math.floor(xOffset + (rel / fov + 0.5) * width);
		const top = Math.floor((height - spriteH) / 2 - pitch * 120);
		const left = Math.floor(centerX - spriteW / 2);
		const right = Math.floor(centerX + spriteW / 2);

		// color shading by distance
		const shade = Math.max(0, Math.min(1, 1 - corrected / 10));
		let r = 196 * shade;
		let g = 64 * shade;
		let b = 64 * shade;
		ctx.fillStyle = `rgb(${r|0}, ${g|0}, ${b|0})`;

		for (let sx = left; sx <= right; sx++) {
			if (sx < xOffset || sx >= xOffset + width) continue;
			const bufX = sx; // xOffset already applied
			if (bufX < 0 || bufX >= depthBuffer.length) continue;
			if (corrected >= depthBuffer[bufX]) continue; // occluded by wall
			ctx.fillRect(sx, top, 1, spriteH);
		}
	}
}

function renderCasinoTables(px, py, angle, fov, pitch, xOffset, width, height) {
	for (const table of casinoTables) {
		const dx = table.x - px;
		const dy = table.y - py;
		const dist = Math.hypot(dx, dy);
		if (dist < 0.0001) continue;
		const angleTo = Math.atan2(dy, dx);
		let rel = angleTo - angle;
		// normalize to [-PI, PI]
		while (rel > Math.PI) rel -= Math.PI * 2;
		while (rel < -Math.PI) rel += Math.PI * 2;
		// culled if behind FOV with margin
		if (Math.abs(rel) > fov / 2 + 0.2) continue;

		const corrected = dist * Math.cos(rel);
        const scale = 0.8; // Casino tables are larger than enemies
        const spriteH = Math.min(height, Math.floor((height / corrected) * scale));
        const spriteW = spriteH; // billboard square
		const centerX = Math.floor(xOffset + (rel / fov + 0.5) * width);
		const top = Math.floor((height - spriteH) / 2 - pitch * 120);
		const left = Math.floor(centerX - spriteW / 2);
		const right = Math.floor(centerX + spriteW / 2);

		// color shading by distance
		const shade = Math.max(0, Math.min(1, 1 - corrected / 10));
		const baseColor = table.color;
		const r = parseInt(baseColor.substr(1, 2), 16) * shade;
		const g = parseInt(baseColor.substr(3, 2), 16) * shade;
		const b = parseInt(baseColor.substr(5, 2), 16) * shade;
		ctx.fillStyle = `rgb(${r|0}, ${g|0}, ${b|0})`;

		for (let sx = left; sx <= right; sx++) {
			if (sx < xOffset || sx >= xOffset + width) continue;
			const bufX = sx; // xOffset already applied
			if (bufX < 0 || bufX >= depthBuffer.length) continue;
			if (corrected >= depthBuffer[bufX]) continue; // occluded by wall
			ctx.fillRect(sx, top, 1, spriteH);
		}
	}
}

function drawRoundCompleteMessage() {
    if (roundCompleteMessage > 0) {
        const cx = Math.floor(INTERNAL_WIDTH / 2);
        const cy = Math.floor(INTERNAL_HEIGHT / 2);
        
        // Draw background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(cx - 80, cy - 30, 160, 60);
        
        // Draw border
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - 80, cy - 30, 160, 60);
        
        // Draw text
        ctx.fillStyle = 'rgba(255, 255, 0, 1)';
        ctx.font = 'bold 16px JetBrains Mono';
        ctx.textAlign = 'center';
        ctx.fillText('ROUND COMPLETE!', cx, cy - 5);
        
        ctx.font = '12px JetBrains Mono';
        ctx.fillText(`Wave ${currentWave} cleared`, cx, cy + 15);
        ctx.fillText(`+${currentWave * 2} chips`, cx, cy + 30);
    }
}

function drawCasinoGameResult() {
    if (casinoGameResultTimer > 0 && casinoGameResult) {
        const cx = Math.floor(INTERNAL_WIDTH / 2);
        const cy = Math.floor(INTERNAL_HEIGHT / 2);
        
        // Determine colors based on result type
        let bgColor, borderColor, textColor;
        switch (casinoGameResult.type) {
            case 'win':
                bgColor = 'rgba(0, 100, 0, 0.8)';
                borderColor = 'rgba(0, 255, 0, 0.8)';
                textColor = 'rgba(0, 255, 0, 1)';
                break;
            case 'lose':
                bgColor = 'rgba(100, 0, 0, 0.8)';
                borderColor = 'rgba(255, 0, 0, 0.8)';
                textColor = 'rgba(255, 0, 0, 1)';
                break;
            case 'error':
                bgColor = 'rgba(100, 100, 0, 0.8)';
                borderColor = 'rgba(255, 255, 0, 0.8)';
                textColor = 'rgba(255, 255, 0, 1)';
                break;
        }
        
        // Draw background
        ctx.fillStyle = bgColor;
        ctx.fillRect(cx - 100, cy - 25, 200, 50);
        
        // Draw border
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - 100, cy - 25, 200, 50);
        
        // Draw text
        ctx.fillStyle = textColor;
        ctx.font = 'bold 14px JetBrains Mono';
        ctx.textAlign = 'center';
        ctx.fillText(casinoGameResult.message, cx, cy);
        
        // Draw chip count if available
        if (casinoGameResult.chips) {
            ctx.font = '12px JetBrains Mono';
            const chipText = casinoGameResult.chips > 0 ? `+${casinoGameResult.chips} chips` : `${casinoGameResult.chips} chips`;
            ctx.fillText(chipText, cx, cy + 15);
        }
    }
}

function drawBlackjackTable() {
    if (!blackjackTableOpen) return;
    
    const cx = Math.floor(INTERNAL_WIDTH / 2);
    const cy = Math.floor(INTERNAL_HEIGHT / 2);
    
    // Draw table background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(cx - 150, cy - 100, 300, 200);
    
    // Draw table border
    ctx.strokeStyle = 'rgba(139, 69, 19, 0.8)';
    ctx.lineWidth = 3;
    ctx.strokeRect(cx - 150, cy - 100, 300, 200);
    
    // Draw title
    ctx.fillStyle = 'rgba(255, 255, 255, 1)';
    ctx.font = 'bold 16px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.fillText('BLACKJACK TABLE', cx, cy - 80);
    
    // Draw bet info
    ctx.font = '12px JetBrains Mono';
    ctx.fillText(`Bet: ${blackjackTableGame.bet} chips | Your Chips: ${playerChips}`, cx, cy - 60);
    
    // Draw dealer section
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '14px JetBrains Mono';
    ctx.fillText('Dealer:', cx - 100, cy - 30);
    
    // Draw dealer cards
    let dealerX = cx - 100;
    for (let i = 0; i < blackjackTableGame.dealerHand.length; i++) {
        const card = blackjackTableGame.dealerHand[i];
        const cardValue = card === 11 ? 'A' : card.toString();
        
        // Draw card background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillRect(dealerX, cy - 20, 30, 40);
        
        // Draw card border
        ctx.strokeStyle = 'rgba(0, 0, 0, 1)';
        ctx.lineWidth = 1;
        ctx.strokeRect(dealerX, cy - 20, 30, 40);
        
        // Draw card value
        ctx.fillStyle = 'rgba(0, 0, 0, 1)';
        ctx.font = 'bold 12px JetBrains Mono';
        ctx.textAlign = 'center';
        ctx.fillText(cardValue, dealerX + 15, cy + 5);
        
        dealerX += 35;
    }
    
    // Draw dealer total
    if (blackjackTableGame.gameState === 'playing') {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.font = '12px JetBrains Mono';
        ctx.textAlign = 'left';
        ctx.fillText(`Total: ${blackjackTableGame.dealerHand[0]} + ?`, cx - 100, cy + 30);
    } else if (blackjackTableGame.gameState === 'finished') {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.font = '12px JetBrains Mono';
        ctx.textAlign = 'left';
        ctx.fillText(`Total: ${blackjackTableGame.dealerTotal}`, cx - 100, cy + 30);
    }
    
    // Draw player section
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '14px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.fillText('Your Hand:', cx, cy + 50);
    
    // Draw player cards
    let playerX = cx - 50;
    for (let i = 0; i < blackjackTableGame.playerHand.length; i++) {
        const card = blackjackTableGame.playerHand[i];
        const cardValue = card === 11 ? 'A' : card.toString();
        
        // Draw card background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillRect(playerX, cy + 60, 30, 40);
        
        // Draw card border
        ctx.strokeStyle = 'rgba(0, 0, 0, 1)';
        ctx.lineWidth = 1;
        ctx.strokeRect(playerX, cy + 60, 30, 40);
        
        // Draw card value
        ctx.fillStyle = 'rgba(0, 0, 0, 1)';
        ctx.font = 'bold 12px JetBrains Mono';
        ctx.textAlign = 'center';
        ctx.fillText(cardValue, playerX + 15, cy + 85);
        
        playerX += 35;
    }
    
    // Draw player total
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '12px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.fillText(`Total: ${blackjackTableGame.playerTotal}`, cx, cy + 110);
    
    // Draw buttons based on game state
    ctx.font = '12px JetBrains Mono';
    ctx.textAlign = 'center';
    
    if (blackjackTableGame.gameState === 'waiting') {
        ctx.fillStyle = 'rgba(0, 255, 0, 0.8)';
        ctx.fillText('Press SPACE to Deal', cx, cy + 130);
        ctx.fillText('Press ESC to Close', cx, cy + 145);
    } else if (blackjackTableGame.gameState === 'playing') {
        ctx.fillStyle = 'rgba(0, 255, 0, 0.8)';
        ctx.fillText('Press H to Hit, S to Stand', cx, cy + 130);
        ctx.fillText('Press ESC to Close', cx, cy + 145);
    } else if (blackjackTableGame.gameState === 'finished') {
        ctx.fillStyle = 'rgba(255, 255, 0, 0.8)';
        ctx.fillText('Press SPACE for New Hand', cx, cy + 130);
        ctx.fillText('Press ESC to Close', cx, cy + 145);
    }
}

function drawCrosshair() {
    const cx = Math.floor(INTERNAL_WIDTH / 2);
    const cy = Math.floor(INTERNAL_HEIGHT / 2);
    
    // Check if near a table
    const nearbyTable = getNearbyTable();
    if (nearbyTable) {
        // Draw interaction prompt
        ctx.fillStyle = nearbyTable.type === 'wavecontrol' ? 'rgba(255, 0, 0, 0.8)' : 'rgba(255, 255, 0, 0.8)';
        ctx.font = '12px JetBrains Mono';
        ctx.textAlign = 'center';
        
        if (nearbyTable.type === 'wavecontrol') {
            if (!waveInProgress && enemies.length === 0) {
                ctx.fillText(`Press E to start Wave ${currentWave + 1}`, cx, cy - 20);
            } else if (waveInProgress) {
                ctx.fillText(`Wave ${currentWave} in progress`, cx, cy - 20);
            } else {
                ctx.fillText(`Wave Control - Clear enemies first`, cx, cy - 20);
            }
        } else {
            ctx.fillText(`Press E to play ${nearbyTable.name}`, cx, cy - 20);
        }
    }
    
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy);
    ctx.lineTo(cx + 4, cy);
    ctx.moveTo(cx, cy - 4);
    ctx.lineTo(cx, cy + 4);
    ctx.stroke();
}

// Gun sprite data
let gunSprite = null;
let gunSpriteLoaded = false;

function loadGunSprite() {
    const img = new Image();
    img.onload = function() {
        gunSprite = img;
        gunSpriteLoaded = true;
        console.log('Gun sprite loaded successfully');
    };
    img.onerror = function() {
        console.error('Failed to load gun.png, trying fallback sprite');
        // Try to load the original file as fallback
        const fallbackImg = new Image();
        fallbackImg.onload = function() {
            gunSprite = fallbackImg;
            gunSpriteLoaded = true;
            console.log('Fallback gun sprite loaded successfully');
        };
        fallbackImg.onerror = function() {
            console.error('All gun sprites failed to load');
            gunSpriteLoaded = true; // Set to true to prevent infinite loading
        };
        fallbackImg.src = 'sprites/New Piskel-1.png.png';
    };
    img.src = 'sprites/gun.png';
}


function drawGun() {
    // Don't draw if sprite isn't loaded yet
    if (!gunSpriteLoaded) {
        return;
    }
    
    const gunWidth = 100;
    const gunHeight = 75;
    const gunX = Math.floor(INTERNAL_WIDTH - gunWidth - 0); // Position on right side
    const gunY = Math.floor(INTERNAL_HEIGHT - gunHeight - 0);
    
    // Apply recoil offset (shotguns have more kick)
    const recoilOffset = Math.sin(weapon.recoil * Math.PI) * 15;
    const finalGunY = gunY + recoilOffset;
    
    // Draw the gun sprite
    ctx.drawImage(gunSprite, gunX, finalGunY, gunWidth, gunHeight);
    
    // Muzzle flash effect (shotgun spread)
    if (weapon.flash > 0) {
        const flashIntensity = weapon.flash * 2;
        // Wide outer flash (shotgun spread)
        ctx.fillStyle = `rgba(255, 255, 200, ${flashIntensity * 0.6})`;
        ctx.fillRect(gunX + 5, finalGunY + 15, 20, 25);
        // Inner flash
        ctx.fillStyle = `rgba(255, 200, 0, ${flashIntensity})`;
        ctx.fillRect(gunX + 8, finalGunY + 18, 14, 19);
        // Core flash
        ctx.fillStyle = `rgba(255, 100, 0, ${flashIntensity * 1.2})`;
        ctx.fillRect(gunX + 10, finalGunY + 22, 10, 11);
    }
}

function render() {
    if (SPLIT) {
        const halfW = Math.floor(INTERNAL_WIDTH / 2);
        renderViewport(player1.x, player1.y, player1.angle, player1.fov, player1.pitch, 0, halfW, INTERNAL_HEIGHT);
        renderViewport(player2.x, player2.y, player2.angle, player2.fov, player2.pitch, halfW, INTERNAL_WIDTH - halfW, INTERNAL_HEIGHT);
    } else {
        renderViewport(player1.x, player1.y, player1.angle, player1.fov, player1.pitch, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);
    }
    // render sprites/enemies after walls
    if (!SPLIT) {
        renderCasinoTables(player1.x, player1.y, player1.angle, player1.fov, player1.pitch, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);
        renderEnemies(player1.x, player1.y, player1.angle, player1.fov, player1.pitch, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);
    }
    // muzzle flash overlay
    if (weapon.flash > 0) {
    	ctx.fillStyle = `rgba(255,255,200,${Math.min(0.4, weapon.flash * 2)})`;
    	ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);
    }
    // damage flash overlay
    if (damageFlash > 0) {
    	ctx.fillStyle = `rgba(200,0,0,${Math.min(0.45, damageFlash)})`;
    	ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);
    }
    if (!SPLIT) {
        drawCrosshair();
        drawGun();
        drawRoundCompleteMessage();
        drawCasinoGameResult();
        drawBlackjackTable();
    }
}

let last = performance.now();
let fps = 0;
function loop(t) {
	const dt = Math.min(0.05, (t - last) / 1000);
	last = t;
    update(dt);
	render();
    fps = Math.round(1 / dt);
    const stats = document.getElementById('stats');
    if (stats) stats.textContent = `Wave:${currentWave} HP:${Math.ceil(playerHP)} Ammo:${weapon.ammo}/${weapon.maxAmmo} Chips:${playerChips} | Enemies:${enemies.length}/${enemiesToKill} Killed:${enemiesKilled} Score:${playerScore}`;
    const scoreEl = document.getElementById('score');
    if (scoreEl) scoreEl.textContent = `SCORE ${String(playerScore).padStart(6,'0')}`;
    const hpFill = document.getElementById('health-fill');
    const hpText = document.getElementById('health-text');
    if (hpFill) hpFill.style.width = `${Math.max(0, Math.min(1, playerHP / playerMaxHP)) * 100}%`;
    if (hpText) hpText.textContent = `HP ${Math.ceil(playerHP)}/${playerMaxHP}`;
	requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Load gun sprite when game starts
loadGunSprite();

// Start first wave
spawnEnemies();

// Pointer Lock for mouse look (Player 1)
canvas.addEventListener('click', () => {
    if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
});

document.addEventListener('pointerlockchange', () => {
    // no-op; could update UI
});

document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas && !paused && !bj.open) {
        const sensitivityX = 0.0016; // reduced horizontal sensitivity
        const sensitivityY = 0.0020;
        player1.angle += e.movementX * sensitivityX;
        player1.pitch += e.movementY * sensitivityY; // invert Y to feel natural
        const maxPitch = 0.6;
        if (player1.pitch > maxPitch) player1.pitch = maxPitch;
        if (player1.pitch < -maxPitch) player1.pitch = -maxPitch;
    }
});

// Shooting
canvas.addEventListener('mousedown', (e) => {
	if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
	if (e.button === 0 && !paused && !bj.open) {
		tryShoot();
	}
});

function tryShoot() {
	if (weapon.cooldown > 0 || weapon.ammo <= 0) return;
	weapon.cooldown = weapon.rate / upgrades.fireRate; // Apply fire rate upgrade
	weapon.flash = 0.08;
	weapon.recoil = 1.0; // Add recoil animation
	weapon.ammo--; // Consume ammo
	// hitscan along center
	const centerAngle = player1.angle;
	const ray = castRay(player1.x, player1.y, centerAngle);
	const wallDist = Math.max(0.0001, ray.distance);
	let bestIdx = -1;
	let bestDist = Infinity;
	for (let i = 0; i < enemies.length; i++) {
		const e = enemies[i];
		const dx = e.x - player1.x;
		const dy = e.y - player1.y;
		const dist = Math.hypot(dx, dy);
		const angleTo = Math.atan2(dy, dx);
		let rel = angleTo - centerAngle;
		while (rel > Math.PI) rel -= Math.PI * 2;
		while (rel < -Math.PI) rel += Math.PI * 2;
		const halfWidth = Math.atan2(e.radius, dist) * 1.4;
		if (Math.abs(rel) <= halfWidth && dist < bestDist && dist < wallDist + 0.01) {
			bestDist = dist;
			bestIdx = i;
		}
	}
	if (bestIdx !== -1) {
		enemies[bestIdx].health -= upgrades.damage; // Apply damage upgrade
	}
}

function reload() {
	if (weapon.ammo < weapon.maxAmmo && playerChips >= 1) {
		weapon.ammo = weapon.maxAmmo;
		playerChips -= 1; // Cost 1 chip to reload
	}
}

function getNearbyTable() {
	for (const table of casinoTables) {
		const dist = Math.hypot(table.x - player1.x, table.y - player1.y);
		if (dist < table.radius + 0.5) { // Within interaction range
			return table;
		}
	}
	return null;
}

function interactWithTable() {
	const table = getNearbyTable();
	if (!table) return;
	
	switch (table.type) {
		case 'blackjack':
			openBlackjackTable();
			break;
		case 'poker':
			playPoker();
			break;
		case 'roulette':
			playRoulette();
			break;
		case 'slots':
			playSlots();
			break;
		case 'craps':
			playCraps();
			break;
		case 'wavecontrol':
			startNextWave();
			break;
	}
}

function openBlackjackTable() {
	if (blackjackTableOpen) {
		closeBlackjackTable();
		return;
	}
	
	if (playerChips < blackjackTableGame.bet) {
		casinoGameResult = { type: 'error', message: `Not enough chips! Need ${blackjackTableGame.bet} chips.` };
		casinoGameResultTimer = 2;
		return;
	}
	
	blackjackTableOpen = true;
	paused = true;
	blackjackTableGame.gameState = 'waiting';
	blackjackTableGame.playerHand = [];
	blackjackTableGame.dealerHand = [];
	blackjackTableGame.shoe = buildBlackjackShoe();
}

function closeBlackjackTable() {
	blackjackTableOpen = false;
	paused = false;
	blackjackTableGame.gameState = 'waiting';
}

function buildBlackjackShoe() {
	const cards = [];
	const ranks = [2,3,4,5,6,7,8,9,10,10,10,10,11]; // 11 = Ace
	for (let d = 0; d < 4; d++) { // 4 decks
		for (let s = 0; s < 4; s++) { // 4 suits
			for (let r = 0; r < ranks.length; r++) {
				cards.push(ranks[r]);
			}
		}
	}
	// Shuffle
	for (let i = cards.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[cards[i], cards[j]] = [cards[j], cards[i]];
	}
	return cards;
}

function dealBlackjackHand() {
	if (blackjackTableGame.gameState !== 'waiting') return;
	if (playerChips < blackjackTableGame.bet) return;
	
	playerChips -= blackjackTableGame.bet;
	blackjackTableGame.playerHand = [blackjackTableGame.shoe.pop(), blackjackTableGame.shoe.pop()];
	blackjackTableGame.dealerHand = [blackjackTableGame.shoe.pop(), blackjackTableGame.shoe.pop()];
	blackjackTableGame.gameState = 'playing';
	updateBlackjackTotals();
}

function hitBlackjack() {
	if (blackjackTableGame.gameState !== 'playing') return;
	
	blackjackTableGame.playerHand.push(blackjackTableGame.shoe.pop());
	updateBlackjackTotals();
	
	if (blackjackTableGame.playerTotal > 21) {
		blackjackTableGame.gameState = 'finished';
		casinoGameResult = { type: 'lose', message: 'Bust! You went over 21.', chips: -blackjackTableGame.bet };
		casinoGameResultTimer = 3;
	}
}

function standBlackjack() {
	if (blackjackTableGame.gameState !== 'playing') return;
	
	// Dealer plays
	while (blackjackTableGame.dealerTotal < 17) {
		blackjackTableGame.dealerHand.push(blackjackTableGame.shoe.pop());
		updateBlackjackTotals();
	}
	
	blackjackTableGame.gameState = 'finished';
	
	// Determine winner
	let result;
	if (blackjackTableGame.dealerTotal > 21) {
		result = { type: 'win', message: 'Dealer bust! You win!', chips: blackjackTableGame.bet };
		playerChips += blackjackTableGame.bet * 2;
	} else if (blackjackTableGame.playerTotal > blackjackTableGame.dealerTotal) {
		result = { type: 'win', message: 'You win!', chips: blackjackTableGame.bet };
		playerChips += blackjackTableGame.bet * 2;
	} else if (blackjackTableGame.playerTotal === blackjackTableGame.dealerTotal) {
		result = { type: 'win', message: 'Push! Tie game.', chips: 0 };
		playerChips += blackjackTableGame.bet; // Return bet
	} else {
		result = { type: 'lose', message: 'Dealer wins!', chips: -blackjackTableGame.bet };
	}
	
	casinoGameResult = result;
	casinoGameResultTimer = 3;
}

function updateBlackjackTotals() {
	blackjackTableGame.playerTotal = calculateBlackjackTotal(blackjackTableGame.playerHand);
	blackjackTableGame.dealerTotal = calculateBlackjackTotal(blackjackTableGame.dealerHand);
}

function calculateBlackjackTotal(hand) {
	let total = 0;
	let aces = 0;
	
	for (const card of hand) {
		if (card === 11) {
			aces++;
			total += 11;
		} else {
			total += card;
		}
	}
	
	// Adjust aces
	while (total > 21 && aces > 0) {
		total -= 10;
		aces--;
	}
	
	return total;
}

function playPoker() {
	if (playerChips < 2) {
		casinoGameResult = { type: 'error', message: 'Not enough chips! Need 2 chips.' };
		casinoGameResultTimer = 2;
		return;
	}
	playerChips -= 2;
	const win = Math.random() < 0.4; // 40% win rate
	if (win) {
		playerChips += 5;
		casinoGameResult = { type: 'win', message: 'You won! +5 chips', chips: 5 };
	} else {
		casinoGameResult = { type: 'lose', message: 'You lost! -2 chips', chips: -2 };
	}
	casinoGameResultTimer = 3;
}

function playRoulette() {
	if (playerChips < 1) {
		casinoGameResult = { type: 'error', message: 'Not enough chips! Need 1 chip.' };
		casinoGameResultTimer = 2;
		return;
	}
	playerChips -= 1;
	const win = Math.random() < 0.35; // 35% win rate
	if (win) {
		playerChips += 3;
		casinoGameResult = { type: 'win', message: 'You won! +3 chips', chips: 3 };
	} else {
		casinoGameResult = { type: 'lose', message: 'You lost! -1 chip', chips: -1 };
	}
	casinoGameResultTimer = 3;
}

function playSlots() {
	if (playerChips < 1) {
		casinoGameResult = { type: 'error', message: 'Not enough chips! Need 1 chip.' };
		casinoGameResultTimer = 2;
		return;
	}
	playerChips -= 1;
	const win = Math.random() < 0.25; // 25% win rate
	if (win) {
		playerChips += 4;
		casinoGameResult = { type: 'win', message: 'JACKPOT! +4 chips', chips: 4 };
	} else {
		casinoGameResult = { type: 'lose', message: 'Try again! -1 chip', chips: -1 };
	}
	casinoGameResultTimer = 3;
}

function playCraps() {
	if (playerChips < 3) {
		casinoGameResult = { type: 'error', message: 'Not enough chips! Need 3 chips.' };
		casinoGameResultTimer = 2;
		return;
	}
	playerChips -= 3;
	const win = Math.random() < 0.45; // 45% win rate
	if (win) {
		playerChips += 6;
		casinoGameResult = { type: 'win', message: 'Snake eyes! +6 chips', chips: 6 };
	} else {
		casinoGameResult = { type: 'lose', message: 'You crapped out! -3 chips', chips: -3 };
	}
	casinoGameResultTimer = 3;
}

function spawnEnemies() {
	// Clear existing enemies
	enemies.length = 0;
	
	// Spawn enemies for current wave - much fewer enemies
	const enemyCount = Math.min(2 + Math.floor(currentWave / 2), 6); // Start with 2, max 6 enemies
	for (let i = 0; i < enemyCount; i++) {
		let x, y;
		// Find empty spot
		do {
			x = Math.random() * (MAP_W - 2) + 1;
			y = Math.random() * (MAP_H - 2) + 1;
		} while (isWallAt(x, y) || Math.hypot(x - player1.x, y - player1.y) < 3);
		
		enemies.push({
			x: x,
			y: y,
			radius: 0.14,
			speed: 1.3 + currentWave * 0.1, // Enemies get faster each wave
			health: 3 + Math.floor(currentWave / 2), // More health each wave
			color: '#c44',
			scale: 0.55
		});
	}
	enemiesToKill = enemyCount;
	enemiesKilled = 0;
	waveInProgress = true;
}

function checkWaveComplete() {
	if (enemies.length === 0 && enemiesKilled >= enemiesToKill && waveInProgress) {
		waveInProgress = false;
		playerChips += currentWave * 2; // Bonus chips for completing wave
		roundCompleteMessage = 3; // Show message for 3 seconds
		console.log(`Wave ${currentWave} complete! Go to Wave Control to start next wave.`);
	}
}

function startNextWave() {
	if (!waveInProgress && enemies.length === 0) {
		currentWave++;
		console.log(`Starting Wave ${currentWave}`);
		spawnEnemies();
	}
}

// Blackjack minimal engine
const bj = { open: false, shoe: [], player: [], dealer: [], stake: 1, finished: false };

function bjBuildShoe(decks = 4) {
    const cards = [];
    const ranks = [2,3,4,5,6,7,8,9,10,10,10,10,11];
    for (let d = 0; d < decks; d++) {
        for (let s = 0; s < 4; s++) {
            for (let r = 0; r < ranks.length; r++) cards.push(ranks[r]);
        }
    }
    for (let i = cards.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        const t = cards[i]; cards[i] = cards[j]; cards[j] = t;
    }
    return cards;
}

function bjTotal(hand) {
    let sum = 0; let aces = 0;
    for (const v of hand) { sum += v; if (v === 11) aces++; }
    while (sum > 21 && aces > 0) { sum -= 10; aces--; }
    return sum;
}

function bjOpen() {
    bj.open = true;
    bj.finished = false;
    if (bj.shoe.length < 30) bj.shoe = bjBuildShoe(4);
    bj.player = []; bj.dealer = [];
    updateBjUI();
    const el = document.getElementById('bj-overlay');
    if (el) el.classList.remove('hidden');
    paused = true;
    if (document.pointerLockElement) document.exitPointerLock();
}

function bjClose() {
    bj.open = false;
    updateBjUI();
    const el = document.getElementById('bj-overlay');
    if (el) el.classList.add('hidden');
    paused = false;
    if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
}

function bjDeal() {
    if (bj.finished) return;
    bj.player = [bj.shoe.pop(), bj.shoe.pop()];
    bj.dealer = [bj.shoe.pop(), bj.shoe.pop()];
    updateBjUI(true);
}

function bjHit() { if (!bj.open || bj.finished || bj.player.length === 0) return; bj.player.push(bj.shoe.pop()); updateBjUI(true); }
function bjStand() { if (!bj.open || bj.finished || bj.player.length === 0) return; bjResolve(); }
function bjDouble() { if (!bj.open || bj.finished || bj.player.length === 0) return; bj.player.push(bj.shoe.pop()); bjResolve(true); }

function bjResolve(doubled = false) {
    while (bjTotal(bj.dealer) < 17) bj.dealer.push(bj.shoe.pop());
    const pt = bjTotal(bj.player); const dt = bjTotal(bj.dealer);
    let won = false; let push = false;
    if (pt > 21) won = false;
    else if (dt > 21) won = true;
    else if (pt > dt) won = true;
    else if (pt === dt) push = true;
    bj.finished = true;
    if (won) { 
        playerChips += Math.max(1, bj.stake); 
        // Chance for upgrade when winning
        if (Math.random() < 0.3) { // 30% chance
            const upgradeTypes = ['damage', 'fireRate', 'maxHP', 'ammoCapacity', 'speed'];
            const randomUpgrade = upgradeTypes[Math.floor(Math.random() * upgradeTypes.length)];
            upgrades[randomUpgrade] += 0.1;
            console.log(`Upgrade gained: ${randomUpgrade} +0.1`);
        }
    }
    else if (!push) { playerHP = Math.max(0, playerHP - 1); }
    updateBjUI();
}

function updateBjUI(isDealt = false) {
    const overlay = document.getElementById('bj-overlay');
    if (!overlay) return;
    const chipsEl = document.getElementById('bj-chips-val');
    if (chipsEl) chipsEl.textContent = String(playerChips);
    const stakeEl = document.getElementById('bj-stake');
    if (stakeEl) stakeEl.value = String(bj.stake);
    const table = document.getElementById('bj-table');
    const dealerCards = document.getElementById('bj-dealer-cards');
    const playerCards = document.getElementById('bj-player-cards');
    const dealerTotal = document.getElementById('bj-dealer-total');
    const playerTotal = document.getElementById('bj-player-total');
    const status = document.getElementById('bj-status');
    const cont = document.getElementById('bj-continue');
    overlay.classList.toggle('hidden', !bj.open);
    if (bj.player.length === 0) {
        if (table) table.classList.add('hidden');
        if (status) status.textContent = '';
        if (cont) cont.classList.add('hidden');
    } else {
        if (table) table.classList.remove('hidden');
        if (dealerCards) dealerCards.textContent = bj.dealer.map(v => v===11?'A':String(v)).join(' ');
        if (playerCards) playerCards.textContent = bj.player.map(v => v===11?'A':String(v)).join(' ');
        if (dealerTotal) dealerTotal.textContent = `(${bjTotal(bj.dealer)})`;
        if (playerTotal) playerTotal.textContent = `(${bjTotal(bj.player)})`;
        if (status) status.textContent = bj.finished ? 'Hand over.' : 'Your move.';
        if (cont) cont.classList.toggle('hidden', !bj.finished);
    }
}

// BJ buttons and keybind
window.addEventListener('keydown', (e) => {
    if (e.key === 'b' || e.key === 'B') {
        if (bj.open) bjClose(); else bjOpen();
    }
    if (e.key === 'r' || e.key === 'R') {
        reload();
    }
    if (e.key === 'e' || e.key === 'E') {
        interactWithTable();
    }
    
    // Blackjack table controls
    if (blackjackTableOpen) {
        if (e.key === 'Escape') {
            closeBlackjackTable();
        } else if (e.key === ' ') {
            e.preventDefault();
            if (blackjackTableGame.gameState === 'waiting') {
                dealBlackjackHand();
            } else if (blackjackTableGame.gameState === 'finished') {
                blackjackTableGame.gameState = 'waiting';
                blackjackTableGame.playerHand = [];
                blackjackTableGame.dealerHand = [];
            }
        } else if (e.key === 'h' || e.key === 'H') {
            hitBlackjack();
        } else if (e.key === 's' || e.key === 'S') {
            standBlackjack();
        }
    }
});

const stakeInput = document.getElementById('bj-stake');
const dealBtn = document.getElementById('bj-deal');
const hitBtn = document.getElementById('bj-hit');
const standBtn = document.getElementById('bj-stand');
const doubleBtn = document.getElementById('bj-double');
const contBtn = document.getElementById('bj-continue');

if (stakeInput) stakeInput.addEventListener('change', () => { bj.stake = Math.max(1, Math.floor(Number(stakeInput.value)||1)); updateBjUI(); });
if (dealBtn) dealBtn.addEventListener('click', () => { if (playerChips >= bj.stake) { playerChips -= bj.stake; bjDeal(); updateBjUI(true); }});
if (hitBtn) hitBtn.addEventListener('click', bjHit);
if (standBtn) standBtn.addEventListener('click', bjStand);
if (doubleBtn) doubleBtn.addEventListener('click', () => { if (playerChips >= bj.stake) { playerChips -= bj.stake; bjDouble(); updateBjUI(true); }});
if (contBtn) contBtn.addEventListener('click', () => { bj.player = []; bj.dealer = []; bj.finished = false; updateBjUI(); });

function bjAdjustStake(delta) {
    bj.stake = Math.max(1, Math.floor(bj.stake + delta));
    updateBjUI();
}

// Blackjack keybinds: G/H/J/K and WASD navigation
window.addEventListener('keydown', (e) => {
    if (!bj.open) return;
    const k = e.key;
    const inHand = bj.player.length > 0 && !bj.finished;
    const noHand = bj.player.length === 0 && !bj.finished;
    const handOver = bj.finished;
    // Stake adjust with WASD and +/-
    if (k === 'w' || k === 'W' || k === 'ArrowUp' || k === '+' || k === '=') { bjAdjustStake(+1); e.preventDefault(); }
    if (k === 's' || k === 'S' || k === 'ArrowDown' || k === '-' || k === '_') { bjAdjustStake(-1); e.preventDefault(); }
    // Action keys
    if (k === 'g' || k === 'G') { if (noHand && playerChips >= bj.stake) { playerChips -= bj.stake; bjDeal(); updateBjUI(true); } e.preventDefault(); }
    if (k === 'h' || k === 'H') { if (inHand) bjHit(); e.preventDefault(); }
    if (k === 'j' || k === 'J') { if (inHand) bjStand(); e.preventDefault(); }
    if (k === 'k' || k === 'K') { if (inHand && playerChips >= bj.stake) { playerChips -= bj.stake; bjDouble(); updateBjUI(true); } e.preventDefault(); }
    // Menu focus cycling with A/D (select buttons visually)
    if (k === 'a' || k === 'A' || k === 'd' || k === 'D') {
        const buttons = [document.getElementById('bj-deal'), document.getElementById('bj-hit'), document.getElementById('bj-stand'), document.getElementById('bj-double')].filter(Boolean);
        const active = document.activeElement;
        let idx = buttons.indexOf(active);
        if (idx === -1) idx = 0;
        idx += (k === 'd' || k === 'D') ? 1 : -1;
        if (idx < 0) idx = buttons.length - 1;
        if (idx >= buttons.length) idx = 0;
        buttons[idx].focus();
        e.preventDefault();
    }
    // Enter/Space to press focused button or continue/deal
    if (k === 'Enter' || k === ' ') {
        const focused = document.activeElement;
        if (focused && (focused.id === 'bj-deal' || focused.id === 'bj-hit' || focused.id === 'bj-stand' || focused.id === 'bj-double')) {
            focused.click();
        } else if (handOver) {
            bj.player = []; bj.dealer = []; bj.finished = false; updateBjUI();
        } else if (noHand && playerChips >= bj.stake) { playerChips -= bj.stake; bjDeal(); updateBjUI(true); }
        e.preventDefault();
    }
});


