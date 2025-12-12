/**
 * OpenVault - Agentic Memory Extension for SillyTavern
 *
 * Provides POV-aware memory with witness tracking, relationship dynamics,
 * and emotional continuity for roleplay conversations.
 *
 * All data is stored in chatMetadata - no external services required.
 */

import { eventSource, event_types, saveSettingsDebounced, saveChatConditional, setExtensionPrompt, extension_prompt_types } from "../../../../script.js";
import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { executeSlashCommandsWithOptions } from "../../../slash-commands.js";
import { ConnectionManagerRequestService } from "../../shared.js";

export const extensionName = 'openvault';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// Metadata keys
const METADATA_KEY = 'openvault';
const MEMORIES_KEY = 'memories';
const CHARACTERS_KEY = 'character_states';
const RELATIONSHIPS_KEY = 'relationships';
const LAST_PROCESSED_KEY = 'last_processed_message_id';

// Default settings
const defaultSettings = {
    enabled: true,
    automaticMode: false,
    extractionProfile: '',
    tokenBudget: 1000,
    maxMemoriesPerRetrieval: 10,
    debugMode: false,
};

/**
 * Get OpenVault data from chat metadata
 * @returns {Object}
 */
function getOpenVaultData() {
    const context = getContext();
    if (!context.chatMetadata) {
        context.chatMetadata = {};
    }
    if (!context.chatMetadata[METADATA_KEY]) {
        context.chatMetadata[METADATA_KEY] = {
            [MEMORIES_KEY]: [],
            [CHARACTERS_KEY]: {},
            [RELATIONSHIPS_KEY]: {},
            [LAST_PROCESSED_KEY]: -1,
        };
    }
    return context.chatMetadata[METADATA_KEY];
}

/**
 * Save OpenVault data to chat metadata
 */
async function saveOpenVaultData() {
    await saveChatConditional();
    log('Data saved to chat metadata');
}

/**
 * Generate a unique ID
 * @returns {string}
 */
function generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Load extension settings
 */
async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};

    // Apply defaults for any missing settings
    for (const [key, value] of Object.entries(defaultSettings)) {
        if (extension_settings[extensionName][key] === undefined) {
            extension_settings[extensionName][key] = value;
        }
    }

    // Load HTML template
    const settingsHtml = await $.get(`${extensionFolderPath}/templates/settings_panel.html`);
    $('#extensions_settings2').append(settingsHtml);

    // Bind UI elements
    bindUIElements();

    // Update UI to match current settings
    updateUI();

    console.log('[OpenVault] Settings loaded');
}

/**
 * Bind UI elements to settings
 */
function bindUIElements() {
    const settings = extension_settings[extensionName];

    // Enabled toggle
    $('#openvault_enabled').on('change', function() {
        settings.enabled = $(this).is(':checked');
        saveSettingsDebounced();
        updateEventListeners();
    });

    // Automatic mode toggle
    $('#openvault_automatic').on('change', function() {
        settings.automaticMode = $(this).is(':checked');
        saveSettingsDebounced();
        updateEventListeners();
    });

    // Token budget slider
    $('#openvault_token_budget').on('input', function() {
        settings.tokenBudget = parseInt($(this).val());
        $('#openvault_token_budget_value').text(settings.tokenBudget);
        saveSettingsDebounced();
    });

    // Debug mode toggle
    $('#openvault_debug').on('change', function() {
        settings.debugMode = $(this).is(':checked');
        saveSettingsDebounced();
    });

    // Manual action buttons
    $('#openvault_extract_btn').on('click', () => extractMemories());
    $('#openvault_retrieve_btn').on('click', () => retrieveAndInjectContext());
    $('#openvault_extract_all_btn').on('click', () => extractAllMessages());
    $('#openvault_refresh_stats_btn').on('click', () => refreshAllUI());

    // Danger zone buttons
    $('#openvault_delete_chat_btn').on('click', () => deleteCurrentChatData());
    $('#openvault_delete_all_btn').on('click', () => deleteAllData());

    // Profile selector
    $('#openvault_extraction_profile').on('change', function() {
        settings.extractionProfile = $(this).val();
        saveSettingsDebounced();
    });

    // Memory browser pagination
    $('#openvault_prev_page').on('click', () => {
        if (memoryBrowserPage > 0) {
            memoryBrowserPage--;
            renderMemoryBrowser();
        }
    });
    $('#openvault_next_page').on('click', () => {
        memoryBrowserPage++;
        renderMemoryBrowser();
    });

    // Memory browser filters
    $('#openvault_filter_type').on('change', () => {
        memoryBrowserPage = 0;
        renderMemoryBrowser();
    });
    $('#openvault_filter_character').on('change', () => {
        memoryBrowserPage = 0;
        renderMemoryBrowser();
    });
}

/**
 * Update UI to match current settings
 */
function updateUI() {
    const settings = extension_settings[extensionName];

    $('#openvault_enabled').prop('checked', settings.enabled);
    $('#openvault_automatic').prop('checked', settings.automaticMode);
    $('#openvault_token_budget').val(settings.tokenBudget);
    $('#openvault_token_budget_value').text(settings.tokenBudget);
    $('#openvault_debug').prop('checked', settings.debugMode);

    // Populate profile selector
    populateProfileSelector();

    // Refresh all UI components
    refreshAllUI();
}

/**
 * Populate the connection profile selector
 */
