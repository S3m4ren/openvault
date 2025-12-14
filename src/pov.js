/**
 * OpenVault POV & Character Detection
 *
 * Handles point-of-view determination and character detection for memory filtering.
 */

import { getContext } from '../../../../extensions.js';
import { getOpenVaultData, log } from './utils.js';
import { MEMORIES_KEY, CHARACTERS_KEY } from './constants.js';

/**
 * Get active characters in the conversation
 * @returns {string[]}
 */
export function getActiveCharacters() {
    const context = getContext();
    const characters = [context.name2]; // Main character

    // Add user
    if (context.name1) {
        characters.push(context.name1);
    }

    // Add group members if in group chat
    if (context.groupId) {
        const group = context.groups?.find(g => g.id === context.groupId);
        if (group?.members) {
            for (const member of group.members) {
                const char = context.characters?.find(c => c.avatar === member);
                if (char?.name && !characters.includes(char.name)) {
                    characters.push(char.name);
                }
            }
        }
    }

    return characters;
}

/**
 * Detect characters present in recent messages (for narrator mode)
 * Scans message content for character names from stored memories
 * @param {number} messageCount - Number of recent messages to scan
 * @returns {string[]} - List of detected character names
 */
export function detectPresentCharactersFromMessages(messageCount = 2) {
    const context = getContext();
    const chat = context.chat || [];
    const data = getOpenVaultData();

    if (!data) {
        // Return just the basic character names if no data
        const characters = [];
        if (context.name1) characters.push(context.name1);
        if (context.name2) characters.push(context.name2);
        return characters;
    }

    // Get all known character names from memories
    const knownCharacters = new Set();
    for (const memory of (data[MEMORIES_KEY] || [])) {
        for (const char of (memory.characters_involved || [])) {
            knownCharacters.add(char.toLowerCase());
        }
        for (const witness of (memory.witnesses || [])) {
            knownCharacters.add(witness.toLowerCase());
        }
    }
    // Also add from character states
    for (const charName of Object.keys(data[CHARACTERS_KEY] || {})) {
        knownCharacters.add(charName.toLowerCase());
    }

    // Add user and main character
    if (context.name1) knownCharacters.add(context.name1.toLowerCase());
    if (context.name2) knownCharacters.add(context.name2.toLowerCase());

    // Scan recent messages
    const recentMessages = chat
        .filter(m => !m.is_system)
        .slice(-messageCount);

    const presentCharacters = new Set();

    for (const msg of recentMessages) {
        const text = (msg.mes || '').toLowerCase();
        const name = (msg.name || '').toLowerCase();

        // Add message sender
        if (name) {
            presentCharacters.add(name);
        }

        // Scan message content for character names
        for (const charName of knownCharacters) {
            if (text.includes(charName)) {
                presentCharacters.add(charName);
            }
        }
    }

    // Convert back to original case by finding matches
    const result = [];
    for (const lowerName of presentCharacters) {
        // Try to find original casing from data
        for (const charName of Object.keys(data[CHARACTERS_KEY] || {})) {
            if (charName.toLowerCase() === lowerName) {
                result.push(charName);
                break;
            }
        }
        // Fallback: check context names
        if (!result.some(r => r.toLowerCase() === lowerName)) {
            if (context.name1?.toLowerCase() === lowerName) result.push(context.name1);
            else if (context.name2?.toLowerCase() === lowerName) result.push(context.name2);
            else result.push(lowerName); // Keep lowercase if no match found
        }
    }

    log(`Detected present characters: ${result.join(', ')}`);
    return result;
}

/**
 * Get POV characters for memory filtering
 * - Group chat: Use the responding character's name (true POV)
 * - Solo chat: Use characters detected in recent messages (narrator mode)
 * @returns {{ povCharacters: string[], isGroupChat: boolean }}
 */
export function getPOVContext() {
    const context = getContext();
    const isGroupChat = !!context.groupId;

    if (isGroupChat) {
        // Group chat: Use the specific responding character
        log(`Group chat mode: POV character = ${context.name2}`);
        return {
            povCharacters: [context.name2],
            isGroupChat: true
        };
    } else {
        // Solo chat (narrator mode): Detect characters from recent messages
        const presentCharacters = detectPresentCharactersFromMessages(2);

        // If no characters detected, fall back to context names
        if (presentCharacters.length === 0) {
            presentCharacters.push(context.name2);
            if (context.name1) presentCharacters.push(context.name1);
        }

        log(`Narrator mode: POV characters = ${presentCharacters.join(', ')}`);
        return {
            povCharacters: presentCharacters,
            isGroupChat: false
        };
    }
}
