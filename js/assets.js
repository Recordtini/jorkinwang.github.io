/* WHEEL OF FORTUNE 2nd Edition - Web Port
 * Asset manifest & loader.
 * Uses the ORIGINAL game assets extracted from the CD:
 *   - Background screens (800x600 BMP -> PNG-friendly via JPEG load as-is; browsers
 *     can't decode BMP directly so we re-encode to JPEG/PNG at build time).
 *   - Sprites from wheel.dat / menus.dat
 *   - Sound effects from wheel.dat / menus.dat
 *   - Cutscene videos converted from Intel Indeo AVI to MP4
 */
'use strict';

const ASSETS = {
    // Background screens (originals were 800x600 BMP; re-encoded on serve)
    bg: {
        menu1: 'assets/bg/menu_0000.jpg',
        menu2: 'assets/bg/menu_0001.jpg',
        menu3: 'assets/bg/menu_0002.jpg',
        menu4: 'assets/bg/menu_0003.jpg',
        menu5: 'assets/bg/menu_0004.jpg',
        menu6: 'assets/bg/menu_0005.jpg',
        menu7: 'assets/bg/menu_0006.jpg',
        menu8: 'assets/bg/menu_0007.jpg',
        menu9: 'assets/bg/menu_0008.jpg',
        car56: 'assets/bg/car0056.jpg',
        board1: 'assets/bg/wheel_0000.jpg',
        board2: 'assets/bg/wheel_0001.jpg',
        board3: 'assets/bg/wheel_0002.jpg',
        board4: 'assets/bg/wheel_0003.jpg',
        board5: 'assets/bg/wheel_0004.jpg',
        board6: 'assets/bg/wheel_0005.jpg',
        board7: 'assets/bg/wheel_0006.jpg',
        board8: 'assets/bg/wheel_0007.jpg',
        board9: 'assets/bg/wheel_0008.jpg',
        board10: 'assets/bg/wheel_0009.jpg',
        board11: 'assets/bg/wheel_0010.jpg',
        board12: 'assets/bg/wheel_0011.jpg',
        board13: 'assets/bg/wheel_0012.jpg',
        board14: 'assets/bg/wheel_0013.jpg',
        board15: 'assets/bg/wheel_0014.jpg',
        board16: 'assets/bg/wheel_0015.jpg',
        board17: 'assets/bg/wheel_0016.jpg',
        board18: 'assets/bg/wheel_0017.jpg',
        board19: 'assets/bg/wheel_0018.jpg',
        board20: 'assets/bg/wheel_0019.jpg',
        board21: 'assets/bg/wheel_0020.jpg',
        board22: 'assets/bg/wheel_0021.jpg',
        board23: 'assets/bg/wheel_0022.jpg',
        board24: 'assets/bg/wheel_0023.jpg',
        board25: 'assets/bg/wheel_0024.jpg',
    },
    // Key sprites (indexed by wheel.dat slot). 387x387 are wheel faces.
    sprites: {
        wheelFace1: 'assets/sprites/wheel_0406.png',
        wheelFace2: 'assets/sprites/wheel_0409.png',
        wheelFace3: 'assets/sprites/wheel_0412.png',
        wheelFace4: 'assets/sprites/wheel_0413.png',
        wheelFace5: 'assets/sprites/wheel_0414.png',
        wheelFace6: 'assets/sprites/wheel_0417.png',
        wheelFace7: 'assets/sprites/wheel_0420.png',
        wheelFace8: 'assets/sprites/wheel_0423.png',
        wheelFace9: 'assets/sprites/wheel_0426.png',
        wheelFace10: 'assets/sprites/wheel_0427.png',
        wheelFace11: 'assets/sprites/wheel_0433.png',
        banner1: 'assets/sprites/wheel_0484.png',   // 421x270 panel
        banner2: 'assets/sprites/wheel_0485.png',   // 421x271 panel
        panel1: 'assets/sprites/wheel_0487.png',    // 421x355
        panel2: 'assets/sprites/wheel_0488.png',    // 421x489
        panel3: 'assets/sprites/wheel_0489.png',    // 421x539
        prize1: 'assets/sprites/wheel_0455.png',    // 488x296
        prize2: 'assets/sprites/wheel_0456.png',    // 288x225
        prize3: 'assets/sprites/wheel_0457.png',    // 400x346
        prize4: 'assets/sprites/wheel_0458.png',    // 539x396
        holder1: 'assets/sprites/wheel_0507.png',
        holder2: 'assets/sprites/wheel_0511.png',
        arrow1: 'assets/sprites/wheel_0504.png',
        arrow2: 'assets/sprites/wheel_0505.png',
        titleLogo: 'assets/sprites/wheel_0389.png', // 577x28 wide strip
        titleWide: 'assets/sprites/wheel_0483.png', // 578x28
        strip1: 'assets/sprites/wheel_0388.png',    // 282x16
        strip2: 'assets/sprites/wheel_0482.png',    // 281x16
        wheelCenter: 'assets/sprites/wheel_0435.png',// 229x232
        wheelCenter2: 'assets/sprites/wheel_0436.png',
        wedge1: 'assets/sprites/wheel_0352.png',    // 95x205
        wedge2: 'assets/sprites/wheel_0359.png',    // 111x229
        wedge3: 'assets/sprites/wheel_0363.png',    // 131x445
        wedge4: 'assets/sprites/wheel_0364.png',    // 123x443
        wedge5: 'assets/sprites/wheel_0365.png',    // 139x453
        wedge6: 'assets/sprites/wheel_0366.png',    // 155x454
    },
    /* Sound effects (original WAVs from wheel.dat / menus.dat).
     * Without a definitive mapping to actions, we still ship them so they are
     * available; the engine prefers these by index with sensible guesses and
     * falls back to synthesized audio when a clip is not suitable.
     */
    audio: {
        spin1: 'assets/audio/wheel_2231.wav',   // wheel sfx
        spinLoop: 'assets/audio/spin_loop.wav', // wheel.dat #6723 spin loop
        spinTick: 'assets/audio/spin_tick.wav', // wheel.dat #6702 spin tick
        reveal: 'assets/audio/wheel_2232.wav',
        coin: 'assets/audio/wheel_2233.wav',
        applause1: 'assets/audio/wheel_2234.wav',
        applause2: 'assets/audio/wheel_2235.wav',
        wrong1: 'assets/audio/wheel_2236.wav',
        wrong2: 'assets/audio/wheel_2237.wav',
        chime1: 'assets/audio/menu_0412.wav',
        chime2: 'assets/audio/menu_0413.wav',
        chime3: 'assets/audio/menu_0414.wav',
        chime4: 'assets/audio/menu_0415.wav',
        chime5: 'assets/audio/menu_0416.wav',
    },
    video: {
        logo: 'assets/video/Hasbro.mp4',
        intro: 'assets/video/GameOpen.mp4',
        solo: 'assets/video/SoloGame.mp4',
        winner: 'assets/video/win_in.mp4',
        bonus1: 'assets/video/BR_LV_b.mp4',
        bonus2: 'assets/video/BR_UA_b.mp4',
        bonus3: 'assets/video/BR_WS_b.mp4',
        bonus4: 'assets/video/BR_GO_b.mp4',
        bonus5: 'assets/video/BR_DO_b.mp4',
        bonus6: 'assets/video/BR_OE_b.mp4',
        prize1: 'assets/video/rprize01.mp4',
        prize2: 'assets/video/rprize06.mp4',
        prize3: 'assets/video/ScorePt1.mp4',
    }
};