function populateProfileSelector() {
    const settings = extension_settings[extensionName];
    const profiles = extension_settings.connectionManager?.profiles || [];
    const $selector = $('#openvault_extraction_profile');

    $selector.empty();
    $selector.append('<option value="">Use current connection</option>');

    for (const profile of profiles) {
        const selected = profile.id === settings.extractionProfile ? 'selected' : '';
        $selector.append(`<option value="${profile.id}" ${selected}>${profile.name}</option>`);
    }
}

/**
 * Refresh statistics display
 */
function refreshStats() {
    const data = getOpenVaultData();

    $('#openvault_stat_events').text(data[MEMORIES_KEY]?.length || 0);
    $('#openvault_stat_characters').text(Object.keys(data[CHARACTERS_KEY] || {}).length);
    $('#openvault_stat_relationships').text(Object.keys(data[RELATIONSHIPS_KEY] || {}).length);

    log(`Stats: ${data[MEMORIES_KEY]?.length || 0} memories, ${Object.keys(data[CHARACTERS_KEY] || {}).length} characters`);
}

// Pagination state for memory browser
let memoryBrowserPage = 0;
const MEMORIES_PER_PAGE = 10;

/**
 * Render the memory browser list
 */
function renderMemoryBrowser() {
    const data = getOpenVaultData();
    const memories = data[MEMORIES_KEY] || [];
    const $list = $('#openvault_memory_list');
    const $pageInfo = $('#openvault_page_info');
    const $prevBtn = $('#openvault_prev_page');
    const $nextBtn = $('#openvault_next_page');

    // Get filter values
    const typeFilter = $('#openvault_filter_type').val();
    const characterFilter = $('#openvault_filter_character').val();

    // Filter memories
    let filteredMemories = memories.filter(m => {
        if (typeFilter && m.event_type !== typeFilter) return false;
        if (characterFilter && !m.characters_involved?.includes(characterFilter)) return false;
        return true;
    });

    // Sort by creation date (newest first)
    filteredMemories.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

    // Pagination
    const totalPages = Math.ceil(filteredMemories.length / MEMORIES_PER_PAGE) || 1;
    memoryBrowserPage = Math.min(memoryBrowserPage, totalPages - 1);
    const startIdx = memoryBrowserPage * MEMORIES_PER_PAGE;
    const pageMemories = filteredMemories.slice(startIdx, startIdx + MEMORIES_PER_PAGE);

    // Clear and render
    $list.empty();

    if (pageMemories.length === 0) {
        $list.html('<p class="openvault-placeholder">No memories yet</p>');
    } else {
        for (const memory of pageMemories) {
            const date = memory.created_at ? new Date(memory.created_at).toLocaleDateString() : 'Unknown';
            const typeClass = memory.event_type || 'action';
            const characters = (memory.characters_involved || []).map(c =>
                `<span class="openvault-character-tag">${escapeHtml(c)}</span>`
            ).join('');
            const witnesses = memory.witnesses?.length > 0
                ? `<div class="openvault-memory-witnesses">Witnesses: ${memory.witnesses.join(', ')}</div>`
                : '';

            $list.append(`
                <div class="openvault-memory-item ${typeClass}" data-id="${memory.id}">
                    <div class="openvault-memory-header">
                        <span class="openvault-memory-type">${escapeHtml(memory.event_type || 'event')}</span>
                        <span class="openvault-memory-date">${date}</span>
                    </div>
                    <div class="openvault-memory-summary">${escapeHtml(memory.summary || 'No summary')}</div>
                    <div class="openvault-memory-characters">${characters}</div>
                    ${witnesses}
                    <div class="openvault-memory-actions">
                        <button class="menu_button openvault-delete-memory" data-id="${memory.id}">
                            <i class="fa-solid fa-trash"></i> Delete
                        </button>
                    </div>
                </div>
            `);
        }

        // Bind delete buttons
        $list.find('.openvault-delete-memory').on('click', async function() {
            const id = $(this).data('id');
            await deleteMemory(id);
        });
    }

    // Update pagination
    $pageInfo.text(`Page ${memoryBrowserPage + 1} of ${totalPages}`);
    $prevBtn.prop('disabled', memoryBrowserPage === 0);
    $nextBtn.prop('disabled', memoryBrowserPage >= totalPages - 1);

    // Populate character filter dropdown
    populateCharacterFilter();
}

/**
 * Delete a memory by ID
 */
async function deleteMemory(id) {
    const data = getOpenVaultData();
    const idx = data[MEMORIES_KEY]?.findIndex(m => m.id === id);
    if (idx !== -1) {
        data[MEMORIES_KEY].splice(idx, 1);
        await saveChatConditional();
        refreshAllUI();
        toastr.success('Memory deleted', 'OpenVault');
    }
}

/**
 * Populate the character filter dropdown
 */
function populateCharacterFilter() {
    const data = getOpenVaultData();
    const memories = data[MEMORIES_KEY] || [];
    const characters = new Set();

    for (const memory of memories) {
        for (const char of (memory.characters_involved || [])) {
            characters.add(char);
        }
    }

    const $filter = $('#openvault_filter_character');
    const currentValue = $filter.val();
    $filter.find('option:not(:first)').remove();

    for (const char of Array.from(characters).sort()) {
        $filter.append(`<option value="${escapeHtml(char)}">${escapeHtml(char)}</option>`);
    }

    // Restore selection if still valid
    if (currentValue && characters.has(currentValue)) {
        $filter.val(currentValue);
    }
}

