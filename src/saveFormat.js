// saveFormat.js
import {
    BAKUGAN,
    ATTRIBUTES,
    CARDS,
    STYLING_FIELDS,
} from "./constants";

// -----------------
// Platform configs
// -----------------

const FORMAT_CONFIGS = {
    ps3: {
        saveSize: null,              // single save per file
        baseOffset: 227,
        cardBaseOffset: -48,
        playerNameOffset: 0x00C5,
        stylingOffset: 0x31BF,
        deckOffsets: [0x2908, 0x2954],
        wordEndian: "big",           // 16-bit values stored big-endian
    },
    wii: {
        saveSize: 13952,
        baseOffset: 275,
        cardBaseOffset: 0,
        playerNameOffset: 0x00F5,
        stylingOffset: 0x31EF,
        deckOffsets: [0x2938, 0x2984],
        wordEndian: "big",
    },
    ps2: {
        saveSize: 13920,             // example: same as Wii; adjust if different
        baseOffset: 2336,             // example: same pattern as Wii; adjust if needed
        cardBaseOffset: 2064,
        playerNameOffset: 0x0904,
        stylingOffset: 0x39FE,
        deckOffsets: [0x3148, 0x3194],
        wordEndian: "little",
    },
    x360: {
        saveSize: 13952,
        baseOffset: 319,
        cardBaseOffset: 44,
        playerNameOffset: 0x00121,
        stylingOffset: 0x321B,
        deckOffsets: [0x2964, 0x29B0],
        wordEndian: "big",
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
    if (platform === "ps3") slot = 0; // only one save
    if (platform === "wii" || platform === "x360" || platform === "ps2") {
        if (slot < 0) slot = 0;
        if (slot > 3) slot = 3;
    }

    const shift = cfg.saveSize ? cfg.saveSize * slot : 0;

    return {
        platform,
        slot,
        baseOffset: cfg.baseOffset + shift,
        cardBaseOffset: cfg.cardBaseOffset + shift,
        playerNameOffset: cfg.playerNameOffset + shift,
        stylingOffset: cfg.stylingOffset + shift,
        deckOffsets: cfg.deckOffsets.map((o) => o + shift),
        wordEndian: cfg.wordEndian || "big",
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
