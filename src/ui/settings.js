/**
 * OpenVault Settings Panel UI
 *
 * Handles loading settings, binding UI elements, and updating the interface.
 */

import { saveSettingsDebounced } from '../../../../../../script.js';
import { extension_settings } from '../../../../../extensions.js';
import { extensionName, extensionFolderPath, defaultSettings, defaultPerChatSettings, PER_CHAT_SETTINGS_KEY, CHARACTERS_KEY } from '../constants.js';
import { refreshAllUI, renderMemoryBrowser, prevPage, nextPage, resetAndRender } from './browser.js';
import { getOpenVaultData, saveOpenVaultData, escapeHtml } from '../utils.js';

// References to external functions (set during init)
let updateEventListenersFn = null;
let extractMemoriesFn = null;
let retrieveAndInjectContextFn = null;
let extractAllMessagesFn = null;
let deleteCurrentChatDataFn = null;
let deleteAllDataFn = null;

/**
 * Set external function references
 * @param {Object} fns - Object containing function references
 */
export function setExternalFunctions(fns) {
    updateEventListenersFn = fns.updateEventListeners;
    extractMemoriesFn = fns.extractMemories;
    retrieveAndInjectContextFn = fns.retrieveAndInjectContext;
    extractAllMessagesFn = fns.extractAllMessages;
    deleteCurrentChatDataFn = fns.deleteCurrentChatData;
    deleteAllDataFn = fns.deleteAllData;
}

/**
 * Load extension settings
 */
export async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};

    // Apply defaults for any missing settings
    Object.assign(extension_settings[extensionName], {
        ...defaultSettings,
        ...extension_settings[extensionName],
    });

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
 * 
 * @param {String} setting  - chosen perChatSetting
 * @param {Object} value    - new value
 */
async function savePerChatSettings(setting, value){
    const data = getOpenVaultData()[PER_CHAT_SETTINGS_KEY];
    if (Object.prototype.toString.call(value) === Object.prototype.toString.call(defaultPerChatSettings[setting])){
        data[setting] = value;

        await saveOpenVaultData();
    }
    
}


async function populateNameListFromCharacters() {
  const data = getOpenVaultData();

  const names = Object.keys(data[CHARACTERS_KEY]);

  await savePerChatSettings('nameList', names);
  renderNameListUI();
}

function renderNameListUI() {
  const data = getOpenVaultData();
  const list = data?.[PER_CHAT_SETTINGS_KEY]?.nameList || [];
  const $container = $('#openvault_name_list');

  $container.empty();

  if (!list.length) {
    $container.html('<p class="openvault-placeholder">No names yet</p>');
    return;
  }

  for (let i = 0; i < list.length; i++) {
    const name = list[i];
    $container.append(`
      <div class="openvault-memory-item" style="padding:8px; display:flex; align-items:center; justify-content:space-between;">
        <div>${escapeHtml(name)}</div>
        <button class="menu_button openvault-name-delete" data-index="${i}" title="Remove">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    `);
  }

  // bind delete buttons
  $container.find('.openvault-name-delete').on('click', async function () {
    const idx = parseInt($(this).data('index'));
    const freshData = getOpenVaultData();
    const current = [...(freshData?.[PER_CHAT_SETTINGS_KEY]?.nameList || [])];

    if (!Number.isFinite(idx) || idx < 0 || idx >= current.length) return;

    current.splice(idx, 1);
    await savePerChatSettings('nameList', current);
    renderNameListUI();
  });
}