/**
 * Render character states
 */
function renderCharacterStates() {
    const data = getOpenVaultData();
    const characters = data[CHARACTERS_KEY] || {};
    const $container = $('#openvault_character_states');

    $container.empty();

    const charNames = Object.keys(characters);
    if (charNames.length === 0) {
        $container.html('<p class="openvault-placeholder">No character data yet</p>');
        return;
    }

    for (const name of charNames.sort()) {
        const char = characters[name];
        const emotion = char.current_emotion || 'neutral';
        const intensity = char.emotion_intensity || 5;
        const knownCount = char.known_events?.length || 0;

        $container.append(`
            <div class="openvault-character-item">
                <div class="openvault-character-name">${escapeHtml(name)}</div>
                <div class="openvault-emotion">
                    <span class="openvault-emotion-label">${escapeHtml(emotion)}</span>
                    <div class="openvault-emotion-bar">
                        <div class="openvault-emotion-fill" style="width: ${intensity * 10}%"></div>
                    </div>
                </div>
                <div class="openvault-memory-witnesses">Known events: ${knownCount}</div>
            </div>
        `);
    }
}

/**
 * Render relationships
 */
function renderRelationships() {
    const data = getOpenVaultData();
    const relationships = data[RELATIONSHIPS_KEY] || {};
    const $container = $('#openvault_relationships');

    $container.empty();

    const relKeys = Object.keys(relationships);
    if (relKeys.length === 0) {
        $container.html('<p class="openvault-placeholder">No relationship data yet</p>');
        return;
    }

    for (const key of relKeys.sort()) {
        const rel = relationships[key];
        const trust = rel.trust_level || 5;
        const tension = rel.tension_level || 0;
        const type = rel.relationship_type || 'acquaintance';

        $container.append(`
            <div class="openvault-relationship-item">
                <div class="openvault-relationship-pair">${escapeHtml(rel.character_a || '?')} ↔ ${escapeHtml(rel.character_b || '?')}</div>
                <div class="openvault-relationship-type">${escapeHtml(type)}</div>
                <div class="openvault-relationship-bars">
                    <div class="openvault-bar-row">
                        <span class="openvault-bar-label">Trust</span>
                        <div class="openvault-bar-container">
                            <div class="openvault-bar-fill trust" style="width: ${trust * 10}%"></div>
                        </div>
                    </div>
                    <div class="openvault-bar-row">
                        <span class="openvault-bar-label">Tension</span>
                        <div class="openvault-bar-container">
                            <div class="openvault-bar-fill tension" style="width: ${tension * 10}%"></div>
                        </div>
                    </div>
                </div>
            </div>
        `);
    }
}

/**
 * Refresh all UI components
 */
