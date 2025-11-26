// js/utils/Localization.js

const dictionary = {
    en: {
        gameTitle: "Skibidi Invasion",
        pressStart: "PRESS SPACE TO START",
        gameOver: "TOILET VICTORY",
        finalScore: "FINAL SCORE",
        highScore: "HIGH SCORE", // Для экрана смерти
        scoreHUD: "SCORE",
        livesHUD: "LIVES",
        highScoreHUD: "BEST",    // Для HUD (покороче)
        loading: "CONNECTING TO TV WORLD..."
    },
    ru: {
        gameTitle: "Вторжение Скибиди",
        pressStart: "НАЖМИ ПРОБЕЛ",
        gameOver: "ПОБЕДА УНИТАЗОВ",
        finalScore: "ИТОГ",
        highScore: "РЕКОРД",
        scoreHUD: "СЧЕТ",
        livesHUD: "ЖИЗНИ",
        highScoreHUD: "РЕКОРД",
        loading: "ПОДКЛЮЧЕНИЕ К ТВ МИРУ..."
    }
};

// Определяем язык браузера (если начинается на 'ru', то русский, иначе английский)
const lang = (navigator.language || navigator.userLanguage || 'en').toLowerCase().startsWith('ru') ? 'ru' : 'en';

export const Strings = dictionary[lang];