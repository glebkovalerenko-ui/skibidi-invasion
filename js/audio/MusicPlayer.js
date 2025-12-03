import AudioManager from './AudioManager.js';

class MusicPlayer {
    constructor() {
        this.gameTrackKeys = ['game_track_0', 'game_track_1'];
        this.menuTrackKey = 'menu_theme';

        this.audioManager = AudioManager.getInstance();
        this.audioContext = this.audioManager.context;
        
        this.gainNode = this.audioContext.createGain();
        this.gainNode.connect(this.audioManager.musicGain);
        this.gainNode.gain.value = 0.6;

        this.currentSource = null;
        
        this.gameTrackIndex = 0;
        this.gameCursor = 0; 
        
        this.lastStartTime = 0;
        this.isPlaying = false;
        this.currentMode = 'none'; // 'menu', 'game', 'none'

        this.shuffleGameTracks();
    }

    shuffleGameTracks() {
        for (let i = this.gameTrackKeys.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.gameTrackKeys[i], this.gameTrackKeys[j]] = [this.gameTrackKeys[j], this.gameTrackKeys[i]];
        }
    }

    stopCurrent() {
        if (this.isPlaying && this.currentSource) {
             const elapsed = this.audioContext.currentTime - this.lastStartTime;
             if (elapsed > 0) {
                 this.gameCursor += elapsed;
             }
        }

        if (this.currentSource) {
            this.currentSource.onended = null;
            try {
                this.currentSource.stop();
                this.currentSource.disconnect();
            } catch(e) {}
            this.currentSource = null;
        }
        this.isPlaying = false;
    }

    // Сброс музыки для новой игры
    resetGameMusic() {
        this.gameTrackIndex = 0;
        this.gameCursor = 0;
        this.shuffleGameTracks();
    }

    playMenuMusic() {
        this.stopCurrent();
        this.currentMode = 'menu';

        const buffer = this.audioManager.getMusicBuffer(this.menuTrackKey);
        if (!buffer) return;

        this.playBuffer(buffer, 0, true);
    }

    playGameMusic() {
        if (this.currentMode === 'game' && this.isPlaying) return;
        
        this.stopCurrent(); 
        this.currentMode = 'game';

        this._playNextGameTrack();
    }

    _playNextGameTrack() {
        const key = this.gameTrackKeys[this.gameTrackIndex];
        const buffer = this.audioManager.getMusicBuffer(key);
        
        if (!buffer) return;

        if (this.gameCursor >= buffer.duration) {
            this.gameCursor = 0;
            this.gameTrackIndex = (this.gameTrackIndex + 1) % this.gameTrackKeys.length;
            this._playNextGameTrack();
            return;
        }

        this.playBuffer(buffer, this.gameCursor, false, () => {
            this.gameCursor = 0;
            this.gameTrackIndex = (this.gameTrackIndex + 1) % this.gameTrackKeys.length;
            
            if (this.currentMode === 'game') {
                this._playNextGameTrack();
            }
        });
    }

    playBuffer(buffer, startTimeOffset, loop, onEndedCallback = null) {
        const safeOffset = startTimeOffset % buffer.duration;

        this.currentSource = this.audioContext.createBufferSource();
        this.currentSource.buffer = buffer;
        this.currentSource.loop = loop;
        this.currentSource.connect(this.gainNode);

        this.currentSource.onended = () => {
            this.isPlaying = false;
            if (onEndedCallback) onEndedCallback();
        };

        this.currentSource.start(0, safeOffset);
        
        this.lastStartTime = this.audioContext.currentTime;
        this.isPlaying = true;
    }

    stop() {
        this.stopCurrent();
    }
    
    resume() {
        if (this.currentMode === 'game') this.playGameMusic();
        else if (this.currentMode === 'menu') this.playMenuMusic();
    }
}

export default MusicPlayer;