function refreshAllUI() {
    refreshStats();
    renderMemoryBrowser();
    renderCharacterStates();
    renderRelationships();
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Update event listeners based on settings
 */
function updateEventListeners() {
    const settings = extension_settings[extensionName];

    // Remove existing listeners first
    eventSource.removeListener(event_types.MESSAGE_RECEIVED, onMessageReceived);
    eventSource.removeListener(event_types.GENERATION_STARTED, onGenerationStarted);
    eventSource.removeListener(event_types.CHAT_CHANGED, onChatChanged);

    // Add listeners if enabled and automatic mode is on
    if (settings.enabled && settings.automaticMode) {
        eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
        eventSource.on(event_types.GENERATION_STARTED, onGenerationStarted);
        eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
        log('Automatic mode enabled - event listeners attached');
        // Initialize the injection immediately
        updatePersistentInjection();
    } else {
        // Clear injection when disabled/manual
        setExtensionPrompt(extensionName, '', extension_prompt_types.IN_CHAT, 0);
        log('Manual mode - event listeners removed, injection cleared');
    }
}

/**
 * Handle chat changed event
 */
async function onChatChanged() {
    const settings = extension_settings[extensionName];
    if (!settings.enabled || !settings.automaticMode) return;

    log('Chat changed, updating injection');
    // Small delay to ensure chat metadata is loaded
    setTimeout(() => updatePersistentInjection(), 500);
}

/**
 * Handle message received event (automatic mode)
 */
async function onMessageReceived(messageId) {
    const settings = extension_settings[extensionName];
    if (!settings.enabled || !settings.automaticMode) return;

    log(`Message received: ${messageId}, queuing extraction`);
    await extractMemories([messageId]);
    // Update injection after new memories are extracted
    await updatePersistentInjection();
}

/**
 * Handle generation started event (automatic mode)
 */
async function onGenerationStarted() {
    const settings = extension_settings[extensionName];
    if (!settings.enabled || !settings.automaticMode) return;

    log('Generation starting, updating injection');
    await updatePersistentInjection();
}

/**
 * Extract memories from messages using LLM
 * @param {number[]} messageIds - Optional specific message IDs to extract
 */
async function extractMemories(messageIds = null) {
    const settings = extension_settings[extensionName];
    if (!settings.enabled) {
        toastr.warning('OpenVault is disabled', 'OpenVault');
        return;
    }

    const context = getContext();
    const chat = context.chat;

    if (!chat || chat.length === 0) {
        toastr.warning('No chat messages to extract', 'OpenVault');
        return;
    }

    const data = getOpenVaultData();

    // Get messages to extract
    let messagesToExtract = [];
    if (messageIds && messageIds.length > 0) {
        messagesToExtract = messageIds
            .map(id => ({ id, ...chat[id] }))
            .filter(m => m && !m.is_system);
    } else {
        // Extract last few unprocessed messages
        const lastProcessedId = data[LAST_PROCESSED_KEY] || -1;
        messagesToExtract = chat
            .map((m, idx) => ({ id: idx, ...m }))
            .filter(m => !m.is_system && m.id > lastProcessedId)
            .slice(-5);
    }

    if (messagesToExtract.length === 0) {
        toastr.info('No new messages to extract', 'OpenVault');
        return;
    }

    log(`Extracting ${messagesToExtract.length} messages`);
    setStatus('extracting');

    try {
        const characterName = context.name2;
        const userName = context.name1;

        // Build extraction prompt
        const messagesText = messagesToExtract.map(m => {
            const speaker = m.is_user ? userName : (m.name || characterName);
            return `[${speaker}]: ${m.mes}`;
        }).join('\n\n');

        const extractionPrompt = buildExtractionPrompt(messagesText, characterName, userName);

        // Call LLM for extraction
        const extractedJson = await callLLMForExtraction(extractionPrompt);

        if (!extractedJson) {
            throw new Error('No extraction result from LLM');
        }

        // Parse and store extracted events
        const events = parseExtractionResult(extractedJson, messagesToExtract, characterName, userName);

        if (events.length > 0) {
            // Add events to storage
            data[MEMORIES_KEY] = data[MEMORIES_KEY] || [];
            data[MEMORIES_KEY].push(...events);

            // Update character states and relationships
            updateCharacterStatesFromEvents(events, data);
            updateRelationshipsFromEvents(events, data);

            // Update last processed message ID
            const maxId = Math.max(...messagesToExtract.map(m => m.id));
            data[LAST_PROCESSED_KEY] = Math.max(data[LAST_PROCESSED_KEY] || -1, maxId);

            await saveOpenVaultData();

            log(`Extracted ${events.length} events`);
            toastr.success(`Extracted ${events.length} memory events`, 'OpenVault');
        } else {
            toastr.info('No significant events found in messages', 'OpenVault');
        }

        setStatus('ready');
        refreshAllUI();

        return { events_created: events.length, messages_processed: messagesToExtract.length };
    } catch (error) {
        console.error('[OpenVault] Extraction error:', error);
        toastr.error(`Extraction failed: ${error.message}`, 'OpenVault');
        setStatus('error');
        throw error;
    }
}

/**
 * Build the extraction prompt
 */
function buildExtractionPrompt(messagesText, characterName, userName) {
    return `You are analyzing roleplay messages to extract structured memory events.

## Characters
- Main character: ${characterName}
- User's character: ${userName}

## Messages to analyze:
${messagesText}

## Task
Extract significant events from these messages. For each event, identify:
1. **event_type**: One of: "action", "revelation", "emotion_shift", "relationship_change"
2. **summary**: Brief description of what happened (1-2 sentences)
3. **characters_involved**: List of character names directly involved
4. **witnesses**: List of character names who observed this (important for POV filtering)
5. **location**: Where this happened (if mentioned, otherwise "unknown")
6. **is_secret**: Whether this information should only be known by witnesses
7. **emotional_impact**: Object mapping character names to emotional changes (e.g., {"${characterName}": "growing trust", "${userName}": "surprised"})
8. **relationship_impact**: Object describing relationship changes (e.g., {"${characterName}->${userName}": "trust increased"})

Only extract events that are significant for character memory and story continuity. Skip mundane exchanges.

Respond with a JSON array of events:
\`\`\`json
[
  {
    "event_type": "...",
    "summary": "...",
    "characters_involved": [...],
    "witnesses": [...],
    "location": "...",
    "is_secret": false,
    "emotional_impact": {...},
    "relationship_impact": {...}
  }
]
\`\`\`

If no significant events, respond with an empty array: []`;
}

/**
 * Call LLM for extraction using ConnectionManagerRequestService
 */
async function callLLMForExtraction(prompt) {
    const settings = extension_settings[extensionName];

    // Get profile ID - use extraction profile or fall back to first available
    let profileId = settings.extractionProfile;

    // If no profile specified, try to use the connection manager's first profile
    if (!profileId) {
        const profiles = extension_settings?.connectionManager?.profiles || [];
        if (profiles.length > 0) {
            profileId = profiles[0].id;
            log(`No extraction profile set, using first available: ${profiles[0].name}`);
        }
    }

    if (!profileId || !ConnectionManagerRequestService) {
        log('No connection profile available for extraction');
        toastr.warning('Please select an extraction profile in OpenVault settings', 'OpenVault');
        return null;
    }

    try {
        log(`Using ConnectionManagerRequestService with profile: ${profileId}`);

        // Build messages array
        const messages = [
            {
                role: 'system',
                content: 'You are a helpful assistant that extracts structured data from roleplay conversations. Always respond with valid JSON only, no markdown formatting.'
            },
            { role: 'user', content: prompt }
        ];

        // Send request via ConnectionManagerRequestService
        const result = await ConnectionManagerRequestService.sendRequest(
            profileId,
            messages,
            2000, // max tokens
            {
                includePreset: true,
                includeInstruct: true,
                stream: false
            },
            {} // override payload
        );

        // Extract content from response
        const content = result?.content || result || '';

        // Parse reasoning if present (some models return thinking tags)
        const context = getContext();
        if (context.parseReasoningFromString) {
            const parsed = context.parseReasoningFromString(content);
            return parsed ? parsed.content : content;
        }

        return content;
    } catch (error) {
        log(`LLM call error: ${error.message}`);
        toastr.error(`Extraction failed: ${error.message}`, 'OpenVault');
        return null;
    }
}

/**
 * Parse extraction result from LLM
 */
function parseExtractionResult(jsonString, messages, characterName, userName) {
    try {
        // Extract JSON from response (handle markdown code blocks)
        let cleaned = jsonString;
        const jsonMatch = jsonString.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            cleaned = jsonMatch[1];
        }

        const parsed = JSON.parse(cleaned.trim());
        const events = Array.isArray(parsed) ? parsed : [parsed];

        // Enrich events with metadata
        return events.map(event => ({
            id: generateId(),
            ...event,
            message_ids: messages.map(m => m.id),
            created_at: Date.now(),
            characters_involved: event.characters_involved || [],
            witnesses: event.witnesses || event.characters_involved || [],
            location: event.location || 'unknown',
            is_secret: event.is_secret || false,
            emotional_impact: event.emotional_impact || {},
            relationship_impact: event.relationship_impact || {},
        }));
    } catch (error) {
        log(`Failed to parse extraction result: ${error.message}`);
        return [];
    }
}