const ImageCache = {};
const AudioCache = {};

function preloadImage(url, name) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => { ImageCache[name] = img; resolve(true); };
        img.onerror = () => { console.warn('IMG FAIL', url); resolve(false); };
        img.src = url;
    });
}

async function preloadAll(onProgress) {
    let total = 0, done = 0;
    const tasks = [];
    const bump = (n) => { done += n; if (onProgress) onProgress(done / total); };

    const entries = [];
    for (const [name, url] of Object.entries(ASSETS.bg)) entries.push(['bg', name, url]);
    for (const [name, url] of Object.entries(ASSETS.sprites)) entries.push(['sp', name, url]);
    for (const [name, url] of Object.entries(ASSETS.audio)) entries.push(['au', name, url]);
    total = entries.length + Object.keys(ASSETS.video).length;

    // Images
    for (const [type, name, url] of entries) {
        if (type === 'bg' || type === 'sp') {
            tasks.push(preloadImage(url, 'bg:' + name).then(() => bump(1)));
        }
    }
    // Audio (decode eagerly so timing is usable)
    for (const [type, name, url] of entries) {
        if (type === 'au') {
            tasks.push(new Promise((res) => {
                const a = new Audio(url);
                a.preload = 'auto';
                a.oncanplaythrough = () => { AudioCache[name] = a; bump(1); res(true); };
                a.onerror = () => { console.warn('AUD FAIL', url); bump(1); res(false); };
            }));
        }
    }
    for (const [name, url] of Object.entries(ASSETS.video)) {
        tasks.push(new Promise((res) => {
            const v = document.createElement('video');
            v.preload = 'metadata';
            v.onloadedmetadata = () => { AudioCache['vid:' + name] = v; bump(1); res(true); };
            v.onerror = () => { bump(1); res(false); };
            v.src = url;
        }));
    }

    const withTimeout = (p, ms) => Promise.race([p, new Promise((res) => setTimeout(() => res(false), ms))]);
    const results = await Promise.allSettled(tasks.map((t) => withTimeout(t, 25000)));
    return results.filter(r => r.status === 'fulfilled').length;
}

