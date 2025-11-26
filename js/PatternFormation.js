import Alien from './alien.js';
import { patterns } from './patterns/formationPatterns.js';
import SplineCurve from './math/SplineCurve.js';
import BezierPath from './math/BezierPath.js';
import AlienLaser from './LaserParticle.js';
import ExplosionEffect from './effects/ExplosionEffect.js';

class PatternFormation {
    constructor(ctx, options = {}) {
        this.ctx = ctx;
        this.virtualWidth = options.virtualWidth || 1080;
        this.virtualHeight = options.virtualHeight || 1080;
        this.audioManager = options.audioManager;
        
        // 1. Сначала базовый конфиг
        this.config = {
            speed: 0.5,
            radius: 80,
            patternType: 'infinity',
            loopDuration: 8,
            alienCount: 12,
            showPath: false,
            pathPoints: 100,
            formationRadius: 150,
            pulseIntensity: 0,
            pulseSpeed: 2,
            shootingEnabled: true
        };

        // 2. Параметры сложности
        this.difficulty = options.difficulty || 1;
        this.maxDifficulty = 10;
        this.baseFormationRadius = 120;
        this.radiusIncrease = 15;
        this.basePulseIntensity = 0.75;
        this.pulseIntensityIncrease = 0.75;
        this.basePulseSpeed = 0.5;
        this.pulseSpeedIncrease = 0.1;

        // 3. Параметры вращения (ОБЯЗАТЕЛЬНО ДО applyDifficultyModifiers)
        this.baseRotationSpeed = 1.0;
        this.rotationSpeedIncrease = 0.4;
        this.maxRotationSpeed = 6.0;
        this.currentRotation = 0;
        this.rotationSpeed = this.baseRotationSpeed;
        this.rotationDirection = 1;
        this.rotationCycleBonus = 0.4;

        // 4. Параметры стрельбы и дайвинга
        this.baseShootInterval = 0.5; // Стреляют каждые полсекунды
        this.minShootInterval = 0.1;  // В конце игры — пулемет (10 выстрелов в сек)
        this.shootInterval = this.baseShootInterval;
        
        this.baseDiveChance = 0.005;
        this.diveChanceIncrease = 0.002;
        this.diveSpeed = 600;
        this.diveSpeedIncrease = 100;
        this.maxDiveSpeed = 1200;
        this.diveAcceleration = 1000;
        this.diveCurveIntensity = 0.8;
        this.currentDiveChance = this.baseDiveChance;
        this.currentDiveSpeed = this.diveSpeed;

        this.pointsBase = 100;
        this.initialAlienCount = this.config.alienCount;

        // 5. И ТОЛЬКО ТЕПЕРЬ применяем модификаторы
        this.applyDifficultyModifiers();

        // 6. Инициализация остальных объектов
        this.aliens = [];
        this.pattern = patterns[options.pattern || 'infinity']; // Исправил дефолт на infinity
        this.time = 0;
        this.loopDuration = 10;
        
        this.position = {
            x: this.virtualWidth * 0.5,
            y: this.virtualHeight * 0.3
        };
        this.velocity = { x: 0, y: 0 };
        
        this.alienSlots = [];
        this.createFormation(); // Использует this.aliens, поэтому массив должен быть объявлен

        this.patternNames = Object.keys(patterns);
        this.currentPatternIndex = 0;
        this.patternDuration = 15;
        this.patternTimer = 0;

        this.respawnDelay = 2;
        this.respawnTimer = 0;
        this.isRespawning = false;

        this.verticalOffset = this.virtualHeight * 0.2;
        this.maxVerticalPosition = this.virtualHeight * 0.4;

        this.path = new BezierPath(
            this.virtualWidth * 0.5,
            this.verticalOffset,
            this.virtualWidth * 0.25
        );

        this.lasers = [];
        this.shootTimer = 0;
        
        this.explosionEffect = new ExplosionEffect(ctx, this.audioManager);
        this.onPointsScored = options.onPointsScored || (() => {});
        
        this.calculateFormationParameters();
    }