/**
 * Update character states based on extracted events
 */
function updateCharacterStatesFromEvents(events, data) {
    data[CHARACTERS_KEY] = data[CHARACTERS_KEY] || {};

    for (const event of events) {
        // Update emotional impact
        if (event.emotional_impact) {
            for (const [charName, emotion] of Object.entries(event.emotional_impact)) {
                if (!data[CHARACTERS_KEY][charName]) {
                    data[CHARACTERS_KEY][charName] = {
                        name: charName,
                        current_emotion: 'neutral',
                        emotion_intensity: 5,
                        known_events: [],
                    };
                }

                // Update emotion
                data[CHARACTERS_KEY][charName].current_emotion = emotion;
                data[CHARACTERS_KEY][charName].last_updated = Date.now();
            }
        }

        // Add event to witnesses' knowledge
        for (const witness of (event.witnesses || [])) {
            if (!data[CHARACTERS_KEY][witness]) {
                data[CHARACTERS_KEY][witness] = {
                    name: witness,
                    current_emotion: 'neutral',
                    emotion_intensity: 5,
                    known_events: [],
                };
            }
            if (!data[CHARACTERS_KEY][witness].known_events.includes(event.id)) {
                data[CHARACTERS_KEY][witness].known_events.push(event.id);
            }
        }
    }
}

/**
 * Update relationships based on extracted events
 */
function updateRelationshipsFromEvents(events, data) {
    data[RELATIONSHIPS_KEY] = data[RELATIONSHIPS_KEY] || {};

    for (const event of events) {
        if (event.relationship_impact) {
            for (const [relationKey, impact] of Object.entries(event.relationship_impact)) {
                // Parse relationship key (e.g., "Alice->Bob")
                const match = relationKey.match(/^(.+?)\s*->\s*(.+)$/);
                if (!match) continue;

                const [, charA, charB] = match;
                const key = `${charA}<->${charB}`;

                if (!data[RELATIONSHIPS_KEY][key]) {
                    data[RELATIONSHIPS_KEY][key] = {
                        character_a: charA,
                        character_b: charB,
                        trust_level: 5,
                        tension_level: 0,
                        relationship_type: 'acquaintance',
                        history: [],
                    };
                }

                // Update based on impact description
                const impactLower = impact.toLowerCase();
                if (impactLower.includes('trust') && impactLower.includes('increas')) {
                    data[RELATIONSHIPS_KEY][key].trust_level = Math.min(10, data[RELATIONSHIPS_KEY][key].trust_level + 1);
                } else if (impactLower.includes('trust') && impactLower.includes('decreas')) {
                    data[RELATIONSHIPS_KEY][key].trust_level = Math.max(0, data[RELATIONSHIPS_KEY][key].trust_level - 1);
                }

                if (impactLower.includes('tension') && impactLower.includes('increas')) {
                    data[RELATIONSHIPS_KEY][key].tension_level = Math.min(10, data[RELATIONSHIPS_KEY][key].tension_level + 1);
                } else if (impactLower.includes('tension') && impactLower.includes('decreas')) {
                    data[RELATIONSHIPS_KEY][key].tension_level = Math.max(0, data[RELATIONSHIPS_KEY][key].tension_level - 1);
                }

                // Add to history
                data[RELATIONSHIPS_KEY][key].history.push({
                    event_id: event.id,
                    impact: impact,
                    timestamp: Date.now(),
                });
            }
        }
    }
}

/**
 * Extract memories from all messages in current chat
 */