async function addNameFromInput() {
  const $input = $('#openvault_name_input');
  const raw = ($input.val() || '').toString();
  const value = raw.trim();

  if (!value) return;

  const data = getOpenVaultData();
  const current = [...(data?.[PER_CHAT_SETTINGS_KEY]?.nameList || [])];
  current.push(value);

  // persist, then clear input, then re-render
  await savePerChatSettings('nameList', current);
  $input.val('');
  renderNameListUI();
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
        if (updateEventListenersFn) updateEventListenersFn();
    });

    // Automatic mode toggle
    $('#openvault_automatic').on('change', function() {
        settings.automaticMode = $(this).is(':checked');
        saveSettingsDebounced();
        if (updateEventListenersFn) updateEventListenersFn();
    });

    // Token budget input
    $('#openvault_token_budget').on('change', function() {
        const value = parseInt($(this).val());
        settings.tokenBudget = isNaN(value) ? 1000 : value;
        $(this).val(settings.tokenBudget);
        saveSettingsDebounced();
    });

    // Max memories per retrieval input
    $('#openvault_max_memories').on('change', function() {
        const value = parseInt($(this).val());
        settings.maxMemoriesPerRetrieval = isNaN(value) ? 10 : value;
        $(this).val(settings.maxMemoriesPerRetrieval);
        saveSettingsDebounced();
    });

    // Debug mode toggle
    $('#openvault_debug').on('change', function() {
        settings.debugMode = $(this).is(':checked');
        saveSettingsDebounced();
    });

    // Messages per extraction slider
    $('#openvault_messages_per_extraction').on('input', function() {
        settings.messagesPerExtraction = parseInt($(this).val());
        $('#openvault_messages_per_extraction_value').text(settings.messagesPerExtraction);
        saveSettingsDebounced();
    });

    // Maximum Response Tokens Extractions
    $('#openvault_max_response_tokens_extraction').on('change', function() {
        const value = parseInt($(this).val());
        settings.maxTokensExtractionResponse = isNaN(value) ? 2000 : value;
        $(this).val(settings.maxTokensExtractionResponse);
        saveSettingsDebounced();
    });

    // Memory context count slider
    $('#openvault_memory_context_count').on('input', function() {
        settings.memoryContextCount = parseInt($(this).val());
        $('#openvault_memory_context_count_value').text(settings.memoryContextCount < 0 ? 'All' : settings.memoryContextCount);
        saveSettingsDebounced();
    });

    // Smart retrieval toggle
    $('#openvault_smart_retrieval').on('change', function() {
        settings.smartRetrievalEnabled = $(this).is(':checked');
        saveSettingsDebounced();
    });

    // Auto-hide toggle
    $('#openvault_auto_hide').on('change', function() {
        settings.autoHideEnabled = $(this).is(':checked');
        saveSettingsDebounced();
    });

    // Auto-hide threshold slider
    $('#openvault_auto_hide_threshold').on('input', function() {
        settings.autoHideThreshold = parseInt($(this).val());
        $('#openvault_auto_hide_threshold_value').text(settings.autoHideThreshold);
        saveSettingsDebounced();
    });

    // Backfill rate limit input
    $('#openvault_backfill_rpm').on('change', function() {
        const value = parseInt($(this).val()) || 30;
        settings.backfillMaxRPM = Math.max(1, Math.min(600, value));
        $(this).val(settings.backfillMaxRPM);
        saveSettingsDebounced();
    });

    // Manual action buttons
    $('#openvault_extract_btn').on('click', () => {
        if (extractMemoriesFn) extractMemoriesFn();
    });
    $('#openvault_retrieve_btn').on('click', () => {
        if (retrieveAndInjectContextFn) retrieveAndInjectContextFn();
    });
    $('#openvault_extract_all_btn').on('click', () => {
        if (extractAllMessagesFn) extractAllMessagesFn();
    });
    $('#openvault_refresh_stats_btn').on('click', () => refreshAllUI());

    // Danger zone buttons
    $('#openvault_delete_chat_btn').on('click', () => {
        if (deleteCurrentChatDataFn) deleteCurrentChatDataFn();
    });
    $('#openvault_delete_all_btn').on('click', () => {
        if (deleteAllDataFn) deleteAllDataFn();
    });

    // Profile selectors
    $('#openvault_extraction_profile').on('change', function() {
        settings.extractionProfile = $(this).val();
        saveSettingsDebounced();
    });

    $('#openvault_retrieval_profile').on('change', function() {
        settings.retrievalProfile = $(this).val();
        saveSettingsDebounced();
    });

    // Card-Type setting
    $('#openvault_card_type').on('change', function() {
        const val = $(this).val() === 'rpg' ? 'rpg' : 'rp';
        savePerChatSettings('cardType', val);
    });

    // Name List - add button
    $('#openvault_name_add').on('click', async () => {
        await addNameFromInput();
    });

    // Name List - allow Enter in the input
    $('#openvault_name_input').on('keydown', async function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            await addNameFromInput();
         }
    });

    //Name List - populate nameList from characters
    $('#openvault_name_populate').on('click', async () => {
        await populateNameListFromCharacters();
    });

    //Canonical date tracking
    $('#openvault_canonical_date_tracking').on('change', function() {
        const val = $(this).is(':checked') === true ? true : false;
        savePerChatSettings('canonicalDateTracking', val);
    });

    // Memory browser pagination
    $('#openvault_prev_page').on('click', () => prevPage());
    $('#openvault_next_page').on('click', () => nextPage());

    // Memory browser filters
    $('#openvault_filter_type').on('change', () => resetAndRender());
    $('#openvault_filter_character').on('change', () => resetAndRender());
}

