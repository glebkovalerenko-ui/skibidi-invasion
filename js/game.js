import Player from './player.js';
import { ParticleEngine, LaserEngine } from './particleEngine.js';
import ImageBackgroundScroller from './imageBackgroundScroller.js';
import PatternFormation from './PatternFormation.js';
import IntroScreen from './screens/IntroScreen.js';
import TutorialScreen from './screens/TutorialScreen.js';
import MusicPlayer from './audio/MusicPlayer.js';
import StartupScreen from './screens/StartupScreen.js';
import DebugWindow from './DebugWindow.js';
import CanvasManager from './CanvasManager.js';
import InputManager from './InputManager.js';
import HUDManager from './managers/HUDManager.js';
import GameStateManager from './managers/GameStateManager.js';
import GameScreen from './screens/GameScreen.js';
import CRTEffect from './effects/CRTEffect.js';
import AudioManager from './audio/AudioManager.js';
import AssetLoader from './utils/AssetLoader.js';
import { Strings, setLanguage } from './utils/Localization.js';
import { assets } from './config/assetManifest.js';

class Game {
    constructor() {
        this.audioManager = AudioManager.getInstance();
        this.setupAudioUnlock();

        document.title = Strings.gameTitle;
        
        this.container = document.createElement('div');
        this.container.style.cssText = 'position:fixed;width:100%;height:100%;display:flex;justify-content:center;align-items:center;background:#000;overflow:hidden;';
        document.body.appendChild(this.container);

        this.virtualWidth = 1024;
        this.virtualHeight = 1024;
        
        this.canvas = document.getElementById('gameCanvas');
        this.canvas.style.opacity = '0'; 
        this.container.appendChild(this.canvas);

        ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(evt => {
            document.body.addEventListener(evt, (e) => e.preventDefault(), { passive: false });
        });

        this.canvasManager = new CanvasManager(this.canvas);
        this.ctx = this.canvasManager.getContext();

        const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const quality = isMobile ? 0.5 : 1.0; 
        
        try {
            this.crtEffect = new CRTEffect(this.canvas, this.container, this.audioManager, quality);
            if (isMobile) console.log("Mobile detected: Optimized CRT enabled");
        } catch (e) {
            console.warn("CRT Shader disabled by error", e);
            this.crtEffect = null;
        }

        if (!this.crtEffect) {
            this.canvas.style.opacity = '1';
        }

        this.inputManager = new InputManager();
        this.gameState = new GameStateManager();
        this.hudManager = new HUDManager(this.ctx, this.virtualWidth, this.virtualHeight);
        
        window.game = this;
        
        this.screens = {
            startup: new StartupScreen(this.ctx, {
                virtualWidth: this.virtualWidth,
                virtualHeight: this.virtualHeight
            }),
            intro: null,
            tutorial: null,
            game: null 
        };

        this.tutorialShown = false;
        this.currentScreen = 'startup';
        this.inputManager.setCurrentScreen('startup');
        
        this.inputManager.registerScreen('startup', (key) => {
            if (this.isPaused) return;
            if (this.gameReadySent && this.screens.startup.handleInput(key) === 'intro') {
                this.switchScreen('intro');
                return;
            }
            return null;
        });

        this.musicPlayer = new MusicPlayer();
        this.debugWindow = new DebugWindow();
        
        this.gameReadySent = false;
        this.isPaused = false;
        this.isAdPlaying = false; 
        this.lastTime = 0;

        const resizeHandler = () => this.resize();
        window.addEventListener('resize', resizeHandler);
        resizeHandler();

        const handlePause = () => this.onPause();
        const handleResume = () => this.onResume();
        
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) handlePause();
            else handleResume();
        });
        
        window.addEventListener('blur', handlePause);
        window.addEventListener('focus', handleResume);

        this.init();
    }

    setupAudioUnlock() {
        const unlockAudio = () => {
            if (this.audioManager) {
                // Пытаемся разбудить контекст при любом взаимодействии
                this.audioManager.resumeContext();
                if (this.audioManager.context.state === 'running') {
                    // Если успешно - можно убирать слушатели
                    ['touchstart', 'touchend', 'click', 'keydown'].forEach(evt =>
                        document.body.removeEventListener(evt, unlockAudio)
                    );
                }
            }
        };

        ['touchstart', 'touchend', 'click', 'keydown'].forEach(evt =>
            document.body.addEventListener(evt, unlockAudio, { passive: false })
        );
    }

    async init() {
        try {
            let ysdk = null;
            if (window.YaGames) {
                try {
                    ysdk = await window.YaGames.init();
                    window.ysdk = ysdk;
                    if (ysdk.environment && ysdk.environment.i18n) {
                        setLanguage(ysdk.environment.i18n.lang);
                    }
                } catch (e) {
                    console.warn('YSDK Init failed (possibly localhost)', e);
                }
            }

            await document.fonts.ready;
            await this.audioManager.preloadGameSounds();
            
            const imagesToLoad = [
                assets.sprites.player,
                assets.sprites.alien,
                assets.sprites.logoRu,
                assets.sprites.logoEn,
                ...assets.backgrounds
            ].filter(url => url);

            await AssetLoader.loadAll(imagesToLoad);
            console.log(`Assets loaded`);

            this.bgScroller = new ImageBackgroundScroller(this.ctx, {
                virtualWidth: this.virtualWidth,
                virtualHeight: this.virtualHeight,
                scrollSpeed: 100
            });

            if (window.ysdk) {
                const cloudPromise = this.gameState.initCloudSave(window.ysdk);
                const timeoutPromise = new Promise(resolve => setTimeout(resolve, 1000));
                await Promise.race([cloudPromise, timeoutPromise]);
            }

            this.initScreens();
            
            if (window.ysdk && window.ysdk.features && window.ysdk.features.LoadingAPI) {
                window.ysdk.features.LoadingAPI.ready();
            }
            
            this.gameReadySent = true;
            this.canvas.style.opacity = '1';
            
            this.startGameLoop();

        } catch (error) {
            console.error('CRITICAL INIT ERROR:', error);
            this.gameReadySent = true;
            this.canvas.style.opacity = '1';
            this.startGameLoop();
        }
    }

    initScreens() {
        this.screens.intro = new IntroScreen(this.ctx, {
            virtualWidth: this.virtualWidth,
            virtualHeight: this.virtualHeight,
            bgScroller: this.bgScroller
        });

        this.inputManager.registerScreen('intro', (key) => {
            if (this.isPaused) return;
            const action = this.screens.intro.handleInput(key);
            
            if (action === 'start') {
                // ВАЖНО: Сразу же будим аудио-контекст, пока мы внутри события клика/клавиши.
                // Это решает ошибку "Autoplay blocked".
                if (this.audioManager) {
                    this.audioManager.resumeContext().catch(() => {});
                }

                const startGame = () => {
                    // Останавливаем старую музыку ПЕРЕД сбросом
                    if (this.musicPlayer) this.musicPlayer.stop();
                    
                    this.gameState.reset();
                    if (this.musicPlayer) this.musicPlayer.resetGameMusic();
                    this.switchScreen('game');
                };

                if (this.screens.intro.isGameOver) {
                     // Показ рекламы
                     try {
                        if (window.showAd) {
                            window.showAd(startGame);
                        } else {
                            startGame();
                        }
                     } catch(e) {
                        startGame();
                     }
                } else {
                    // Первый запуск
                    if (!this.tutorialShown) {
                        this.tutorialShown = true;
                        this.switchScreen('tutorial');
                    } else {
                        startGame();
                    }
                }
                return;
            }
            if (action) this.switchScreen(action);
            return action;
        });
    }

    resize() {
        this.canvasManager.resize();
        if (this.crtEffect) {
            this.crtEffect.syncStyle(this.canvas);
        }
    }

    onPause() {
        if (this.isPaused) return;
        this.isPaused = true;
        if (this.audioManager) this.audioManager.mute();
        if (this.musicPlayer) this.musicPlayer.stop();
        if (this.screens[this.currentScreen]?.onPause) this.screens[this.currentScreen].onPause();
    }

    onResume() {
        if (this.isAdPlaying) return; 
        if (!this.isPaused) return;
        
        this.isPaused = false;
        if (this.audioManager) this.audioManager.unmute();
        
        if (this.musicPlayer) this.musicPlayer.resume();
        if (this.screens[this.currentScreen]?.onResume) this.screens[this.currentScreen].onResume();
        this.lastTime = performance.now();
    }

    switchScreen(screenName) {
        if (this.screens[this.currentScreen]?.cleanup) this.screens[this.currentScreen].cleanup();

        if (screenName === 'intro') {
            if (this.audioManager && !this.isPaused) {
                this.audioManager.unmute().catch(e => {});
                this.audioManager.resumeContext().catch(e => {});
            }
            this.musicPlayer.playMenuMusic();
        }

        if (screenName === 'tutorial') {
            this.screens.tutorial = new TutorialScreen(this.ctx, {
                virtualWidth: this.virtualWidth,
                virtualHeight: this.virtualHeight
            });
            this.inputManager.registerScreen('tutorial', (key) => {
                if (this.isPaused) return;
                const nextScreen = this.screens.tutorial.handleInput(key);
                if (nextScreen) this.switchScreen(nextScreen);
            });
        }

        if (screenName === 'game') {
            if (this.audioManager && !this.isPaused) {
                this.audioManager.unmute().catch(e => {}); 
                this.audioManager.resumeContext().catch(e => {});
            }

            this.screens.game = new GameScreen(this.ctx, {
                virtualWidth: this.virtualWidth,
                virtualHeight: this.virtualHeight,
                bgScroller: this.bgScroller,
                gameState: this.gameState,
                audioManager: this.audioManager,
                onGameOver: () => this.handleGameOver() 
            });
            this.inputManager.registerScreen('game', (key) => {
                if (this.isPaused) return;
                return this.screens.game.handleInput(key);
            });
            this.musicPlayer.playGameMusic();
        }

        this.currentScreen = screenName;
        this.inputManager.setCurrentScreen(screenName);
    }

    handleGameOver() {
        this.screens.intro = new IntroScreen(this.ctx, {
            virtualWidth: this.virtualWidth,
            virtualHeight: this.virtualHeight,
            bgScroller: this.bgScroller,
            isGameOver: true,
            finalScore: this.gameState.score,
            highScore: this.gameState.highScore
        });
        this.switchScreen('intro');
    }

    update(timestamp) {
        if (this.isPaused) return;
        const delta = (timestamp - (this.lastTime || timestamp)) / 1000;
        this.lastTime = timestamp;
        const safeDelta = Math.min(delta, 0.1); 
        this.gameState.update(safeDelta);
        if (this.screens[this.currentScreen]) this.screens[this.currentScreen].update(safeDelta);
        if(this.debugWindow.visible) this.debugWindow.update(safeDelta);
    }

    draw() {
        if (this.isPaused) return;
        this.canvasManager.clearScreen();
        if (this.screens[this.currentScreen]) this.screens[this.currentScreen].draw();
        if (this.currentScreen === 'game') this.hudManager.draw(this.gameState.lives, this.gameState.score, this.gameState.highScore);
        if(this.debugWindow.visible) this.debugWindow.draw(this.ctx);
        if (this.crtEffect) this.crtEffect.render(performance.now());
    }

    startGameLoop() {
        const loop = (timestamp) => {
            this.update(timestamp);
            this.draw();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new Game());
} else {
    new Game();
}