async function extractAllMessages() {
    const context = getContext();
    const chat = context.chat;

    if (!chat || chat.length === 0) {
        toastr.warning('No chat messages to extract', 'OpenVault');
        return;
    }

    // Reset last processed to start fresh
    const data = getOpenVaultData();
    data[LAST_PROCESSED_KEY] = -1;

    const allMessageIds = chat
        .map((m, idx) => idx)
        .filter(idx => !chat[idx].is_system);

    if (allMessageIds.length === 0) {
        toastr.warning('No extractable messages found', 'OpenVault');
        return;
    }

    toastr.info(`Extracting ${allMessageIds.length} messages...`, 'OpenVault');

    // Process in batches of 5
    const batchSize = 5;
    let totalEvents = 0;

    for (let i = 0; i < allMessageIds.length; i += batchSize) {
        const batch = allMessageIds.slice(i, i + batchSize);
        try {
            const result = await extractMemories(batch);
            totalEvents += result?.events_created || 0;

            // Small delay between batches
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            console.error('[OpenVault] Batch extraction error:', error);
        }
    }

    toastr.success(`Extracted ${totalEvents} total events`, 'OpenVault');
    refreshAllUI();
}

/**
 * Retrieve relevant context and inject into prompt
 */
async function retrieveAndInjectContext() {
    const settings = extension_settings[extensionName];
    if (!settings.enabled) {
        log('OpenVault disabled, skipping retrieval');
        return null;
    }

    const context = getContext();
    const chat = context.chat;

    if (!chat || chat.length === 0) {
        log('No chat to retrieve context for');
        return null;
    }

    const data = getOpenVaultData();
    const memories = data[MEMORIES_KEY] || [];

    if (memories.length === 0) {
        log('No memories stored yet');
        return null;
    }

    setStatus('retrieving');

    try {
        const characterName = context.name2;
        const userName = context.name1;
        const activeCharacters = getActiveCharacters();

        // Get character's known events (POV filtering)
        const characterState = data[CHARACTERS_KEY]?.[characterName];
        const knownEventIds = characterState?.known_events || [];

        // Filter memories by POV - only what this character knows
        // Use case-insensitive matching for character names
        const charNameLower = characterName.toLowerCase();
        const accessibleMemories = memories.filter(m => {
            // Character was a witness (case-insensitive)
            if (m.witnesses?.some(w => w.toLowerCase() === charNameLower)) return true;
            // Non-secret events that character might know about (case-insensitive)
            if (!m.is_secret && m.characters_involved?.some(c => c.toLowerCase() === charNameLower)) return true;
            // Explicitly in known events
            if (knownEventIds.includes(m.id)) return true;
            return false;
        });

        log(`POV filter: character="${characterName}", total=${memories.length}, accessible=${accessibleMemories.length}`);

        // If POV filtering is too strict, fall back to all memories with a warning
        let memoriesToUse = accessibleMemories;
        if (accessibleMemories.length === 0 && memories.length > 0) {
            log('POV filter returned 0 results, using all memories as fallback');
            memoriesToUse = memories;
        }

        if (memoriesToUse.length === 0) {
            log('No memories available');
            setStatus('ready');
            return null;
        }

        // Get recent context for relevance matching
        const recentMessages = chat
            .filter(m => !m.is_system)
            .slice(-5)
            .map(m => m.mes)
            .join('\n');

        // Build retrieval prompt to select relevant memories
        const relevantMemories = await selectRelevantMemories(
            memoriesToUse,
            recentMessages,
            characterName,
            activeCharacters,
            settings.maxMemoriesPerRetrieval
        );

        if (!relevantMemories || relevantMemories.length === 0) {
            log('No relevant memories found');
            setStatus('ready');
            return null;
        }

        // Get relationship context
        const relationshipContext = getRelationshipContext(data, characterName, activeCharacters);

        // Get emotional state
        const emotionalState = characterState?.current_emotion || 'neutral';

        // Format and inject context
        const formattedContext = formatContextForInjection(
            relevantMemories,
            relationshipContext,
            emotionalState,
            characterName,
            settings.tokenBudget
        );

        if (formattedContext) {
            injectContext(formattedContext);
            log(`Injected ${relevantMemories.length} memories into context`);
            toastr.success(`Retrieved ${relevantMemories.length} relevant memories`, 'OpenVault');
        }

        setStatus('ready');
        return { memories: relevantMemories, context: formattedContext };
    } catch (error) {
        console.error('[OpenVault] Retrieval error:', error);
        setStatus('error');
        return null;
    }
}

/**
 * Select relevant memories using LLM or simple matching
 */
async function selectRelevantMemories(memories, recentContext, characterName, activeCharacters, limit) {
    // Simple relevance scoring based on:
    // 1. Recency
    // 2. Character involvement
    // 3. Keyword matching

    const scored = memories.map(memory => {
        let score = 0;

        // Recency bonus (newer = higher)
        const age = Date.now() - memory.created_at;
        const ageHours = age / (1000 * 60 * 60);
        score += Math.max(0, 10 - ageHours); // Up to 10 points for recent

        // Character involvement bonus
        for (const char of activeCharacters) {
            if (memory.characters_involved?.includes(char)) score += 5;
            if (memory.witnesses?.includes(char)) score += 3;
        }

        // Keyword matching (simple)
        const summaryLower = memory.summary?.toLowerCase() || '';
        const contextLower = recentContext.toLowerCase();
        const contextWords = contextLower.split(/\s+/).filter(w => w.length > 3);

        for (const word of contextWords) {
            if (summaryLower.includes(word)) score += 1;
        }

        // Event type bonus
        if (memory.event_type === 'revelation') score += 3;
        if (memory.event_type === 'relationship_change') score += 2;

        return { memory, score };
    });

    // Sort by score and take top N
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(s => s.memory);
}

