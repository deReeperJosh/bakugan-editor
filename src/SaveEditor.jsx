// BakuganSaveEditor.jsx
import React, {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from "react";
import {
    parseSaveFile,
    serializeSaveFile,
    bakuganList,
    attributeList,
    cardList,
    readBakuganEntry,
    writeBakuganEntry,
    readCardFlag,
    writeCardFlag,
    readPlayerName,
    writePlayerName,
    readStyling,
    writeStyling,
    readDeck,
    writeDeck,
    PLATFORMS,
    getSaveContext,
    readStats,
    writeStats,
    readDeckName,
    writeDeckName,
} from "./saveFormat";
import { STYLING_FIELDS, getStylingOptions, OPPONENT_NAMES } from "./constants";

function clamp(value, min, max) {
    if (Number.isNaN(value)) return min;
    return Math.min(Math.max(value, min), max);
}

function statDisplayFromStored(stored) {
    let v = Math.round(stored / 10);
    if (v < 1) v = 1;
    if (v > 5) v = 5;
    return v;
}

function statStoredFromDisplay(display) {
    const v = clamp(Math.round(display), 1, 5);
    return v * 10;
}

// Card UI grouping
const CARD_TYPE_ROWS = [
    { title: "Gate Cards", types: ["Gold", "Silver", "Bronze"] },
    { title: "Ability Cards", types: ["Red", "Green", "Blue"] },
];

const CARD_TYPE_STYLES = {
    Gold: { border: "border-amber-400", headerBg: "bg-amber-50" },
    Silver: { border: "border-slate-400", headerBg: "bg-slate-50" },
    Bronze: { border: "border-orange-500", headerBg: "bg-orange-50" },
    Red: { border: "border-red-500", headerBg: "bg-red-50" },
    Green: { border: "border-emerald-500", headerBg: "bg-emerald-50" },
    Blue: { border: "border-sky-500", headerBg: "bg-sky-50" },
};

export default function BakuganSaveEditor() {
    const [fileName, setFileName] = useState("");
    const [parsed, setParsed] = useState(null);
    const [error, setError] = useState("");
    const [isDragging, setIsDragging] = useState(false);

    const [platform, setPlatform] = useState("ps3");
    const [saveSlot, setSaveSlot] = useState(0); // 0-based; Wii uses 0–3

    const [activeTab, setActiveTab] = useState("bakugan");

    // Bakugan stats
    const [selectedBakuganId, setSelectedBakuganId] = useState(
        bakuganList[0]?.id ?? 0
    );
    const [selectedAttributeId, setSelectedAttributeId] = useState(
        attributeList[0]?.id ?? 0
    );
    const [entry, setEntry] = useState(null);
    const [editableStats, setEditableStats] = useState(null);

    // Cards (unlock flags)
    const [cardStates, setCardStates] = useState(null);
    const [cardFilter, setCardFilter] = useState("");

    // Appearance
    const [playerName, setPlayerName] = useState("");
    const [styling, setStyling] = useState(null);

    // Decks
    const [decks, setDecks] = useState(null);
    const [deckNames, setDeckNames] = useState(null);

    // Stats (battles, wins, ranking, etc.)
    const [stats, setStats] = useState(null);

    // Debug / hex viewer
    const [debugOffsetInput, setDebugOffsetInput] = useState("0");
    const [debugLengthInput, setDebugLengthInput] = useState("256");
    const [debugHighlight, setDebugHighlight] = useState(null);

    // ---------- File handling ----------

    const handleFile = useCallback(async (file) => {
        if (!file) return;
        setError("");
        setFileName(file.name);

        try {
            const buffer = await file.arrayBuffer();
            const parsedSave = parseSaveFile(buffer);
            setParsed(parsedSave);
        } catch (e) {
            console.error(e);
            setError(e.message || "Failed to read/parse file.");
            setParsed(null);
            setEntry(null);
            setEditableStats(null);
            setCardStates(null);
            setPlayerName("");
            setStyling(null);
            setDecks(null);
        }
    }, []);

    const onFileInputChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        await handleFile(file);
    };

    const onDrop = async (e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (!file) return;
        await handleFile(file);
    };

    const onDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const onDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDownload = () => {
        if (!parsed) return;
        try {
            const buffer = serializeSaveFile(parsed);
            const blob = new Blob([buffer], { type: "application/octet-stream" });
            const url = URL.createObjectURL(blob);

            const a = document.createElement("a");
            a.href = url;
            a.download = fileName || "savefile.dat";
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error(e);
            setError("Failed to serialize save file.");
        }
    };

    // ---------- Save context (platform + slot) ----------
    // useMemo so ctx is stable and doesn't trigger cascading effects
    const ctx = useMemo(() => {
        if (!parsed || !platform) return null;
        try {
            return getSaveContext(platform, saveSlot);
        } catch (e) {
            console.error(e);
            setError(e.message || "Invalid platform/save slot configuration.");
            return null;
        }
    }, [parsed, platform, saveSlot]);

    // ---------- Debug info ----------

    // Parsed numeric values for debug
    const debugOffset = useMemo(() => {
        const raw = debugOffsetInput.trim() || "0";
        // Allow 0x... hex or decimal
        const n = raw.toLowerCase().startsWith("0x")
            ? parseInt(raw, 16)
            : parseInt(raw, 10);
        if (Number.isNaN(n) || n < 0) return 0;
        return n;
    }, [debugOffsetInput]);

    const debugLength = useMemo(() => {
        const raw = debugLengthInput.trim() || "256";
        const n = parseInt(raw, 10);
        if (Number.isNaN(n) || n <= 0) return 256;
        return Math.min(n, parsed?.bytes?.length ?? n);
    }, [debugLengthInput, parsed]);

    // Helper to set range + optional highlight
    const setDebugRange = (start, length, withHighlight = true) => {
        if (!parsed?.bytes) return;
        const maxLen = parsed.bytes.length;
        const s = Math.max(0, Math.min(start, maxLen - 1));
        const l = Math.max(1, Math.min(length, maxLen - s));
        setDebugOffsetInput(String(s));
        setDebugLengthInput(String(l));
        if (withHighlight) {
            setDebugHighlight({ start: s, end: s + l });
        }
    };

    const handleDebugPresetPlayerName = () => {
        if (!ctx) return;
        setDebugRange(ctx.playerNameOffset, 32);
    };

    const handleDebugPresetStyling = () => {
        if (!ctx) return;
        setDebugRange(ctx.stylingOffset, 64);
    };

    const handleDebugPresetDeck = (deckIndex) => () => {
        if (!ctx) return;
        const deckOffset = ctx.deckOffsets?.[deckIndex];
        if (deckOffset == null) return;

        const nameOffset = ctx.deckNameOffsets?.[deckIndex];
        const start = nameOffset != null ? nameOffset : deckOffset;
        setDebugRange(start, 80);
    };

    const handleDebugPresetStats = () => {
        if (!ctx?.statsOffsets) return;
        setDebugRange(ctx.statsOffsets.rankingPoints, 64);
    };

    // ---------- Bakugan stats ----------

    const refreshEntry = useCallback(
        (bakuganId = selectedBakuganId, attributeId = selectedAttributeId) => {
            if (!parsed?.bytes || !ctx) {
                setEntry(null);
                setEditableStats(null);
                return;
            }
            try {
                const data = readBakuganEntry(parsed.bytes, ctx, bakuganId, attributeId);
                setEntry(data);
            } catch (e) {
                console.error(e);
                setError(e.message || "Failed to read Bakugan data.");
                setEntry(null);
                setEditableStats(null);
            }
        },
        [parsed, ctx, selectedBakuganId, selectedAttributeId]
    );

    useEffect(() => {
        if (parsed && ctx) {
            refreshEntry();
        } else {
            setEntry(null);
            setEditableStats(null);
        }
    }, [parsed, ctx, selectedBakuganId, selectedAttributeId, refreshEntry]);

    useEffect(() => {
        if (!entry) {
            setEditableStats(null);
            return;
        }
        const { raw } = entry;
        const newEditable = {
            power: clamp(raw.power ?? 0, 0, 1000),
            speed: statDisplayFromStored(raw.speed ?? 10),
            defense: statDisplayFromStored(raw.defense ?? 10),
            acceleration: statDisplayFromStored(raw.acceleration ?? 10),
            endurance: statDisplayFromStored(raw.endurance ?? 10),
            jump: statDisplayFromStored(raw.jump ?? 10),
            level: clamp(raw.level ?? 1, 1, 10),
        };
        setEditableStats(newEditable);
    }, [entry]);

    const handleBakuganChange = (e) => {
        const id = Number(e.target.value);
        setSelectedBakuganId(id);
    };

    const handleAttributeChange = (e) => {
        const id = Number(e.target.value);
        setSelectedAttributeId(id);
    };

    const handleStatChange = (field) => (e) => {
        const value = Number(e.target.value);
        setEditableStats((prev) => ({
            ...prev,
            [field]: value,
        }));
    };

    const handleSaveStats = () => {
        if (!parsed?.bytes || !entry || !editableStats || !ctx) return;

        try {
            const power = clamp(Math.round(editableStats.power ?? 0), 0, 1000);
            const level = clamp(Math.round(editableStats.level ?? 1), 1, 10);

            const speedStored = statStoredFromDisplay(editableStats.speed ?? 1);
            const defenseStored = statStoredFromDisplay(editableStats.defense ?? 1);
            const accelStored = statStoredFromDisplay(
                editableStats.acceleration ?? 1
            );
            const enduranceStored = statStoredFromDisplay(
                editableStats.endurance ?? 1
            );
            const jumpStored = statStoredFromDisplay(editableStats.jump ?? 1);

            const rawToWrite = {
                ...entry.raw,
                power,
                level,
                speed: speedStored,
                defense: defenseStored,
                acceleration: accelStored,
                endurance: enduranceStored,
                jump: jumpStored,
            };

            writeBakuganEntry(
                parsed.bytes,
                ctx,
                selectedBakuganId,
                selectedAttributeId,
                rawToWrite
            );

            refreshEntry(selectedBakuganId, selectedAttributeId);
        } catch (e) {
            console.error(e);
            setError(e.message || "Failed to save stats.");
        }
    };

    // ---------- Cards (unlock flags) ----------

    useEffect(() => {
        if (!parsed?.bytes || !ctx) {
            setCardStates(null);
            return;
        }
        try {
            const states = cardList.map((card) => ({
                ...card,
                unlocked: readCardFlag(parsed.bytes, ctx, card.id),
            }));
            setCardStates(states);
        } catch (e) {
            console.error(e);
            setError(e.message || "Failed to read card data.");
            setCardStates(null);
        }
    }, [parsed, ctx]);

    const handleCardToggle = (cardId) => (e) => {
        if (!parsed?.bytes || !ctx) return;
        const unlocked = e.target.checked;
        try {
            writeCardFlag(parsed.bytes, ctx, cardId, unlocked);
            setCardStates((prev) =>
                prev ? prev.map((c) => (c.id === cardId ? { ...c, unlocked } : c)) : prev
            );
        } catch (e2) {
            console.error(e2);
            setError(e2.message || "Failed to update card state.");
        }
    };

    const handleUnlockAllCards = () => {
        if (!parsed?.bytes || !cardStates || !ctx) return;
        try {
            cardStates.forEach((card) => {
                writeCardFlag(parsed.bytes, ctx, card.id, true);
            });
            setCardStates((prev) =>
                prev ? prev.map((c) => ({ ...c, unlocked: true })) : prev
            );
        } catch (e) {
            console.error(e);
            setError(e.message || "Failed to unlock all cards.");
        }
    };

    const handleLockAllCards = () => {
        if (!parsed?.bytes || !cardStates || !ctx) return;
        try {
            cardStates.forEach((card) => {
                writeCardFlag(parsed.bytes, ctx, card.id, false);
            });
            setCardStates((prev) =>
                prev ? prev.map((c) => ({ ...c, unlocked: false })) : prev
            );
        } catch (e) {
            console.error(e);
            setError(e.message || "Failed to lock all cards.");
        }
    };

    const totalCards =
        cardStates?.length ?? 0;
    const unlockedCount =
        cardStates?.reduce((acc, c) => (c.unlocked ? acc + 1 : acc), 0) ?? 0;

    const filteredCardsByType =
        cardStates &&
        cardStates.reduce((acc, card) => {
            const term = cardFilter.toLowerCase();
            if (term && !card.name.toLowerCase().includes(term)) {
                return acc;
            }
            if (!acc[card.type]) acc[card.type] = [];
            acc[card.type].push(card);
            return acc;
        }, {});

    // ---------- Appearance (name + styling + decks) ----------

    useEffect(() => {
        if (!parsed?.bytes || !ctx) {
            setPlayerName("");
            setStyling(null);
            setDecks(null);
            setDeckNames(null);
            return;
        }

        // Player name
        try {
            const name = readPlayerName(parsed.bytes, ctx);
            setPlayerName(name);
        } catch (e) {
            console.error(e);
            setError(e.message || "Failed to read player name.");
            setPlayerName("");
        }

        // Styling
        try {
            const currentStyling = readStyling(parsed.bytes, ctx);
            setStyling(currentStyling);
        } catch (e) {
            console.error(e);
            setError(e.message || "Failed to read styling.");
            setStyling(null);
        }

        // Decks
        try {
            const deck1 = readDeck(parsed.bytes, ctx, 0);
            const deck2 = readDeck(parsed.bytes, ctx, 1);
            setDecks([deck1, deck2]);

            try {
                const name1 = readDeckName(parsed.bytes, ctx, 0);
                const name2 = readDeckName(parsed.bytes, ctx, 1);
                setDeckNames([name1, name2]);
            } catch (nameErr) {
                console.error(nameErr);
                setDeckNames(null); // deck names not configured on this platform
            }
        } catch (e) {
            console.error(e);
            setError(e.message || "Failed to read decks.");
            setDecks(null);
            setDeckNames(null);
        }
    }, [parsed, ctx]);

    const handleSavePlayerName = () => {
        if (!parsed?.bytes || !ctx) return;
        try {
            writePlayerName(parsed.bytes, ctx, playerName);
            const updated = readPlayerName(parsed.bytes, ctx);
            setPlayerName(updated);
        } catch (e) {
            console.error(e);
            setError(e.message || "Failed to save player name.");
        }
    };

    const handleSaveStyling = () => {
        if (!parsed?.bytes || !styling || !ctx) return;
        try {
            writeStyling(parsed.bytes, ctx, styling);
            const updated = readStyling(parsed.bytes, ctx);
            setStyling(updated);
        } catch (e) {
            console.error(e);
            setError(e.message || "Failed to save styling.");
        }
    };

    const handleStylingChange = (fieldKey) => (e) => {
        const value = Number(e.target.value);
        setStyling((prev) => ({
            ...prev,
            [fieldKey]: value,
        }));
    };

    const stylingFieldsByGroup = STYLING_FIELDS.reduce((acc, field) => {
        if (!acc[field.group]) acc[field.group] = [];
        acc[field.group].push(field);
        return acc;
    }, {});

    // ---------- Decks ----------

    const GATE_TYPES = ["Gold", "Silver", "Bronze"];
    const gateCardOptions = cardList.filter((c) => GATE_TYPES.includes(c.type));
    const abilityCardOptions = cardList; // any card allowed as ability card

    const updateDeckSlot = (deckIndex, section, slotIndex, changes) => {
        setDecks((prev) => {
            if (!prev) return prev;
            const copy = prev.map((d) => ({ ...d }));
            const deck = { ...copy[deckIndex] };

            if (section === "bakugan") {
                const slots = deck.bakuganSlots.map((s) => ({ ...s }));
                slots[slotIndex] = { ...slots[slotIndex], ...changes };
                deck.bakuganSlots = slots;
            } else if (section === "gate") {
                const slots = deck.gateCards.map((s) => ({ ...s }));
                slots[slotIndex] = { ...slots[slotIndex], ...changes };
                deck.gateCards = slots;
            } else if (section === "ability") {
                const slots = deck.abilityCards.map((s) => ({ ...s }));
                slots[slotIndex] = { ...slots[slotIndex], ...changes };
                deck.abilityCards = slots;
            }

            copy[deckIndex] = deck;
            return copy;
        });
    };

    const handleBakuganSlotChange = (deckIndex, slotIndex, field) => (e) => {
        const val = Number(e.target.value);
        if (field === "bakuganId" && val === -1) {
            updateDeckSlot(deckIndex, "bakugan", slotIndex, {
                bakuganId: null,
                attributeId: null,
            });
        } else if (field === "bakuganId") {
            updateDeckSlot(deckIndex, "bakugan", slotIndex, { bakuganId: val });
        } else if (field === "attributeId") {
            updateDeckSlot(deckIndex, "bakugan", slotIndex, { attributeId: val });
        }
    };

    const handleGateCardChange = (deckIndex, slotIndex) => (e) => {
        const val = Number(e.target.value);
        updateDeckSlot(deckIndex, "gate", slotIndex, {
            cardId: val === -1 ? null : val,
        });
    };

    const handleAbilityCardChange = (deckIndex, slotIndex) => (e) => {
        const val = Number(e.target.value);
        updateDeckSlot(deckIndex, "ability", slotIndex, {
            cardId: val === -1 ? null : val,
        });
    };

    const handleSaveDecks = () => {
        if (!parsed?.bytes || !decks || !ctx) return;
        try {
            decks.forEach((deck, idx) => {
                writeDeck(parsed.bytes, ctx, idx, deck);
                if (deckNames && deckNames[idx] != null) {
                    writeDeckName(parsed.bytes, ctx, idx, deckNames[idx]);
                }
            });
            const deck1 = readDeck(parsed.bytes, ctx, 0);
            const deck2 = readDeck(parsed.bytes, ctx, 1);
            setDecks([deck1, deck2]);

            if (deckNames) {
                const name1 = readDeckName(parsed.bytes, ctx, 0);
                const name2 = readDeckName(parsed.bytes, ctx, 1);
                setDeckNames([name1, name2]);
            }
        } catch (e) {
            console.error(e);
            setError(e.message || "Failed to save decks.");
        }
    };

    const handleDeckNameChange = (deckIndex) => (e) => {
        const value = e.target.value.slice(0, 10); // max 10 chars
        setDeckNames((prev) => {
            const base = prev || ["", ""];
            const copy = [...base];
            copy[deckIndex] = value;
            return copy;
        });
    };

    useEffect(() => {
        if (!parsed?.bytes || !ctx) {
            setStats(null);
            return;
        }
        try {
            const s = readStats(parsed.bytes, ctx);
            setStats(s);
        } catch (e) {
            // Stats not available on this platform/slot is not fatal; just show message.
            console.error(e);
            setStats(null);
        }
    }, [parsed, ctx]);

    const handleStatsFieldChange = (key) => (e) => {
        const value = Number(e.target.value);
        setStats((prev) => ({
            ...prev,
            [key]: Number.isNaN(value) ? 0 : value,
        }));
    };

    const handleOpponentWinChange = (index) => (e) => {
        const value = Number(e.target.value);
        setStats((prev) => {
            if (!prev) return prev;
            const copy = prev.opponentWins ? [...prev.opponentWins] : Array(16).fill(0);
            copy[index] = Number.isNaN(value) ? 0 : value;
            return { ...prev, opponentWins: copy };
        });
    };

    const handleSaveStatsSection = () => {
        if (!parsed?.bytes || !ctx || !stats) return;
        try {
            writeStats(parsed.bytes, ctx, stats);
            const updated = readStats(parsed.bytes, ctx);
            setStats(updated);
        } catch (e) {
            console.error(e);
            setError(e.message || "Failed to save stats.");
        }
    };

    // ---------- Render ----------

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <div className="bg-white rounded-2xl shadow-lg p-6 w-full max-w-5xl space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">
                            Bakugan Save Editor
                        </h1>
                        {fileName && (
                            <p className="text-xs text-gray-800 mt-1">Loaded: {fileName}</p>
                        )}
                    </div>
                    <button
                        onClick={handleDownload}
                        disabled={!parsed}
                        className={`px-4 py-2 rounded-xl text-sm font-medium ${parsed
                            ? "bg-blue-600 text-white hover:bg-blue-700 transition"
                            : "bg-gray-200 text-gray-500 cursor-not-allowed"
                            }`}
                    >
                        Download Save
                    </button>
                </div>

                {/* Platform + Save slot selector */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <label className="text-sm font-medium text-gray-900">
                            Platform
                        </label>
                        <select
                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                            value={platform}
                            onChange={(e) => {
                                setPlatform(e.target.value);
                                setSaveSlot(0);
                            }}
                        >
                            {PLATFORMS.map((p) => (
                                <option key={p} value={p}>
                                    {p.toUpperCase()}
                                </option>
                            ))}
                        </select>
                    </div>

                    {platform === "wii" && (
                        <div className="flex items-center gap-3">
                            <label className="text-sm font-medium text-gray-900">
                                Save Slot
                            </label>
                            <select
                                className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                                value={saveSlot}
                                onChange={(e) => setSaveSlot(Number(e.target.value))}
                            >
                                <option value={0}>Slot 1</option>
                                <option value={1}>Slot 2</option>
                                <option value={2}>Slot 3</option>
                                <option value={3}>Slot 4</option>
                            </select>
                        </div>
                    )}
                </div>

                {/* Upload / Drag & Drop */}
                <div
                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition
          ${isDragging ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-gray-50"
                        }`}
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onClick={() => document.getElementById("file-input")?.click()}
                >
                    <input
                        id="file-input"
                        type="file"
                        className="hidden"
                        onChange={onFileInputChange}
                    />
                    <p className="font-medium mb-1 text-gray-900">
                        {fileName ? "Replace save file" : "Drop your save file here"}
                    </p>
                    <p className="text-sm text-gray-800">
                        or click to choose a file from your computer
                    </p>
                </div>

                {error && (
                    <div className="rounded-lg bg-red-50 border border-red-300 text-red-700 px-4 py-2 text-sm">
                        {error}
                    </div>
                )}

                {/* Tabs */}
                <div className="flex justify-center gap-3 py-2">
                    {[
                        { key: "bakugan", label: "Bakugan Stats" },
                        { key: "cards", label: "Cards" },
                        { key: "stats", label: "Battle Stats" },
                        { key: "appearance", label: "Appearance" },
                        { key: "decks", label: "Decks" },
                        { key: "debug", label: "Debug" },
                    ].map((tab) => (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => setActiveTab(tab.key)}
                            className={`px-4 py-2 rounded-full text-sm font-medium transition ${activeTab === tab.key
                                    ? "bg-blue-600 text-white shadow"
                                    : "bg-gray-200 text-gray-400 hover:bg-gray-300 hover:text-gray-500"
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab content */}
                {parsed && ctx && activeTab === "bakugan" && (
                    <section className="space-y-4">
                        {/* Centered Bakugan + Attribute */}
                        <div className="flex justify-center">
                            <div className="flex flex-col md:flex-row gap-6 items-center">
                                <div className="flex flex-col items-center">
                                    <label className="text-sm font-medium mb-1 text-gray-900">
                                        Bakugan
                                    </label>
                                    <select
                                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                                        value={selectedBakuganId}
                                        onChange={handleBakuganChange}
                                    >
                                        {bakuganList.map((b) => (
                                            <option key={b.id} value={b.id}>
                                                {b.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex flex-col items-center">
                                    <label className="text-sm font-medium mb-1 text-gray-900">
                                        Attribute
                                    </label>
                                    <select
                                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                                        value={selectedAttributeId}
                                        onChange={handleAttributeChange}
                                    >
                                        {attributeList.map((a) => (
                                            <option key={a.id} value={a.id}>
                                                {a.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-center">
                            <button
                                type="button"
                                onClick={() => {
                                    if (!entry || !ctx) return;
                                    setDebugRange(entry.offset, 14); // 14-byte Bakugan entry
                                    setActiveTab("debug");
                                }}
                                className="mt-2 px-3 py-1 rounded-lg text-xs bg-gray-200 text-white hover:bg-gray-300"
                            >
                                View this Bakugan entry in Debug
                            </button>
                        </div>

                        {entry && editableStats ? (
                            <div className="mt-2">
                                <p className="text-xs text-gray-800 mb-2">
                                    Offset: {entry.offset} (0x
                                    {entry.offset.toString(16).toUpperCase()})
                                </p>

                                <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                                    <thead className="bg-gray-100">
                                        <tr>
                                            <th className="text-left px-3 py-2 border-b border-gray-200 text-gray-900">
                                                Field
                                            </th>
                                            <th className="text-left px-3 py-2 border-b border-gray-200 text-gray-900">
                                                Value
                                            </th>
                                            <th className="text-left px-3 py-2 border-b border-gray-200 text-gray-900">
                                                Notes
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td className="px-3 py-2 border-b border-gray-100 text-gray-900">
                                                Power
                                            </td>
                                            <td className="px-3 py-2 border-b border-gray-100">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={1000}
                                                    value={editableStats.power}
                                                    onChange={handleStatChange("power")}
                                                    className="w-24 border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
                                                />
                                            </td>
                                            <td className="px-3 py-2 border-b border-gray-100 text-xs text-gray-800">
                                                0–1000 (16-bit, big-endian)
                                            </td>
                                        </tr>

                                        <tr>
                                            <td className="px-3 py-2 border-b border-gray-100 text-gray-900">
                                                Speed
                                            </td>
                                            <td className="px-3 py-2 border-b border-gray-100">
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={5}
                                                    value={editableStats.speed}
                                                    onChange={handleStatChange("speed")}
                                                    className="w-16 border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
                                                />
                                            </td>
                                            <td className="px-3 py-2 border-b border-gray-100 text-xs text-gray-800">
                                                1–5 (stored as 10–50)
                                            </td>
                                        </tr>

                                        <tr>
                                            <td className="px-3 py-2 border-b border-gray-100 text-gray-900">
                                                Defense
                                            </td>
                                            <td className="px-3 py-2 border-b border-gray-100">
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={5}
                                                    value={editableStats.defense}
                                                    onChange={handleStatChange("defense")}
                                                    className="w-16 border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
                                                />
                                            </td>
                                            <td className="px-3 py-2 border-b border-gray-100 text-xs text-gray-800">
                                                1–5 (stored as 10–50)
                                            </td>
                                        </tr>

                                        <tr>
                                            <td className="px-3 py-2 border-b border-gray-100 text-gray-900">
                                                Acceleration
                                            </td>
                                            <td className="px-3 py-2 border-b border-gray-100">
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={5}
                                                    value={editableStats.acceleration}
                                                    onChange={handleStatChange("acceleration")}
                                                    className="w-16 border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
                                                />
                                            </td>
                                            <td className="px-3 py-2 border-b border-gray-100 text-xs text-gray-800">
                                                1–5 (stored as 10–50)
                                            </td>
                                        </tr>

                                        <tr>
                                            <td className="px-3 py-2 border-b border-gray-100 text-gray-900">
                                                Endurance
                                            </td>
                                            <td className="px-3 py-2 border-b border-gray-100">
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={5}
                                                    value={editableStats.endurance}
                                                    onChange={handleStatChange("endurance")}
                                                    className="w-16 border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
                                                />
                                            </td>
                                            <td className="px-3 py-2 border-b border-gray-100 text-xs text-gray-800">
                                                1–5 (stored as 10–50)
                                            </td>
                                        </tr>

                                        <tr>
                                            <td className="px-3 py-2 border-b border-gray-100 text-gray-900">
                                                Jump
                                            </td>
                                            <td className="px-3 py-2 border-b border-gray-100">
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={5}
                                                    value={editableStats.jump}
                                                    onChange={handleStatChange("jump")}
                                                    className="w-16 border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
                                                />
                                            </td>
                                            <td className="px-3 py-2 border-b border-gray-100 text-xs text-gray-800">
                                                1–5 (stored as 10–50)
                                            </td>
                                        </tr>

                                        <tr>
                                            <td className="px-3 py-2 text-gray-900">Level</td>
                                            <td className="px-3 py-2">
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={10}
                                                    value={editableStats.level}
                                                    onChange={handleStatChange("level")}
                                                    className="w-16 border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
                                                />
                                            </td>
                                            <td className="px-3 py-2 text-xs text-gray-800">
                                                1–10
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>

                                <div className="mt-4 flex justify-end">
                                    <button
                                        onClick={handleSaveStats}
                                        className="px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 transition text-sm font-medium"
                                    >
                                        Save Bakugan Stats to Memory
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <p className="mt-2 text-sm text-gray-900">
                                Select a Bakugan and Attribute to view and edit data.
                            </p>
                        )}
                    </section>
                )}

                {parsed && ctx && activeTab === "cards" && (
                    <section className="space-y-6">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900">Cards</h2>
                                <p className="text-xs text-gray-800">
                                    Toggle cards to unlock/lock. Each card is stored as 1 byte (0 =
                                    locked, 1 = unlocked) in the current save slot.
                                </p>
                                {totalCards > 0 && (
                                    <p className="text-xs text-gray-800 mt-1">
                                        Unlocked{" "}
                                        <span className="font-semibold">
                                            {unlockedCount} / {totalCards}
                                        </span>{" "}
                                        cards
                                    </p>
                                )}
                            </div>

                            <div className="flex gap-2 mt-2 md:mt-0">
                                <button
                                    type="button"
                                    onClick={handleUnlockAllCards}
                                    disabled={!cardStates}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium ${cardStates
                                        ? "bg-green-600 text-white hover:bg-green-700 transition"
                                        : "bg-gray-200 text-gray-500 cursor-not-allowed"
                                        }`}
                                >
                                    Unlock All
                                </button>
                                <button
                                    type="button"
                                    onClick={handleLockAllCards}
                                    disabled={!cardStates}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium ${cardStates
                                        ? "bg-red-600 text-white hover:bg-red-700 transition"
                                        : "bg-gray-200 text-gray-500 cursor-not-allowed"
                                        }`}
                                >
                                    Lock All
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={cardFilter}
                                onChange={(e) => setCardFilter(e.target.value)}
                                placeholder="Filter cards by name..."
                                className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 w-full md:w-72"
                            />
                        </div>

                        {cardStates ? (
                            <div className="space-y-8">
                                {CARD_TYPE_ROWS.map(({ title, types }) => (
                                    <div key={title} className="space-y-3">
                                        <h3 className="text-md font-semibold text-gray-900 border-b border-gray-300 pb-1">
                                            {title}
                                        </h3>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            {types.map((type) => {
                                                const cards = filteredCardsByType?.[type] || [];
                                                const style = CARD_TYPE_STYLES[type] || {
                                                    border: "border-gray-300",
                                                    headerBg: "bg-gray-100",
                                                };

                                                return (
                                                    <div
                                                        key={type}
                                                        className={`border rounded-xl overflow-hidden bg-white flex flex-col ${style.border}`}
                                                    >
                                                        <div
                                                            className={`flex items-center justify-between px-3 py-2 border-b border-gray-200 ${style.headerBg}`}
                                                        >
                                                            <span className="text-sm font-semibold text-gray-900">
                                                                {type}
                                                            </span>
                                                            <span className="text-xs text-gray-800">
                                                                {cards.length} shown
                                                            </span>
                                                        </div>

                                                        {cards.length > 0 ? (
                                                            <div className="overflow-auto max-h-64">
                                                                <table className="w-full text-sm">
                                                                    <thead className="bg-gray-50">
                                                                        <tr>
                                                                            <th className="text-left px-3 py-2 border-b border-gray-200 w-20 text-gray-800">
                                                                                Unlock
                                                                            </th>
                                                                            <th className="text-left px-3 py-2 border-b border-gray-200 text-gray-800">
                                                                                Card
                                                                            </th>
                                                                            <th className="text-left px-3 py-2 border-b border-gray-200 w-16 text-gray-800">
                                                                                ID
                                                                            </th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {cards.map((card) => (
                                                                            <tr
                                                                                key={card.id}
                                                                                className="odd:bg-white even:bg-gray-50"
                                                                            >
                                                                                <td className="px-3 py-2 border-b border-gray-100">
                                                                                    <input
                                                                                        type="checkbox"
                                                                                        checked={card.unlocked}
                                                                                        onChange={handleCardToggle(
                                                                                            card.id
                                                                                        )}
                                                                                    />
                                                                                </td>
                                                                                <td className="px-3 py-2 border-b border-gray-100 text-gray-900">
                                                                                    {card.name}
                                                                                </td>
                                                                                <td className="px-3 py-2 border-b border-gray-100 text-xs text-gray-800">
                                                                                    {card.id
                                                                                        .toString(16)
                                                                                        .toUpperCase()}
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        ) : (
                                                            <p className="px-3 py-3 text-xs text-gray-800">
                                                                {cardFilter
                                                                    ? "No cards match your filter."
                                                                    : "No cards in this category."}
                                                            </p>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-800">
                                Card data not available for this save.
                            </p>
                        )}
                    </section>
                )}

                {parsed && ctx && activeTab === "appearance" && (
                    <section className="space-y-6">
                        <h2 className="text-lg font-semibold text-gray-900">Appearance</h2>

                        {/* Centered Player name */}
                        <div className="max-w-md mx-auto space-y-3 text-center">
                            <label className="text-sm font-medium text-gray-900">
                                Player Name
                            </label>
                            <input
                                type="text"
                                maxLength={8}
                                value={playerName}
                                onChange={(e) => setPlayerName(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 mx-auto"
                                placeholder="Enter up to 8 characters"
                            />
                            <p className="text-xs text-gray-800">
                                Stored as up to 8 ASCII characters (each followed by a padding
                                byte) at a platform-dependent offset.
                            </p>
                            <div className="flex justify-center">
                                <button
                                    type="button"
                                    onClick={handleSavePlayerName}
                                    className="mt-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700 transition"
                                >
                                    Save Name to Memory
                                </button>
                            </div>
                        </div>

                        <div className="flex justify-center">
                            <button
                                type="button"
                                onClick={() => {
                                    if (!ctx) return;
                                    setDebugRange(ctx.playerNameOffset, 32);
                                    setActiveTab("debug");
                                }}
                                className="mt-1 px-3 py-1 rounded-lg text-xs bg-gray-200 text-white hover:bg-gray-300"
                            >
                                View name bytes in Debug
                            </button>
                        </div>


                        {/* Character styling */}
                        <div className="space-y-3">
                            <h3 className="text-md font-semibold text-gray-900">
                                Character Style
                            </h3>
                            <p className="text-xs text-gray-800">
                                These options control your avatar&apos;s appearance in this save
                                slot.
                            </p>

                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!ctx) return;
                                        setDebugRange(ctx.stylingOffset, 64);
                                        setActiveTab("debug");
                                    }}
                                    className="px-3 py-1 rounded-lg text-xs bg-gray-200 text-white hover:bg-gray-300"
                                >
                                    View styling bytes in Debug
                                </button>
                            </div>

                            {styling ? (
                                <>
                                    <div className="grid gap-4 md:grid-cols-2">
                                        {Object.entries(stylingFieldsByGroup).map(
                                            ([groupName, fields]) => (
                                                <div
                                                    key={groupName}
                                                    className="border border-gray-200 rounded-xl bg-white"
                                                >
                                                    <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 rounded-t-xl">
                                                        <h4 className="text-sm font-semibold text-gray-900">
                                                            {groupName}
                                                        </h4>
                                                    </div>

                                                    <div className="p-4 space-y-3">
                                                        {fields.map((field) => {
                                                            const options = getStylingOptions(field.key);
                                                            const value = styling[field.key] ?? 0;

                                                            return (
                                                                <div key={field.key} className="space-y-1">
                                                                    <label className="text-xs font-medium text-gray-900">
                                                                        {field.label}
                                                                    </label>
                                                                    <select
                                                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                                                                        value={value}
                                                                        onChange={handleStylingChange(field.key)}
                                                                    >
                                                                        {options.map((opt) => (
                                                                            <option key={opt.id} value={opt.id}>
                                                                                {opt.name}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )
                                        )}
                                    </div>
                                    <div className="flex justify-end">
                                        <button
                                            type="button"
                                            onClick={handleSaveStyling}
                                            className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700 transition"
                                        >
                                            Save Style to Memory
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <p className="text-sm text-gray-800">
                                    Styling data not available for this save.
                                </p>
                            )}
                        </div>
                    </section>
                )}

                {parsed && ctx && activeTab === "decks" && (
                    <section className="space-y-6">
                        <h2 className="text-lg font-semibold text-gray-900">Decks</h2>
                        <p className="text-xs text-gray-800">
                            Each deck contains 3 Bakugan, 3 Gate Cards, and 3 Ability Cards for
                            the current save slot.
                        </p>

                        {decks ? (
                            <>
                                <div className="grid gap-4 md:grid-cols-2">
                                    {decks.map((deck, deckIndex) => (
                                        <div
                                            key={deckIndex}
                                            className="border border-gray-200 rounded-xl bg-white overflow-hidden"
                                        >
                                            <div className="px-4 py-2 border-b border-gray-200 bg-gray-50">
                                                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                                    <h3 className="text-sm font-semibold text-gray-900">
                                                        Deck {deckIndex + 1}
                                                    </h3>
                                                    {deckNames && (
                                                        <div className="flex items-center gap-2">
                                                            <label className="text-xs font-medium text-gray-900">
                                                                Name
                                                            </label>
                                                            <input
                                                                type="text"
                                                                maxLength={10}
                                                                value={deckNames[deckIndex] ?? ""}
                                                                onChange={handleDeckNameChange(deckIndex)}
                                                                className="border border-gray-300 rounded-lg px-2 py-1 text-xs text-gray-900"
                                                                placeholder="(unnamed)"
                                                            />
                                                        </div>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            if (!ctx) return;
                                                            handleDebugPresetDeck(deckIndex)();
                                                            setActiveTab("debug");
                                                        }}
                                                        className="px-3 py-1 rounded-lg text-xs bg-gray-200 text-gray-800 hover:bg-gray-300"
                                                    >
                                                        View deck bytes in Debug
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="p-4 space-y-4">
                                                {/* Bakugan slots */}
                                                <div className="space-y-2">
                                                    <h4 className="text-xs font-semibold text-gray-900">
                                                        Bakugan
                                                    </h4>
                                                    {[0, 1, 2].map((slotIndex) => {
                                                        const slot =
                                                            deck.bakuganSlots[slotIndex] || {
                                                                bakuganId: null,
                                                                attributeId: null,
                                                            };
                                                        const bakuganVal =
                                                            slot.bakuganId == null ? -1 : slot.bakuganId;
                                                        const attrVal =
                                                            slot.attributeId == null
                                                                ? attributeList[0]?.id ?? 0
                                                                : slot.attributeId;

                                                        return (
                                                            <div
                                                                key={slotIndex}
                                                                className="flex flex-col gap-2 md:flex-row md:items-center"
                                                            >
                                                                <span className="text-xs text-gray-800 w-16">
                                                                    Slot {slotIndex + 1}
                                                                </span>
                                                                <select
                                                                    className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-sm text-gray-900"
                                                                    value={bakuganVal}
                                                                    onChange={handleBakuganSlotChange(
                                                                        deckIndex,
                                                                        slotIndex,
                                                                        "bakuganId"
                                                                    )}
                                                                >
                                                                    <option value={-1}>(Empty)</option>
                                                                    {bakuganList.map((b) => (
                                                                        <option key={b.id} value={b.id}>
                                                                            {b.name}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                                <select
                                                                    className="w-32 border border-gray-300 rounded-lg px-2 py-1 text-sm text-gray-900"
                                                                    value={attrVal}
                                                                    onChange={handleBakuganSlotChange(
                                                                        deckIndex,
                                                                        slotIndex,
                                                                        "attributeId"
                                                                    )}
                                                                >
                                                                    {attributeList.map((a) => (
                                                                        <option key={a.id} value={a.id}>
                                                                            {a.name}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                {/* Gate cards */}
                                                <div className="space-y-2">
                                                    <h4 className="text-xs font-semibold text-gray-900">
                                                        Gate Cards
                                                    </h4>
                                                    {[0, 1, 2].map((slotIndex) => {
                                                        const slot =
                                                            deck.gateCards[slotIndex] || { cardId: null };
                                                        const val = slot.cardId == null ? -1 : slot.cardId;

                                                        return (
                                                            <div
                                                                key={slotIndex}
                                                                className="flex items-center gap-2"
                                                            >
                                                                <span className="text-xs text-gray-800 w-16">
                                                                    Gate {slotIndex + 1}
                                                                </span>
                                                                <select
                                                                    className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-sm text-gray-900"
                                                                    value={val}
                                                                    onChange={handleGateCardChange(
                                                                        deckIndex,
                                                                        slotIndex
                                                                    )}
                                                                >
                                                                    <option value={-1}>(Empty)</option>
                                                                    {gateCardOptions.map((card) => (
                                                                        <option key={card.id} value={card.id}>
                                                                            {card.name}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                {/* Ability cards */}
                                                <div className="space-y-2">
                                                    <h4 className="text-xs font-semibold text-gray-900">
                                                        Ability Cards
                                                    </h4>
                                                    {[0, 1, 2].map((slotIndex) => {
                                                        const slot =
                                                            deck.abilityCards[slotIndex] || { cardId: null };
                                                        const val = slot.cardId == null ? -1 : slot.cardId;

                                                        return (
                                                            <div
                                                                key={slotIndex}
                                                                className="flex items-center gap-2"
                                                            >
                                                                <span className="text-xs text-gray-800 w-16">
                                                                    Ability {slotIndex + 1}
                                                                </span>
                                                                <select
                                                                    className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-sm text-gray-900"
                                                                    value={val}
                                                                    onChange={handleAbilityCardChange(
                                                                        deckIndex,
                                                                        slotIndex
                                                                    )}
                                                                >
                                                                    <option value={-1}>(Empty)</option>
                                                                    {abilityCardOptions.map((card) => (
                                                                        <option key={card.id} value={card.id}>
                                                                            {card.name}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="flex justify-end">
                                    <button
                                        type="button"
                                        onClick={handleSaveDecks}
                                        className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700 transition"
                                    >
                                        Save Decks to Memory
                                    </button>
                                </div>
                            </>
                        ) : (
                            <p className="text-sm text-gray-800">
                                Deck data not available for this save.
                            </p>
                        )}
                    </section>
                )}

                {parsed && ctx && activeTab === "stats" && (
                    <section className="space-y-6">
                        <h2 className="text-lg font-semibold text-gray-900">Battle Stats</h2>
                        <p className="text-xs text-gray-800">
                            These values track your overall performance and wins against each opponent
                            for the current platform and save slot.
                        </p>

                        <div className="flex justify-end">
                            {ctx.statsOffsets && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setDebugRange(ctx.statsOffsets.rankingPoints, 64);
                                        setActiveTab("debug");
                                    }}
                                    className="px-3 py-1 rounded-lg text-xs bg-gray-200 text-gray-800 hover:bg-gray-300"
                                >
                                    View stats block in Debug
                                </button>
                            )}
                        </div>

                        {stats ? (
                            <>
                                {/* Overall counters */}
                                <div className="grid gap-6 md:grid-cols-2">
                                    <div className="space-y-3">
                                        <h3 className="text-sm font-semibold text-gray-900">
                                            Overall Points
                                        </h3>
                                        <div className="space-y-1">
                                            <label className="text-xs font-medium text-gray-900">
                                                Ranking Points
                                            </label>
                                            <input
                                                type="number"
                                                min={0}
                                                max={16777215}
                                                value={stats.rankingPoints ?? 0}
                                                onChange={handleStatsFieldChange("rankingPoints")}
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                                            />
                                            <p className="text-xs text-gray-800">
                                                3-byte value (0 – 16,777,215).
                                            </p>
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-xs font-medium text-gray-900">
                                                Bakugan Points
                                            </label>
                                            <input
                                                type="number"
                                                min={0}
                                                max={16777215}
                                                value={stats.bakuganPoints ?? 0}
                                                onChange={handleStatsFieldChange("bakuganPoints")}
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                                            />
                                            <p className="text-xs text-gray-800">
                                                3-byte value (0 – 16,777,215).
                                            </p>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <h3 className="text-sm font-semibold text-gray-900">
                                            Battle Counts
                                        </h3>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <label className="text-xs font-medium text-gray-900">
                                                    Battles
                                                </label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={255}
                                                    value={stats.battles ?? 0}
                                                    onChange={handleStatsFieldChange("battles")}
                                                    className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm text-gray-900"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs font-medium text-gray-900">
                                                    Wins
                                                </label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={255}
                                                    value={stats.wins ?? 0}
                                                    onChange={handleStatsFieldChange("wins")}
                                                    className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm text-gray-900"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs font-medium text-gray-900">
                                                    Losses
                                                </label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={255}
                                                    value={stats.losses ?? 0}
                                                    onChange={handleStatsFieldChange("losses")}
                                                    className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm text-gray-900"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs font-medium text-gray-900">
                                                    Sphere Attacks
                                                </label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={255}
                                                    value={stats.sphereAttacks ?? 0}
                                                    onChange={handleStatsFieldChange("sphereAttacks")}
                                                    className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm text-gray-900"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs font-medium text-gray-900">
                                                    Double Stands
                                                </label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={255}
                                                    value={stats.doubleStands ?? 0}
                                                    onChange={handleStatsFieldChange("doubleStands")}
                                                    className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm text-gray-900"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-xs font-medium text-gray-900">
                                                Game Types
                                            </label>
                                            <div className="grid grid-cols-3 gap-3">
                                                <div className="space-y-1">
                                                    <span className="block text-xs text-gray-900">
                                                        1 vs 1
                                                    </span>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={255}
                                                        value={stats.oneVsOne ?? 0}
                                                        onChange={handleStatsFieldChange("oneVsOne")}
                                                        className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm text-gray-900"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <span className="block text-xs text-gray-900">
                                                        Battle Royale
                                                    </span>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={255}
                                                        value={stats.battleRoyale ?? 0}
                                                        onChange={handleStatsFieldChange("battleRoyale")}
                                                        className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm text-gray-900"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <span className="block text-xs text-gray-900">
                                                        Tag Team
                                                    </span>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={255}
                                                        value={stats.tagTeam ?? 0}
                                                        onChange={handleStatsFieldChange("tagTeam")}
                                                        className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm text-gray-900"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Per-opponent wins */}
                                <div className="space-y-3">
                                    <h3 className="text-sm font-semibold text-gray-900">
                                        Wins vs Opponents
                                    </h3>
                                    <p className="text-xs text-gray-800">
                                        Each value tracks the number of wins you have against a specific
                                        character.
                                    </p>
                                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                                        <table className="w-full text-sm">
                                            <thead className="bg-gray-100">
                                                <tr>
                                                    <th className="text-left px-3 py-2 border-b border-gray-200 text-xs text-gray-900">
                                                        Opponent
                                                    </th>
                                                    <th className="text-left px-3 py-2 border-b border-gray-200 text-xs text-gray-900">
                                                        Wins
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {OPPONENT_NAMES.map((name, idx) => (
                                                    <tr
                                                        key={name}
                                                        className="odd:bg-white even:bg-gray-50"
                                                    >
                                                        <td className="px-3 py-2 border-b border-gray-100 text-xs text-gray-900">
                                                            {name}
                                                        </td>
                                                        <td className="px-3 py-2 border-b border-gray-100">
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                max={255}
                                                                value={stats.opponentWins?.[idx] ?? 0}
                                                                onChange={handleOpponentWinChange(idx)}
                                                                className="w-20 border border-gray-300 rounded px-2 py-1 text-xs text-gray-900"
                                                            />
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div className="flex justify-end">
                                    <button
                                        type="button"
                                        onClick={handleSaveStatsSection}
                                        className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700 transition"
                                    >
                                        Save Stats to Memory
                                    </button>
                                </div>
                            </>
                        ) : (
                            <p className="text-sm text-gray-800">
                                Stats are not available for this platform or save slot yet.
                            </p>
                        )}
                    </section>
                )}

                {parsed && ctx && activeTab === "debug" && (
                    <section className="space-y-4">
                        <h2 className="text-lg font-semibold text-gray-900">Debug / Hex Viewer</h2>
                        <p className="text-xs text-gray-800">
                            Expert view. Shows raw bytes from the currently loaded file and save slot.
                            All changes made in other tabs are reflected here before you download.
                        </p>

                        {/* Controls */}
                        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                            <div className="flex flex-wrap gap-3 items-end">
                                <div className="flex flex-col">
                                    <label className="text-xs font-medium text-gray-900">
                                        Start offset (dec or 0x...)
                                    </label>
                                    <input
                                        type="text"
                                        value={debugOffsetInput}
                                        onChange={(e) => setDebugOffsetInput(e.target.value)}
                                        className="border border-gray-300 rounded-lg px-2 py-1 text-sm text-gray-900 w-40"
                                    />
                                </div>
                                <div className="flex flex-col">
                                    <label className="text-xs font-medium text-gray-900">
                                        Length (bytes)
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={debugLengthInput}
                                        onChange={(e) => setDebugLengthInput(e.target.value)}
                                        className="border border-gray-300 rounded-lg px-2 py-1 text-sm text-gray-900 w-24"
                                    />
                                </div>
                            </div>

                            {/* Presets */}
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={handleDebugPresetPlayerName}
                                    className="px-2 py-1 rounded-lg text-xs bg-gray-200 text-white hover:bg-gray-300"
                                >
                                    Player Name
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDebugPresetStyling}
                                    className="px-2 py-1 rounded-lg text-xs bg-gray-200 text-white hover:bg-gray-300"
                                >
                                    Styling
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDebugPresetDeck(0)}
                                    className="px-2 py-1 rounded-lg text-xs bg-gray-200 text-white hover:bg-gray-300"
                                >
                                    Deck 1
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDebugPresetDeck(1)}
                                    className="px-2 py-1 rounded-lg text-xs bg-gray-200 text-white hover:bg-gray-300"
                                >
                                    Deck 2
                                </button>
                                {ctx.statsOffsets && (
                                    <button
                                        type="button"
                                        onClick={handleDebugPresetStats}
                                        className="px-2 py-1 rounded-lg text-xs bg-gray-200 text-white hover:bg-gray-300"
                                    >
                                        Stats Block
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Hex view */}
                        <div className="border border-gray-200 rounded-xl overflow-auto max-h-80 bg-black">
                            <div className="font-mono text-xs text-gray-100 p-3 space-y-0.5">
                                {(() => {
                                    const bytes = parsed.bytes;
                                    if (!bytes || bytes.length === 0) {
                                        return <div>No data loaded.</div>;
                                    }

                                    const start = Math.min(debugOffset, bytes.length - 1);
                                    const end = Math.min(start + debugLength, bytes.length);
                                    const rows = [];

                                    const inHighlight = (i) =>
                                        debugHighlight &&
                                        i >= debugHighlight.start &&
                                        i < debugHighlight.end;

                                    for (let offset = start; offset < end; offset += 16) {
                                        const rowEnd = Math.min(offset + 16, end);
                                        const offsetLabel = offset
                                            .toString(16)
                                            .toUpperCase()
                                            .padStart(8, "0");

                                        const byteSpans = [];
                                        const charSpans = [];

                                        for (let i = offset; i < rowEnd; i++) {
                                            const b = bytes[i];
                                            const hex = b.toString(16).toUpperCase().padStart(2, "0");
                                            const ch =
                                                b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : ".";

                                            const highlighted = inHighlight(i);

                                            byteSpans.push(
                                                <span
                                                    key={`b-${i}`}
                                                    className={highlighted ? "text-yellow-300 font-semibold" : ""}
                                                >
                                                    {hex}
                                                </span>
                                            );

                                            charSpans.push(
                                                <span
                                                    key={`c-${i}`}
                                                    className={highlighted ? "text-yellow-300 font-semibold" : ""}
                                                >
                                                    {ch}
                                                </span>
                                            );
                                        }

                                        // pad to 16 for alignment
                                        while (byteSpans.length < 16) {
                                            byteSpans.push(
                                                <span key={`padb-${offset}-${byteSpans.length}`}>{"  "}</span>
                                            );
                                            charSpans.push(
                                                <span key={`padc-${offset}-${charSpans.length}`}>{" "}</span>
                                            );
                                        }

                                        rows.push(
                                            <div key={offset} className="whitespace-pre">
                                                <span className="text-gray-500">
                                                    {offsetLabel}:
                                                </span>
                                                {"  "}
                                                {byteSpans.map((span, idx) => (
                                                    <React.Fragment key={span.key ?? idx}>
                                                        {span}
                                                        {idx < 15 && " "}
                                                    </React.Fragment>
                                                ))}
                                                {"  |"}
                                                {charSpans}
                                                {"|"}
                                            </div>
                                        );
                                    }

                                    return rows;
                                })()}
                            </div>
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}