    applyDifficultyModifiers() {
        // 1. Сначала объявляем переменные цикла и сложности
        // (Именно их не хватало, поэтому была ошибка)
        const cycleCount = Math.floor((this.difficulty - 1) / this.maxDifficulty);
        const cycleDifficulty = ((this.difficulty - 1) % this.maxDifficulty) + 1;
        
        // 2. Радиус формации
        this.config.formationRadius = Math.min(
            this.virtualHeight * 0.25,
            this.baseFormationRadius + (cycleDifficulty - 1) * this.radiusIncrease
        );

        // 3. Пульсация
        this.config.pulseIntensity = this.basePulseIntensity + 
            (cycleDifficulty - 1) * this.pulseIntensityIncrease;
        this.config.pulseSpeed = this.basePulseSpeed + 
            (cycleDifficulty - 1) * this.pulseSpeedIncrease;

        // 4. Интервал стрельбы (Наша новая агрессивная формула)
        // Теперь cycleDifficulty объявлен выше, и ошибки не будет
        const progress = Math.min(1, (cycleDifficulty - 1) / 9); 
        this.shootInterval = this.baseShootInterval - (progress * (this.baseShootInterval - this.minShootInterval));
        
        // 5. Скорость движения
        this.config.speed = Math.min(2.0, 0.3 + (cycleCount * 0.1) + (cycleDifficulty * 0.05));

        console.log(`Level ${this.difficulty} (Cycle ${cycleCount + 1}, Difficulty ${cycleDifficulty})`);
        
        // 6. Скорость вращения
        const baseIncrease = (cycleDifficulty - 1) * this.rotationSpeedIncrease;
        const cycleBonus = cycleCount * this.rotationCycleBonus;
        
        this.rotationSpeed = Math.min(
            this.maxRotationSpeed,
            this.baseRotationSpeed + baseIncrease + cycleBonus
        );

        // 7. Направление вращения
        if (this.difficulty % 2 === 0) {
            this.rotationDirection = -1;
        } else {
            this.rotationDirection = 1;
        }
    }

    calculateFormationParameters() {
        // Use actual alien count for calculations
        const alienCount = this.aliens.length;
        const minSpacing = Math.PI * 2 * this.config.formationRadius / alienCount;
        
        // Ensure aliens don't overlap
        this.formationSpacing = Math.max(minSpacing, this.config.formationRadius * 0.8);
    }

    // Modify createFormation to apply current difficulty settings
    createFormation() {
        // Apply new difficulty modifiers before creating formation
        this.applyDifficultyModifiers();

        this.aliens = [];
        this.alienSlots = [];  // Reset slots
        const count = Math.floor(this.config.alienCount);
        
        // First, create all possible slots
        const angleStep = (Math.PI * 2) / count;
        for (let i = 0; i < count; i++) {
            this.alienSlots.push({
                index: i,
                angle: i * angleStep,
                occupied: true
            });
        }

        // Then create aliens and assign them to slots
        for (let i = 0; i < count; i++) {
            const alien = new Alien(this.ctx, {
                virtualWidth: this.virtualWidth,
                virtualHeight: this.virtualHeight,
                width: 100,
                height: 100
            });
            alien.slotIndex = i;  // Remember which slot this alien belongs to
            this.aliens.push(alien);
        }

        this.calculateFormationParameters();
    }

    switchPattern(patternName) {
        if (patterns[patternName]) {
            this.pattern = patterns[patternName];
            this.calculateFormationParameters();
            this.time = 0; // Reset time to start pattern from beginning
            
            // Store current positions for smooth transition
            this.aliens.forEach(alien => {
                alien.lastX = alien.x;
                alien.lastY = alien.y;
            });

            // Update spline curve
            this.spline = new SplineCurve(
                this.pattern.points.map(p => ({
                    x: p.x * this.virtualWidth,
                    y: p.y * this.virtualHeight
                })),
                true  // Force closed curve
            );
        }
    }

