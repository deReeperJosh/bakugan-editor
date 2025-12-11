// saveFormat.js
import {
    BAKUGAN,
    ATTRIBUTES,
    CARDS,
    STYLING_FIELDS,
    OPPONENT_NAMES,
} from "./constants";

// -----------------
// Platform configs
// -----------------

const FORMAT_CONFIGS = {
    ps3: {
        saveSize: null,
        baseOffset: 227,
        cardBaseOffset: -48,
        playerNameOffset: 0x00C5,
        stylingOffset: 0x31BF,
        deckOffsets: [0x2908, 0x2954],
        wordEndian: "big",
        deckNameBackOffset: 39,
        statsOffsets: {
            rankingPoints: 0x2AAD,
            bakuganPoints: 0x2AB1,
            battles: 0x2AB7,
            wins: 0x2AB9,
            losses: 0x2ABB,
            sphereAttacks: 0x2ABF,
            doubleStands: 0x2AC1,
            oneVsOne: 0x2AC3,
            battleRoyale: 0x2AC5,
            tagTeam: 0x2AC7,
            opponentWins: 0x2ACA,
            attributeUsageBase: 0x2B75,
        },
    },
    wii: {
        saveSize: 13952,
        baseOffset: 275,
        cardBaseOffset: 0,
        playerNameOffset: 0x00F5,
        stylingOffset: 0x31EF,
        deckOffsets: [0x2938, 0x2984],
        wordEndian: "big",
        deckNameBackOffset: 39,      // assumption
        statsOffsets: null,
    },
    ps2: {
        saveSize: 13920,
        baseOffset: 2336,
        cardBaseOffset: 2064,
        playerNameOffset: 0x0904,
        stylingOffset: 0x39FE,
        deckOffsets: [0x3148, 0x3194],
        wordEndian: "little",
        deckNameBackOffset: 40,
        statsOffsets: null,
    },
    x360: {
        saveSize: 13952,
        baseOffset: 319,
        cardBaseOffset: 44,
        playerNameOffset: 0x0121,
        stylingOffset: 0x321B,
        deckOffsets: [0x2964, 0x29B0],
        wordEndian: "big",
        deckNameBackOffset: 39,      // assumption
        statsOffsets: null,
    },
};

export const PLATFORMS = ["ps3", "wii", "x360", "ps2"];

// -----------------
// Core config
// -----------------

const BAKUGAN_BLOCK_SIZE = 120;
const ATTRIBUTE_BLOCK_SIZE = 20;
const ENTRY_SIZE = 14;

const PLAYER_NAME_MAX_CHARS = 8;
const STYLING_LENGTH = 45;

// Deck encoding
const DECK_LENGTH = 36;
const DECK_CARD_BASE_ID = 10232; // 0x27F8

// -------------
// Lists & maps
// -------------

export const bakuganList = [...BAKUGAN].sort((a, b) => a.id - b.id);
export const attributeList = [...ATTRIBUTES].sort((a, b) => a.id - b.id);

const bakuganNameById = Object.fromEntries(
    bakuganList.map(({ id, name }) => [id, name])
);
const attributeNameById = Object.fromEntries(
    attributeList.map(({ id, name }) => [id, name])
);

export const CARD_TYPES = ["Gold", "Silver", "Bronze", "Red", "Green", "Blue"];

export const cardsByType = CARD_TYPES.map((type) => ({
    type,
    cards: (CARDS[type] || []).map((c) => ({ ...c, type })),
}));

export const cardList = cardsByType.flatMap((g) => g.cards);

// -----------------
// Save context
// -----------------

