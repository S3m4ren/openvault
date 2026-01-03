/**
 * OpenVault Extraction Prompts
 *
 * Builds prompts for memory extraction from messages.
 */
import { CHARACTERS_KEY, PER_CHAT_SETTINGS_KEY} from '../constants.js';
import { getOpenVaultData} from '../utils.js';

/**
 * Build the extraction prompt
 * @param {string} messagesText - Formatted messages to analyze
 * @param {string} characterName - Main character name
 * @param {string} userName - User character name
 * @param {Object[]} existingMemories - Recent memories for context (optional)
 * @param {string} characterDescription - Character card description (optional)
 * @param {string} personaDescription - User persona description (optional)
 * @returns {string} The extraction prompt
 */
export function buildExtractionPrompt(messagesText, characterName, userName, existingMemories = [], characterDescription = '', personaDescription = '') {
    // Build character context section if we have descriptions
    let characterContextSection = '';
    if (characterDescription || personaDescription) {
        characterContextSection = '\n## Character Context\n';
        if (characterDescription) {
            characterContextSection += `### ${characterName} (AI Character)\n${characterDescription}\n\n`;
        }
        if (personaDescription) {
            characterContextSection += `### ${userName} (User's Persona)\n${personaDescription}\n\n`;
        }
    }

    // Build memory context section if we have existing memories
    let memoryContextSection = '';
    if (existingMemories && existingMemories.length > 0) {
        const memorySummaries = existingMemories
            .sort((a, b) => (a.sequence ?? a.created_at ?? 0) - (b.sequence ?? b.created_at ?? 0))
            .map((m, i) => `${i + 1}. [${m.event_type || 'event'}] ${m.summary}`)
            .join('\n');

        memoryContextSection = `
## Previously Established Memories
The following events have already been recorded. Use this context to:
- Avoid duplicating already-recorded events
- Maintain consistency with established facts
- Build upon existing character developments

${memorySummaries}

`;
    }
    const data = getOpenVaultData() || {};
    const perChat = data[PER_CHAT_SETTINGS_KEY] || {};
    const charList = Array.isArray(perChat.nameList) ? perChat.nameList : [];

    let namePrompt = '';
    
    //Creating Other Characters List if nameList is not empty
    if (charList.length) {
        namePrompt =
        '- Other Characters:\n' +
        charList.map(n => `  - ${n}`).join('\n') +
        '\n';
    }

    const cardType = perChat.cardType || 'rp';

    //Checking which cardtype is set.
    let characterPrompt = '';
    if (cardType === 'rp') {
        characterPrompt = `- Main character: ${characterName}\n${namePrompt}- User's character: ${userName}`;
    } else {
        characterPrompt = `- User's character: ${userName}\n${namePrompt}`;
    }

    //Checking if canonical date tracking is activated and assembling Prompt
    if (!perChat.canonicalDateTracking){
        //Non-date-tracking-prompt
        return `You are analyzing roleplay messages to extract structured memory events.

## Characters
${characterPrompt}
${characterContextSection}${memoryContextSection}
## Messages to analyze:
${messagesText}

## Task
Extract NEW significant events from these messages. Use the Character Context (if provided) to better understand motivations, personality traits, and relationship dynamics. For each event, identify:
1. **event_type**: One of: "action", "revelation", "emotion_shift", "relationship_change"
2. **importance**: 1-5 scale (1=minor detail, 2=notable, 3=significant, 4=major event, 5=critical/story-changing)
3. **summary**: Brief description of what happened (1-2 sentences)
4. **characters_involved**: List of character names directly involved
5. **witnesses**: List of character names who observed this (important for POV filtering)
6. **location**: Where this happened (if mentioned, otherwise "unknown")
7. **is_secret**: Whether this information should only be known by witnesses
8. **emotional_impact**: Object mapping character names to emotional changes (e.g., {"${characterName}": "growing trust", "${userName}": "surprised"})
9. **relationship_impact**: Object describing relationship changes (e.g., {"${characterName}->${userName}": "trust increased"})

Only extract events that are significant for character memory and story continuity. Skip mundane exchanges.
${existingMemories.length > 0 ? 'Do NOT duplicate events from the "Previously Established Memories" section.' : ''}

Respond with a JSON array of events:
\`\`\`json
[
  {
    "event_type": "...",
    "importance": 3,
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
    } else {
        //Date-tracking-prompt
        return `You are analyzing roleplay messages to extract structured memory events.

## Characters
${characterPrompt}
${characterContextSection}${memoryContextSection}
## Messages to analyze:
${messagesText}

## Task
Extract NEW significant events from these messages. Use the Character Context (if provided) to better understand motivations, personality traits, and relationship dynamics. For each event, identify:
1. **event_type**: One of: "action", "revelation", "emotion_shift", "relationship_change"
2. **importance**: 1-5 scale (1=minor detail, 2=notable, 3=significant, 4=major event, 5=critical/story-changing)
3. **summary**: Brief description of what happened (1-2 sentences)
4. **characters_involved**: List of character names directly involved
5. **witnesses**: List of character names who observed this (important for POV filtering)
6. **location**: Where this happened (if mentioned, otherwise "unknown")
7. **canonical_date**: On which date did this happen (e.g. "Saturday, January 3, 2026")
8. **is_secret**: Whether this information should only be known by witnesses
9. **emotional_impact**: Object mapping character names to emotional changes (e.g., {"${characterName}": "growing trust", "${userName}": "surprised"})
10. **relationship_impact**: Object describing relationship changes (e.g., {"${characterName}->${userName}": "trust increased"})

Only extract events that are significant for character memory and story continuity. Skip mundane exchanges.
${existingMemories.length > 0 ? 'Do NOT duplicate events from the "Previously Established Memories" section.' : ''}

Respond with a JSON array of events:
\`\`\`json
[
  {
    "event_type": "...",
    "importance": 3,
    "summary": "...",
    "characters_involved": [...],
    "witnesses": [...],
    "location": "...",
    "canonical_date": "...",
    "is_secret": false,
    "emotional_impact": {...},
    "relationship_impact": {...}
  }
]
\`\`\`

If no significant events, respond with an empty array: []`;
    }
}