    update(delta) {
        // Check if all aliens are destroyed
        if (this.aliens.length === 0 && !this.isRespawning) {
            this.isRespawning = true;
            this.respawnTimer = this.respawnDelay;
        }

        // Handle respawn timer
        if (this.isRespawning) {
            this.respawnTimer -= delta;
            if (this.respawnTimer <= 0) {
                // Switch to a new random pattern
                const availablePatterns = this.patternNames.filter(p => p !== this.pattern.type);
                const newPattern = availablePatterns[Math.floor(Math.random() * availablePatterns.length)];
                this.switchPattern(newPattern);
                
                // Recreate alien formation
                this.createFormation();
                this.isRespawning = false;
            }
            return; // Skip regular update while respawning
        }

        // Update pattern timer and check for pattern switch
        this.patternTimer += delta;
        if (this.patternTimer >= this.patternDuration) {
            this.patternTimer = 0;
            this.currentPatternIndex = (this.currentPatternIndex + 1) % this.patternNames.length;
            this.switchPattern(this.patternNames[this.currentPatternIndex]);
        }

        // Update continuous time
        this.time = (this.time + delta) % this.loopDuration;
        const progress = this.time / this.loopDuration;

        // Get current position and clamp vertical position
        const pos = this.path.getPoint(progress);
        pos.y = Math.min(pos.y, this.maxVerticalPosition);
        pos.y = Math.max(pos.y, this.verticalOffset);

        // Increase pulse amplitude by 50%
        const pulseAmount = Math.sin(this.time * this.config.pulseSpeed * Math.PI * 2) * 
                          (this.config.pulseIntensity * 7.5); // Increased from 5 to 7.5
        const currentRadius = this.config.formationRadius + pulseAmount;

        // Update rotation
        this.currentRotation += this.rotationSpeed * delta;
        this.currentRotation = this.currentRotation % (Math.PI * 2);

        // Position aliens in formation based on their slots
        this.aliens.forEach(alien => {
            if (!alien.isDiving) {
                // Normal formation movement
                const slot = this.alienSlots[alien.slotIndex];
                const rotatedAngle = slot.angle + this.currentRotation;
                
                const targetX = pos.x + Math.cos(rotatedAngle) * currentRadius;
                const targetY = pos.y + Math.sin(rotatedAngle) * currentRadius;
                
                // Enhanced dive chance check with spacing
                if (Math.random() < this.currentDiveChance * delta && 
                    !this.aliens.some(a => a.isDiving && Math.abs(a.x - targetX) < 100)) {
                    alien.isDiving = true;
                    alien.diveVelocityY = this.currentDiveSpeed;
                    alien.diveVelocityX = 0;
                    alien.diveStartX = targetX;
                    alien.diveStartY = targetY;
                    alien.lastFormationX = targetX;
                    alien.lastFormationY = targetY;
                    
                    // Target player with prediction if available
                    if (this.player) {
                        const dx = this.player.x - targetX;
                        const dy = this.player.y - targetY;
                        const angle = Math.atan2(dy, dx);
                        alien.diveTargetX = this.player.x + (this.player.velocity?.x || 0) * 0.5;
                        alien.diveVelocityX = Math.cos(angle) * this.currentDiveSpeed * this.diveCurveIntensity;
                    }
                } else {
                    // Normal position update
                    // Smooth transition if we have last positions
                    if (alien.lastX !== undefined) {
                        const t = Math.min(1, this.time * 2); // Transition over 0.5 seconds
                        alien.x = this.lerp(alien.lastX, targetX, t);
                        alien.y = this.lerp(alien.lastY, targetY, t);
                        if (t === 1) {
                            delete alien.lastX;
                            delete alien.lastY;
                        }
                    } else {
                        alien.x = targetX;
                        alien.y = targetY;
                    }
                }
            } else {
                // Enhanced diving movement
                alien.diveVelocityY += this.diveAcceleration * delta;
                alien.y += alien.diveVelocityY * delta;

                // Curved path toward player
                if (alien.diveVelocityX) {
                    if (this.player) {
                        // Update dive direction toward player
                        const dx = this.player.x - alien.x;
                        const angle = Math.atan2(0, dx); // Only track X movement
                        alien.diveVelocityX += Math.cos(angle) * this.diveAcceleration * delta * 0.5;
                    }
                    alien.x += alien.diveVelocityX * delta;
                }

                // Return to formation when out of bounds
                if (alien.y > this.virtualHeight + 50 || 
                    alien.x < -50 || 
                    alien.x > this.virtualWidth + 50) {
                    alien.isDiving = false;
                    alien.x = alien.lastFormationX;
                    alien.y = -50;
                }
            }
        });

        // Update shooting
        if (this.config.shootingEnabled && this.aliens.length > 0) {
            this.shootTimer += delta;
            if (this.shootTimer >= this.shootInterval) {
                this.shootTimer = 0;
                this.shoot();
            }
        }

        // Update lasers
        this.lasers = this.lasers.filter(laser => laser.life > 0);
        this.lasers.forEach(laser => laser.update(delta));

        this.explosionEffect.update(delta);
    }