export function getSaveContext(platform, saveSlot = 0) {
    const cfg = FORMAT_CONFIGS[platform];
    if (!cfg) {
        throw new Error(`Unknown platform: ${platform}`);
    }

    let slot = saveSlot || 0;
    if (platform === "ps3") slot = 0;
    if (platform === "wii" || platform === "ps2" || platform === "x360") {
        if (slot < 0) slot = 0;
        if (slot > 3) slot = 3;
    }

    const shift = cfg.saveSize ? cfg.saveSize * slot : 0;

    const baseOffset = cfg.baseOffset + shift;
    const cardBaseOffset = cfg.cardBaseOffset + shift;
    const playerNameOffset = cfg.playerNameOffset + shift;
    const stylingOffset = cfg.stylingOffset + shift;
    const deckOffsets = cfg.deckOffsets.map((o) => o + shift);
    const statsOffsets = cfg.statsOffsets
        ? Object.fromEntries(
            Object.entries(cfg.statsOffsets).map(([k, v]) => [k, v + shift])
        )
        : null;

    const deckNameOffsets =
        cfg.deckNameBackOffset != null
            ? deckOffsets.map((o) => o - cfg.deckNameBackOffset)
            : null;

    return {
        platform,
        slot,
        baseOffset,
        cardBaseOffset,
        playerNameOffset,
        stylingOffset,
        deckOffsets,
        deckNameOffsets,      // 👈 new
        wordEndian: cfg.wordEndian || "big",
        statsOffsets,
    };
}

// -----------------
// Core helpers
// -----------------

function readU16(bytes, offset, ctx) {
    if (ctx.wordEndian === "little") {
        // little-endian: low byte first
        return (bytes[offset] | (bytes[offset + 1] << 8)) >>> 0;
    }
    // big-endian (default)
    return ((bytes[offset] << 8) | bytes[offset + 1]) >>> 0;
}

function writeU16(bytes, offset, value, ctx) {
    const v = value & 0xffff;
    if (ctx.wordEndian === "little") {
        bytes[offset] = v & 0xff;
        bytes[offset + 1] = (v >> 8) & 0xff;
    } else {
        bytes[offset] = (v >> 8) & 0xff;
        bytes[offset + 1] = v & 0xff;
    }
}

// 24-bit helpers for ranking/bakugan points (3 bytes)
function readU24(bytes, offset, ctx) {
    if (ctx.wordEndian === "little") {
        // low-mid-high: b0 + (b1<<8) + (b2<<16)
        return (
            (bytes[offset] |
                (bytes[offset + 1] << 8) |
                (bytes[offset + 2] << 16)) >>> 0
        );
    }
    // big-endian: high-mid-low
    return (
        (bytes[offset] << 16) |
        (bytes[offset + 1] << 8) |
        bytes[offset + 2]
    ) >>> 0;
}

function writeU24(bytes, offset, value, ctx) {
    const v = value & 0xffffff;
    if (ctx.wordEndian === "little") {
        bytes[offset] = v & 0xff;
        bytes[offset + 1] = (v >> 8) & 0xff;
        bytes[offset + 2] = (v >> 16) & 0xff;
    } else {
        bytes[offset] = (v >> 16) & 0xff;
        bytes[offset + 1] = (v >> 8) & 0xff;
        bytes[offset + 2] = v & 0xff;
    }
}

export function parseSaveFile(buffer) {
    const bytes = new Uint8Array(buffer);
    return { buffer, bytes };
}

export function serializeSaveFile(parsed) {
    if (!parsed || !parsed.buffer) {
        throw new Error("Nothing to serialize");
    }
    return parsed.buffer;
}

export function getBakuganOffset(ctx, bakuganId, attributeId) {
    return (
        ctx.baseOffset +
        bakuganId * BAKUGAN_BLOCK_SIZE +
        attributeId * ATTRIBUTE_BLOCK_SIZE
    );
}

// ---------------------
// Bakugan entry parsing
// ---------------------

export function readBakuganEntry(bytes, ctx, bakuganId, attributeId) {
    const offset = getBakuganOffset(ctx, bakuganId, attributeId);

    if (offset + ENTRY_SIZE > bytes.length) {
        throw new Error(
            `Entry at offset ${offset} out of range (file size: ${bytes.length})`
        );
    }

    const id = bytes[offset + 0];
    const attribute = bytes[offset + 4];

    // Power: 2 bytes, big-endian
    const power = readU16(bytes, offset + 5, ctx);

    const speed = bytes[offset + 8];
    const defense = bytes[offset + 9];
    const acceleration = bytes[offset + 10];
    const endurance = bytes[offset + 11];
    const jump = bytes[offset + 12];
    const level = bytes[offset + 13];

    return {
        offset,
        bakuganId,
        bakuganName: bakuganNameById[bakuganId] ?? `ID ${bakuganId}`,
        attributeId,
        attributeName: attributeNameById[attributeId] ?? `Attr ${attributeId}`,
        raw: {
            id,
            attribute,
            power,
            speed,
            defense,
            acceleration,
            endurance,
            jump,
            level,
        },
    };
}