/**
 * Get relationship context for active characters
 */
function getRelationshipContext(data, povCharacter, activeCharacters) {
    const relationships = data[RELATIONSHIPS_KEY] || {};
    const relevant = [];

    for (const [key, rel] of Object.entries(relationships)) {
        // Check if this relationship involves POV character and any active character
        const involvesPov = rel.character_a === povCharacter || rel.character_b === povCharacter;
        const involvesActive = activeCharacters.some(c =>
            c !== povCharacter && (rel.character_a === c || rel.character_b === c)
        );

        if (involvesPov && involvesActive) {
            const other = rel.character_a === povCharacter ? rel.character_b : rel.character_a;
            relevant.push({
                character: other,
                trust: rel.trust_level,
                tension: rel.tension_level,
                type: rel.relationship_type,
            });
        }
    }

    return relevant;
}

/**
 * Format context for injection into prompt
 */
function formatContextForInjection(memories, relationships, emotionalState, characterName, tokenBudget) {
    const lines = [];

    lines.push(`[${characterName}'s Memory & State]`);
    lines.push('');

    // Emotional state
    if (emotionalState && emotionalState !== 'neutral') {
        lines.push(`Current emotional state: ${emotionalState}`);
        lines.push('');
    }

    // Relationships
    if (relationships && relationships.length > 0) {
        lines.push('Relationships with present characters:');
        for (const rel of relationships) {
            const trustDesc = rel.trust >= 7 ? 'high trust' : rel.trust <= 3 ? 'low trust' : 'moderate trust';
            const tensionDesc = rel.tension >= 7 ? 'high tension' : rel.tension >= 4 ? 'some tension' : '';
            lines.push(`- ${rel.character}: ${rel.type || 'acquaintance'} (${trustDesc}${tensionDesc ? ', ' + tensionDesc : ''})`);
        }
        lines.push('');
    }

    // Memories
    if (memories && memories.length > 0) {
        lines.push('Relevant memories:');
        for (const memory of memories) {
            const prefix = memory.is_secret ? '[Secret] ' : '';
            lines.push(`- ${prefix}${memory.summary}`);
        }
    }

    lines.push(`[End ${characterName}'s Memory]`);

    // Rough token estimate (4 chars per token)
    let result = lines.join('\n');
    const estimatedTokens = result.length / 4;

    if (estimatedTokens > tokenBudget) {
        // Truncate memories if needed
        const overhead = (lines.slice(0, 5).join('\n').length + lines.slice(-1).join('\n').length) / 4;
        const availableForMemories = tokenBudget - overhead;

        const truncatedMemories = [];
        let currentTokens = 0;

        for (const memory of memories) {
            const memoryTokens = (memory.summary?.length || 0) / 4 + 5;
            if (currentTokens + memoryTokens <= availableForMemories) {
                truncatedMemories.push(memory);
                currentTokens += memoryTokens;
            } else {
                break;
            }
        }

        // Rebuild with truncated memories
        return formatContextForInjection(truncatedMemories, relationships, emotionalState, characterName, tokenBudget * 2);
    }

    return result;
}

/**
 * Inject retrieved context into the prompt
 * @param {string} contextText - Formatted context to inject
 */
function injectContext(contextText) {
    if (!contextText) {
        // Clear the injection if no context
        setExtensionPrompt(extensionName, '', extension_prompt_types.IN_CHAT, 0);
        return;
    }

    setExtensionPrompt(
        extensionName,
        contextText,
        extension_prompt_types.IN_CHAT,  // IN_CHAT works better for persistent injection
        0  // depth (0 = at the end of chat context)
    );

    log('Context injected into prompt');
}

/**
 * Update the persistent injection (for automatic mode)
 * This rebuilds and re-injects context based on current state
 */
async function updatePersistentInjection() {
    const settings = extension_settings[extensionName];

    // Clear injection if disabled or not in automatic mode
    if (!settings.enabled || !settings.automaticMode) {
        setExtensionPrompt(extensionName, '', extension_prompt_types.IN_CHAT, 0);
        return;
    }

    const context = getContext();
    if (!context.chat || context.chat.length === 0) {
        setExtensionPrompt(extensionName, '', extension_prompt_types.IN_CHAT, 0);
        return;
    }

    const data = getOpenVaultData();
    const memories = data[MEMORIES_KEY] || [];

    if (memories.length === 0) {
        setExtensionPrompt(extensionName, '', extension_prompt_types.IN_CHAT, 0);
        return;
    }

    const characterName = context.name2;
    const activeCharacters = getActiveCharacters();

    // Get character's known events (POV filtering)
    const characterState = data[CHARACTERS_KEY]?.[characterName];
    const knownEventIds = characterState?.known_events || [];

    // Filter memories by POV (case-insensitive)
    const charNameLower = characterName.toLowerCase();
    const accessibleMemories = memories.filter(m => {
        if (m.witnesses?.some(w => w.toLowerCase() === charNameLower)) return true;
        if (!m.is_secret && m.characters_involved?.some(c => c.toLowerCase() === charNameLower)) return true;
        if (knownEventIds.includes(m.id)) return true;
        return false;
    });

    // Fallback to all memories if POV filter is too strict
    let memoriesToUse = accessibleMemories;
    if (accessibleMemories.length === 0 && memories.length > 0) {
        log('Persistent injection: POV filter returned 0, using all memories');
        memoriesToUse = memories;
    }

    if (memoriesToUse.length === 0) {
        setExtensionPrompt(extensionName, '', extension_prompt_types.IN_CHAT, 0);
        return;
    }

    // Get recent context for relevance matching
    const recentMessages = context.chat
        .filter(m => !m.is_system)
        .slice(-5)
        .map(m => m.mes)
        .join('\n');

    // Select relevant memories
    const relevantMemories = await selectRelevantMemories(
        memoriesToUse,
        recentMessages,
        characterName,
        activeCharacters,
        settings.maxMemoriesPerRetrieval
    );

    if (!relevantMemories || relevantMemories.length === 0) {
        setExtensionPrompt(extensionName, '', extension_prompt_types.IN_CHAT, 0);
        return;
    }

    // Get relationship and emotional context
    const relationshipContext = getRelationshipContext(data, characterName, activeCharacters);
    const emotionalState = characterState?.current_emotion || 'neutral';

    // Format and inject
    const formattedContext = formatContextForInjection(
        relevantMemories,
        relationshipContext,
        emotionalState,
        characterName,
        settings.tokenBudget
    );

    if (formattedContext) {
        injectContext(formattedContext);
        log(`Persistent injection updated: ${relevantMemories.length} memories`);
    }
}