    shoot() {
        // Выбираем случайного стрелка
        const shooter = this.aliens[Math.floor(Math.random() * this.aliens.length)];
        if (!shooter) return; // Защита

        // Создаем лазер
        const createLaser = (offsetX = 0) => {
            const laser = new AlienLaser(
                shooter.x + shooter.width/2 + offsetX,
                shooter.y + shooter.height,
                this.audioManager
            );
            this.lasers.push(laser);
        };

        createLaser(0);

        // Если сложность высокая (5+), есть шанс двойного выстрела
        if (this.difficulty > 5 && Math.random() > 0.5) {
            setTimeout(() => createLaser(20), 100); // Второй выстрел с задержкой и смещением
        }
    }

    lerp(a, b, t) {
        return a + (b - a) * t;
    }

    draw() {
        // Draw debug path first
        if (this.config.showPath) {
            this.drawPath();
        }

        // Draw aliens
        this.aliens.forEach(alien => alien.draw());

        // Draw lasers
        this.lasers.forEach(laser => laser.draw(this.ctx));

        this.explosionEffect.draw();
    }

    drawPath() {
        if (this.path) {
            this.path.drawDebug(this.ctx);
        }
    }

    checkCollision(x, y) {
        for (let alien of this.aliens) {
            if (alien.collidesWith(x, y)) {
                // Create explosion at alien's center
                this.explosionEffect.createExplosion(
                    alien.x + alien.width/2,
                    alien.y + alien.height/2
                );
                
                // Mark the slot as unoccupied but don't remove it
                this.alienSlots[alien.slotIndex].occupied = false;
                
                // Remove only this alien
                this.aliens = this.aliens.filter(a => a !== alien);
                
                // Calculate points with multiplier
                const pointsMultiplier = this.difficulty * (1 + (this.initialAlienCount - this.aliens.length) * 0.1);
                const points = Math.floor(this.pointsBase * pointsMultiplier);
                
                // Replace direct call with callback
                this.onPointsScored(points);
                return true;
            }
        }
        return false;
    }

    checkPlayerCollision(playerX, playerY, playerWidth, playerHeight) {
        return this.lasers.some(laser => {
            const hit = (laser.x >= playerX && 
                        laser.x <= playerX + playerWidth &&
                        laser.y >= playerY &&
                        laser.y <= playerY + playerHeight);
            if (hit) {
                laser.life = 0; // Remove laser on hit
            }
            return hit;
        });
    }
}

export default PatternFormation;