export function writeBakuganEntry(bytes, ctx, bakuganId, attributeId, raw) {
    const offset = getBakuganOffset(ctx, bakuganId, attributeId);

    if (offset + ENTRY_SIZE > bytes.length) {
        throw new Error(
            `Entry at offset ${offset} out of range (file size: ${bytes.length})`
        );
    }

    bytes[offset + 0] = bakuganId ?? 0;
    bytes[offset + 4] = attributeId ?? 0;

    const power = raw.power ?? 0;
    writeU16(bytes, offset + 5, power, ctx);

    bytes[offset + 8] = raw.speed ?? 0;
    bytes[offset + 9] = raw.defense ?? 0;
    bytes[offset + 10] = raw.acceleration ?? 0;
    bytes[offset + 11] = raw.endurance ?? 0;
    bytes[offset + 12] = raw.jump ?? 0;
    bytes[offset + 13] = raw.level ?? 0;
}

// -------------
// Card flags
// -------------

function getCardOffset(ctx, cardId) {
    return ctx.cardBaseOffset + cardId;
}

export function readCardFlag(bytes, ctx, cardId) {
    const offset = getCardOffset(ctx, cardId);
    if (offset >= bytes.length) {
        throw new Error(
            `Card offset ${offset} (cardId ${cardId}) out of range (file size: ${bytes.length})`
        );
    }
    return bytes[offset] !== 0;
}

export function writeCardFlag(bytes, ctx, cardId, unlocked) {
    const offset = getCardOffset(ctx, cardId);
    if (offset >= bytes.length) {
        throw new Error(
            `Card offset ${offset} (cardId ${cardId}) out of range (file size: ${bytes.length})`
        );
    }
    bytes[offset] = unlocked ? 1 : 0;
}

// -------------
// Player name
// -------------

export function readPlayerName(bytes, ctx) {
    const base = ctx.playerNameOffset;
    const chars = [];

    for (let i = 0; i < PLAYER_NAME_MAX_CHARS; i++) {
        const charByte = bytes[base + i * 2];
        if (charByte === 0x00) break;
        chars.push(String.fromCharCode(charByte));
    }

    return chars.join("");
}

export function writePlayerName(bytes, ctx, name) {
    const base = ctx.playerNameOffset;
    const safeName = (name || "").slice(0, PLAYER_NAME_MAX_CHARS);

    for (let i = 0; i < PLAYER_NAME_MAX_CHARS; i++) {
        const idx = base + i * 2;
        let charCode = 0;

        if (i < safeName.length) {
            const c = safeName.charCodeAt(i);
            charCode = c >= 0x20 && c <= 0x7e ? c : 0x3f; // '?'
        }

        bytes[idx] = charCode;
        bytes[idx + 1] = 0x00; // padding
    }
}

// -------------
// Styling block
// -------------

export function readStyling(bytes, ctx) {
    const base = ctx.stylingOffset;

    if (base + STYLING_LENGTH > bytes.length) {
        throw new Error(
            `Styling block out of range (offset ${base}, length ${STYLING_LENGTH}, file size ${bytes.length})`
        );
    }

    const styling = {};

    for (const field of STYLING_FIELDS) {
        const idx = base + field.byteOffset;
        styling[field.key] = bytes[idx];
    }

    return styling;
}

export function writeStyling(bytes, ctx, styling) {
    const base = ctx.stylingOffset;

    if (base + STYLING_LENGTH > bytes.length) {
        throw new Error(
            `Styling block out of range (offset ${base}, length ${STYLING_LENGTH}, file size ${bytes.length})`
        );
    }

    for (const field of STYLING_FIELDS) {
        const idx = base + field.byteOffset;
        const value = styling[field.key];

        if (typeof value === "number") {
            bytes[idx] = value & 0xff;
            const pad = idx + 1;
            if (pad < base + STYLING_LENGTH) {
                bytes[pad] = 0x00;
            }
        }
    }
}

// -------------
// Decks
// -------------