/**
 * Update UI to match current settings
 */
export function updateUI() {
    const settings = extension_settings[extensionName];
    const per_chat_settings = getOpenVaultData().per_chat_settings;

    $('#openvault_enabled').prop('checked', settings.enabled);
    $('#openvault_automatic').prop('checked', settings.automaticMode);
    $('#openvault_token_budget').val(settings.tokenBudget);
    $('#openvault_max_memories').val(settings.maxMemoriesPerRetrieval);
    $('#openvault_debug').prop('checked', settings.debugMode);

    // Extraction settings
    $('#openvault_messages_per_extraction').val(settings.messagesPerExtraction);
    $('#openvault_messages_per_extraction_value').text(settings.messagesPerExtraction);
    $('#openvault_memory_context_count').val(settings.memoryContextCount);
    $('#openvault_memory_context_count_value').text(settings.memoryContextCount < 0 ? 'All' : settings.memoryContextCount);
    $('#openvault_smart_retrieval').prop('checked', settings.smartRetrievalEnabled);
    $('#openvault_max_response_tokens_extraction').val(settings.maxTokensExtractionResponse);

    // Auto-hide settings
    $('#openvault_auto_hide').prop('checked', settings.autoHideEnabled);
    $('#openvault_auto_hide_threshold').val(settings.autoHideThreshold);
    $('#openvault_auto_hide_threshold_value').text(settings.autoHideThreshold);

    // Backfill settings
    $('#openvault_backfill_rpm').val(settings.backfillMaxRPM);

    //perChatSettings
    $('#openvault_card_type').val(per_chat_settings.cardType);
    $('#openvault_canonical_date_tracking').prop('checked', per_chat_settings['canonicalDateTracking']);

    // Populate profile selector
    populateProfileSelector();

    renderNameListUI();

    // Refresh all UI components
    refreshAllUI();
}

/**
 * Populate the connection profile selectors (extraction and retrieval)
 */
export function populateProfileSelector() {
    const settings = extension_settings[extensionName];
    const profiles = extension_settings.connectionManager?.profiles || [];

    // Populate extraction profile selector
    const $extractionSelector = $('#openvault_extraction_profile');
    $extractionSelector.empty();
    $extractionSelector.append('<option value="">Use current connection</option>');

    for (const profile of profiles) {
        const selected = profile.id === settings.extractionProfile ? 'selected' : '';
        $extractionSelector.append(`<option value="${profile.id}" ${selected}>${profile.name}</option>`);
    }

    // Populate retrieval profile selector
    const $retrievalSelector = $('#openvault_retrieval_profile');
    $retrievalSelector.empty();
    $retrievalSelector.append('<option value="">Use current connection</option>');

    for (const profile of profiles) {
        const selected = profile.id === settings.retrievalProfile ? 'selected' : '';
        $retrievalSelector.append(`<option value="${profile.id}" ${selected}>${profile.name}</option>`);
    }
}
