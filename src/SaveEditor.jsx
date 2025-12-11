// BakuganSaveEditor.jsx
import React, { useCallback, useEffect, useState } from "react";
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
} from "./saveFormat";
import { STYLING_FIELDS, getStylingOptions } from "./constants";

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

    // ---------- Bakugan stats ----------

    const refreshEntry = useCallback(
        (bakuganId = selectedBakuganId, attributeId = selectedAttributeId) => {
            if (!parsed?.bytes) {
                setEntry(null);
                setEditableStats(null);
                return;
            }
            try {
                const data = readBakuganEntry(parsed.bytes, bakuganId, attributeId);
                setEntry(data);
            } catch (e) {
                console.error(e);
                setError(e.message || "Failed to read Bakugan data.");
                setEntry(null);
                setEditableStats(null);
            }
        },
        [parsed, selectedBakuganId, selectedAttributeId]
    );

    useEffect(() => {
        if (parsed) {
            refreshEntry();
        }
    }, [parsed, selectedBakuganId, selectedAttributeId, refreshEntry]);

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
        if (!parsed?.bytes || !entry || !editableStats) return;

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
        if (!parsed?.bytes) {
            setCardStates(null);
            return;
        }
        try {
            const states = cardList.map((card) => ({
                ...card,
                unlocked: readCardFlag(parsed.bytes, card.id),
            }));
            setCardStates(states);
        } catch (e) {
            console.error(e);
            setError(e.message || "Failed to read card data.");
            setCardStates(null);
        }
    }, [parsed]);

    const handleCardToggle = (cardId) => (e) => {
        if (!parsed?.bytes) return;
        const unlocked = e.target.checked;
        try {
            writeCardFlag(parsed.bytes, cardId, unlocked);
            setCardStates((prev) =>
                prev ? prev.map((c) => (c.id === cardId ? { ...c, unlocked } : c)) : prev
            );
        } catch (e2) {
            console.error(e2);
            setError(e2.message || "Failed to update card state.");
        }
    };

    const handleUnlockAllCards = () => {
        if (!parsed?.bytes || !cardStates) return;
        try {
            cardStates.forEach((card) => {
                writeCardFlag(parsed.bytes, card.id, true);
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
        if (!parsed?.bytes || !cardStates) return;
        try {
            cardStates.forEach((card) => {
                writeCardFlag(parsed.bytes, card.id, false);
            });
            setCardStates((prev) =>
                prev ? prev.map((c) => ({ ...c, unlocked: false })) : prev
            );
        } catch (e) {
            console.error(e);
            setError(e.message || "Failed to lock all cards.");
        }
    };

    const totalCards = cardStates?.length ?? 0;
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

    // ---------- Appearance (name + styling) ----------

    useEffect(() => {
        if (!parsed?.bytes) {
            setPlayerName("");
            setStyling(null);
            setDecks(null);
            return;
        }

        try {
            const name = readPlayerName(parsed.bytes);
            setPlayerName(name);
        } catch (e) {
            console.error(e);
            setError(e.message || "Failed to read player name.");
            setPlayerName("");
        }

        try {
            const currentStyling = readStyling(parsed.bytes);
            setStyling(currentStyling);
        } catch (e) {
            console.error(e);
            setError(e.message || "Failed to read styling.");
            setStyling(null);
        }

        try {
            const deck1 = readDeck(parsed.bytes, 0);
            const deck2 = readDeck(parsed.bytes, 1);
            setDecks([deck1, deck2]);
        } catch (e) {
            console.error(e);
            setError(e.message || "Failed to read decks.");
            setDecks(null);
        }
    }, [parsed]);

    const handleSavePlayerName = () => {
        if (!parsed?.bytes) return;
        try {
            writePlayerName(parsed.bytes, playerName);
            const updated = readPlayerName(parsed.bytes);
            setPlayerName(updated);
        } catch (e) {
            console.error(e);
            setError(e.message || "Failed to save player name.");
        }
    };

    const handleSaveStyling = () => {
        if (!parsed?.bytes || !styling) return;
        try {
            writeStyling(parsed.bytes, styling);
            const updated = readStyling(parsed.bytes);
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
    const abilityCardOptions = cardList; // Gate cards can be used as ability cards

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
        if (val === -1 && field === "bakuganId") {
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
        if (!parsed?.bytes || !decks) return;
        try {
            decks.forEach((deck, idx) => {
                writeDeck(parsed.bytes, idx, deck);
            });
            const deck1 = readDeck(parsed.bytes, 0);
            const deck2 = readDeck(parsed.bytes, 1);
            setDecks([deck1, deck2]);
        } catch (e) {
            console.error(e);
            setError(e.message || "Failed to save decks.");
        }
    };

    // ---------- Render ----------

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
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
                <div className="border-b border-gray-200 flex gap-4">
                    <button
                        type="button"
                        onClick={() => setActiveTab("bakugan")}
                        className={`pb-2 text-sm font-medium border-b-2 -mb-[1px] ${activeTab === "bakugan"
                            ? "border-blue text-white"
                            : "border-transparent text-white hover:text-gray-500"
                            }`}
                    >
                        Bakugan Stats
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("cards")}
                        className={`pb-2 text-sm font-medium border-b-2 -mb-[1px] ${activeTab === "cards"
                            ? "border-blue text-white"
                            : "border-transparent text-white hover:text-gray-500"
                            }`}
                    >
                        Cards
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("appearance")}
                        className={`pb-2 text-sm font-medium border-b-2 -mb-[1px] ${activeTab === "appearance"
                            ? "border-blue text-white"
                            : "border-transparent text-white hover:text-gray-500"
                            }`}
                    >
                        Appearance
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("decks")}
                        className={`pb-2 text-sm font-medium border-b-2 -mb-[1px] ${activeTab === "decks"
                            ? "border-blue text-white"
                            : "border-transparent text-white hover:text-gray-500"
                            }`}
                    >
                        Decks
                    </button>
                </div>

                {/* Tab content */}
                {parsed && activeTab === "bakugan" && (
                    <section className="space-y-4">
                        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                            <div className="flex flex-col md:flex-row gap-4">
                                <div className="flex flex-col">
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
                                                {b.name} (ID {b.id})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex flex-col">
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
                                                {a.name} (ID {a.id})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {entry && editableStats ? (
                            <div className="mt-2">

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

                {parsed && activeTab === "cards" && (
                    <section className="space-y-6">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900">Cards</h2>
                                <p className="text-xs text-gray-800">
                                    Toggle cards to unlock/lock.
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
                            <p className="text-sm text-gray-800">Card data not available.</p>
                        )}
                    </section>
                )}

                {parsed && activeTab === "appearance" && (
                    <section className="space-y-6">
                        <h2 className="text-lg font-semibold text-gray-900">Appearance</h2>

                        {/* Player name */}
                        <div className="max-w-md space-y-2">
                            <label className="text-sm font-medium text-gray-900">
                                Player Name
                            </label>
                            <input
                                type="text"
                                maxLength={8}
                                value={playerName}
                                onChange={(e) => setPlayerName(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                                placeholder="Enter up to 8 characters"
                            />
                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    onClick={handleSavePlayerName}
                                    className="mt-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700 transition"
                                >
                                    Save Name to Memory
                                </button>
                            </div>
                        </div>

                        {/* Character styling */}
                        <div className="space-y-3">
                            <h3 className="text-md font-semibold text-gray-900">
                                Character Style
                            </h3>

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
                                    Styling data not available.
                                </p>
                            )}
                        </div>
                    </section>
                )}

                {parsed && activeTab === "decks" && (
                    <section className="space-y-6">
                        <h2 className="text-lg font-semibold text-gray-900">Decks</h2>
                        <p className="text-xs text-gray-800">
                            Each deck contains 3 Bakugan, 3 Gate Cards, and 3 Ability Cards.
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
                                                <h3 className="text-sm font-semibold text-gray-900">
                                                    Deck {deckIndex + 1}
                                                </h3>
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
                            <p className="text-sm text-gray-800">Deck data not available.</p>
                        )}
                    </section>
                )}
            </div>
        </div>
    );
}