export function readDeck(bytes, ctx, deckIndex) {
    const base = ctx.deckOffsets[deckIndex];
    if (base == null) {
        throw new Error(`Invalid deck index ${deckIndex}`);
    }
    if (base + DECK_LENGTH > bytes.length) {
        throw new Error(
            `Deck ${deckIndex + 1} block out of range (offset ${base}, length ${DECK_LENGTH}, file size ${bytes.length})`
        );
    }

    const deck = {
        bakuganSlots: [],
        gateCards: [],
        abilityCards: [],
    };

    // Bakugan slots
    for (let i = 0; i < 3; i++) {
        const offset = base + i * 2;
        const v = readU16(bytes, offset, ctx);

        if (v === 0xffff) {
            deck.bakuganSlots.push({ bakuganId: null, attributeId: null });
        } else {
            const bakuganId = Math.floor(v / 6);
            const attributeId = v % 6;
            deck.bakuganSlots.push({ bakuganId, attributeId });
        }
    }

    // Gate cards
    for (let i = 0; i < 3; i++) {
        const offset = base + 12 + i * 2;
        const v = readU16(bytes, offset, ctx);

        if (v === 0xffff) {
            deck.gateCards.push({ cardId: null });
        } else {
            const cardId = v + DECK_CARD_BASE_ID;
            deck.gateCards.push({ cardId });
        }
    }

    // Ability cards
    for (let i = 0; i < 3; i++) {
        const offset = base + 24 + i * 2;
        const v = readU16(bytes, offset, ctx);

        if (v === 0xffff) {
            deck.abilityCards.push({ cardId: null });
        } else {
            const cardId = v + DECK_CARD_BASE_ID;
            deck.abilityCards.push({ cardId });
        }
    }

    return deck;
}

export function writeDeck(bytes, ctx, deckIndex, deck) {
    const base = ctx.deckOffsets[deckIndex];
    if (base == null) {
        throw new Error(`Invalid deck index ${deckIndex}`);
    }
    if (base + DECK_LENGTH > bytes.length) {
        throw new Error(
            `Deck ${deckIndex + 1} block out of range (offset ${base}, length ${DECK_LENGTH}, file size ${bytes.length})`
        );
    }

    const writeSlot = (offset, valueOrNull) => {
        if (valueOrNull == null) {
            writeU16(bytes, offset, 0xffff, ctx);
        } else {
            writeU16(bytes, offset, valueOrNull, ctx);
        }
    };

    // Bakugan
    for (let i = 0; i < 3; i++) {
        const offset = base + i * 2;
        const slot = deck.bakuganSlots?.[i];

        if (!slot || slot.bakuganId == null || slot.attributeId == null) {
            writeSlot(offset, null);
        } else {
            const v = 6 * slot.bakuganId + slot.attributeId;
            writeSlot(offset, v);
        }
    }

    for (let i = 6; i < 12; i++) {
        bytes[base + i] = 0xff;
    }

    // Gate cards
    for (let i = 0; i < 3; i++) {
        const offset = base + 12 + i * 2;
        const slot = deck.gateCards?.[i];

        if (!slot || slot.cardId == null) {
            writeSlot(offset, null);
        } else {
            const v = slot.cardId - DECK_CARD_BASE_ID;
            writeSlot(offset, v);
        }
    }

    for (let i = 18; i < 24; i++) {
        bytes[base + i] = 0xff;
    }

    // Ability cards
    for (let i = 0; i < 3; i++) {
        const offset = base + 24 + i * 2;
        const slot = deck.abilityCards?.[i];

        if (!slot || slot.cardId == null) {
            writeSlot(offset, null);
        } else {
            const v = slot.cardId - DECK_CARD_BASE_ID;
            writeSlot(offset, v);
        }
    }

    for (let i = 30; i < 36; i++) {
        bytes[base + i] = 0xff;
    }
}