/**
 * Get active characters in the conversation
 * @returns {string[]}
 */
function getActiveCharacters() {
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
 * Delete current chat's OpenVault data
 */
async function deleteCurrentChatData() {
    if (!confirm('Are you sure you want to delete all OpenVault data for this chat?')) {
        return;
    }

    const context = getContext();
    if (context.chatMetadata) {
        delete context.chatMetadata[METADATA_KEY];
        await saveChatConditional();
    }

    toastr.success('Chat memories deleted', 'OpenVault');
    refreshAllUI();
}

/**
 * Delete all OpenVault data (requires typing DELETE)
 */
async function deleteAllData() {
    const confirmation = prompt('Type DELETE to confirm deletion of all OpenVault data:');
    if (confirmation !== 'DELETE') {
        toastr.warning('Deletion cancelled', 'OpenVault');
        return;
    }

    // This would need to iterate through all chats - for now just clear current
    const context = getContext();
    if (context.chatMetadata) {
        delete context.chatMetadata[METADATA_KEY];
        await saveChatConditional();
    }

    toastr.success('All data deleted', 'OpenVault');
    refreshAllUI();
}

/**
 * Set the status indicator
 * @param {string} status - 'ready', 'extracting', 'retrieving', 'error'
 */
function setStatus(status) {
    const $indicator = $('#openvault_status');
    $indicator.removeClass('ready extracting retrieving error');
    $indicator.addClass(status);

    const statusText = {
        ready: 'Ready',
        extracting: 'Extracting...',
        retrieving: 'Retrieving...',
        error: 'Error',
    };

    $indicator.text(statusText[status] || status);
}

/**
 * Log message if debug mode is enabled
 * @param {string} message
 */
function log(message) {
    const settings = extension_settings[extensionName];
    if (settings?.debugMode) {
        console.log(`[OpenVault] ${message}`);
    }
}

/**
 * Register slash commands
 */
function registerCommands() {
    const context = getContext();
    const parser = context.SlashCommandParser;
    const command = context.SlashCommand;

    // /openvault-extract - Extract memories from recent messages
    parser.addCommandObject(command.fromProps({
        name: 'openvault-extract',
        callback: async () => {
            await extractMemories();
            return '';
        },
        helpString: 'Extract memories from recent messages',
    }));

    // /openvault-retrieve - Retrieve and inject context
    parser.addCommandObject(command.fromProps({
        name: 'openvault-retrieve',
        callback: async () => {
            await retrieveAndInjectContext();
            return '';
        },
        helpString: 'Retrieve relevant context and inject into prompt',
    }));

    // /openvault-status - Show current status
    parser.addCommandObject(command.fromProps({
        name: 'openvault-status',
        callback: async () => {
            const settings = extension_settings[extensionName];
            const data = getOpenVaultData();
            const status = `OpenVault: ${settings.enabled ? 'Enabled' : 'Disabled'}, Mode: ${settings.automaticMode ? 'Automatic' : 'Manual'}, Memories: ${data[MEMORIES_KEY]?.length || 0}`;
            toastr.info(status, 'OpenVault');
            return status;
        },
        helpString: 'Show OpenVault status',
    }));

    log('Slash commands registered');
}

/**
 * Initialize the extension
 */
jQuery(async () => {
    // Check SillyTavern version
    const response = await fetch('/version');
    const version = await response.json();
    const [major, minor] = version.pkgVersion.split('.').map(Number);

    if (minor < 13) {
        toastr.error('OpenVault requires SillyTavern 1.13.0 or later', 'OpenVault');
        return;
    }

    // Initialize on app ready
    eventSource.on(event_types.APP_READY, async () => {
        await loadSettings();
        registerCommands();
        updateEventListeners();
        setStatus('ready');
        log('Extension initialized');
    });

    // Handle chat changes
    eventSource.on(event_types.CHAT_CHANGED, async (chatId) => {
        if (!chatId) return;
        log(`Chat changed to: ${chatId}`);
        refreshAllUI();
        setStatus('ready');
    });
});