function bgImage(name) {
    // Fall back to numbered rotation if named asset failed to load
    if (!ImageCache['bg:' + name] && ASSETS.bg[name]) {
        // Try progressive numbering around the requested one
        const m = /board(\d+)/.exec(name);
        if (m) {
            const n = parseInt(m[1], 10);
            for (let i = 0; i < 26; i++) {
                const alt = 'board' + ((n + i) % 26);
                if (ImageCache['bg:' + alt]) return ImageCache['bg:' + alt];
            }
        }
    }
    return ImageCache['bg:' + name];
}

function spriteImage(name) {
    if (ImageCache['sp:' + name]) return ImageCache['sp:' + name];
    // Global fallback attempt across all sprite keys
    const m = /(\d+)/.exec(name);
    if (m) {
        const n = parseInt(m[1], 10);
        for (const [k, img] of Object.entries(ImageCache)) {
            if (k.startsWith('sp:') && k.includes(String(n % 100 + 400))) return img;
        }
    }
    return null;
}

/* ------------------------------------------------------------------ *
 *  Sequence (marker-12) animation manifests + frame/sprite store.
 *  Blob spec (verified on all 1199): 16-byte header, then chunks
 *  0x14 path (cache key), 0x88 bbox, 0x05 audio cue, 0x03 frame layer
 *  (frame_id/layer, sprite archive id, absolute 800x600 dest rect).
 *  Format docs: REVERSE_ENGINEERING.md.
 * ------------------------------------------------------------------ */
const SEQ = {
    manifests: null,
    spriteIndex: null,
    frameCache: {},
    loadPromise: null,
    load() {
        if (this.manifests) return Promise.resolve(this.manifests);
        if (!this.loadPromise) {
            this.loadPromise = Promise.all([
                fetch('assets/seq/manifests.json').then(r => r.json()).catch(() => ({})),
                fetch('assets/sprites/index.json').then(r => r.json()).catch(() => ({}))
            ]).then(([m, s]) => { this.manifests = m; this.spriteIndex = s; return m; });
        }
        return this.loadPromise;
    },
    get(id) {
        return (this.manifests && this.manifests[id]) || null;
    },
    frameURL(mfile, spriteId) {
        if (!this.spriteIndex) return null;
        const key = (mfile === 'wheel.dat' ? 'w' : 'm') + String(spriteId).padStart(4, '0');
        return this.spriteIndex[key] || null;
    },
    loadFrame(mfile, spriteId) {
        const url = this.frameURL(mfile, spriteId);
        if (!url) return Promise.resolve(null);
        if (this.frameCache[url]) return Promise.resolve(this.frameCache[url]);
        return new Promise((res) => {
            const img = new Image();
            img.onload = () => { this.frameCache[url] = img; res(img); };
            img.onerror = () => res(null);
            img.src = url;
        });
    },
    cueURL(mfile, sndId) {
        const tag = (mfile === 'wheel.dat' ? 'w' : 'm') + String(sndId).padStart(4, '0');
        return 'assets/audio/seq/' + tag + '.wav';
    }
};