export function readStats(bytes, ctx) {
    const o = ctx.statsOffsets;
    if (!o) {
        throw new Error("Stats are not available for this platform/slot yet.");
    }

    const rankingPoints = readU24(bytes, o.rankingPoints, ctx);
    const bakuganPoints = readU24(bytes, o.bakuganPoints, ctx);

    const battles = bytes[o.battles] ?? 0;
    const wins = bytes[o.wins] ?? 0;
    const losses = bytes[o.losses] ?? 0;
    const sphereAttacks = bytes[o.sphereAttacks] ?? 0;
    const doubleStands = bytes[o.doubleStands] ?? 0;
    const oneVsOne = bytes[o.oneVsOne] ?? 0;
    const battleRoyale = bytes[o.battleRoyale] ?? 0;
    const tagTeam = bytes[o.tagTeam] ?? 0;

    const opponentWins = [];
    if (o.opponentWins != null) {
        for (let i = 0; i < 16; i++) {
            opponentWins.push(bytes[o.opponentWins + i] ?? 0);
        }
    }

    const attributeUsage = [];
    if (o.attributeUsageBase != null) {
        for (let i = 0; i < 6; i++) {
            const offset = o.attributeUsageBase + i * 2; // 1 byte, 1 padding
            attributeUsage.push(bytes[offset] ?? 0);
        }
    }

    return {
        rankingPoints,
        bakuganPoints,
        battles,
        wins,
        losses,
        sphereAttacks,
        doubleStands,
        oneVsOne,
        battleRoyale,
        tagTeam,
        opponentWins,
        attributeUsage,
    };
}

export function writeStats(bytes, ctx, stats) {
    const o = ctx.statsOffsets;
    if (!o) {
        throw new Error("Stats are not available for this platform/slot yet.");
    }

    const clampByte = (n) => {
        if (Number.isNaN(n)) return 0;
        return Math.max(0, Math.min(255, n | 0));
    };

    writeU24(bytes, o.rankingPoints, stats.rankingPoints ?? 0, ctx);
    writeU24(bytes, o.bakuganPoints, stats.bakuganPoints ?? 0, ctx);

    bytes[o.battles] = clampByte(stats.battles);
    bytes[o.wins] = clampByte(stats.wins);
    bytes[o.losses] = clampByte(stats.losses);
    bytes[o.sphereAttacks] = clampByte(stats.sphereAttacks);
    bytes[o.doubleStands] = clampByte(stats.doubleStands);
    bytes[o.oneVsOne] = clampByte(stats.oneVsOne);
    bytes[o.battleRoyale] = clampByte(stats.battleRoyale);
    bytes[o.tagTeam] = clampByte(stats.tagTeam);

    if (o.opponentWins != null && Array.isArray(stats.opponentWins)) {
        for (let i = 0; i < 16; i++) {
            const v = stats.opponentWins[i] ?? 0;
            bytes[o.opponentWins + i] = clampByte(v);
        }
    }

    if (o.attributeUsageBase != null && Array.isArray(stats.attributeUsage)) {
        for (let i = 0; i < 6; i++) {
            const v = stats.attributeUsage[i] ?? 0;
            const offset = o.attributeUsageBase + i * 2;
            bytes[offset] = clampByte(v);
            bytes[offset + 1] = 0x00;
        }
    }
}

// Deck names: 10 characters, stored as [char, 0x00] pairs

export function readDeckName(bytes, ctx, deckIndex) {
    if (!ctx.deckNameOffsets) {
        throw new Error("Deck names are not configured for this platform.");
    }
    const base = ctx.deckNameOffsets[deckIndex];
    if (base == null) {
        throw new Error(`No deck name offset for deck index ${deckIndex}`);
    }
    if (base < 0 || base + 20 > bytes.length) {
        throw new Error(
            `Deck name offset ${base} out of range (file size: ${bytes.length})`
        );
    }

    const chars = [];
    for (let i = 0; i < 10; i++) {
        const charByte = bytes[base + i * 2]; // char, then padding 0x00
        if (charByte === 0x00) break;
        chars.push(String.fromCharCode(charByte));
    }
    return chars.join("");
}

export function writeDeckName(bytes, ctx, deckIndex, name) {
    if (!ctx.deckNameOffsets) {
        throw new Error("Deck names are not configured for this platform.");
    }
    const base = ctx.deckNameOffsets[deckIndex];
    if (base == null) {
        throw new Error(`No deck name offset for deck index ${deckIndex}`);
    }
    if (base < 0 || base + 20 > bytes.length) {
        throw new Error(
            `Deck name offset ${base} out of range (file size: ${bytes.length})`
        );
    }

    const safeName = (name || "").slice(0, 10);

    for (let i = 0; i < 10; i++) {
        const idx = base + i * 2;
        let charCode = 0;
        if (i < safeName.length) {
            const c = safeName.charCodeAt(i);
            charCode = c >= 0x20 && c <= 0x7e ? c : 0x3f; // '?'
        }
        bytes[idx] = charCode;
        bytes[idx + 1] = 0x00; // padding
    }
}
