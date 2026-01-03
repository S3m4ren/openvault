## Changes over base version

-Setting for maximum response tokens during extraction added.
    => This can help, when using thinking models, where it could happen that the reasoning part took up all (baseline 2000) tokens, which then leaves the content field empty and therefore none extracted memories.

-Added Setting to switch between Cardtypes
    => allows to chose RPG-/scenario type cards, where the card takes over the role of a narrator/ Gamemaster. This means that the name of the name of the character card is not being included. Combating cases where the name of the character card (i.e. "Narrator) would be registered as a Character during extraction.

-Added a list of Name that will be sent together with the users and character cards name.
    => the List can -at the moment- be both manually filled or copied from existing characters registered during Extraction.
    => This hopefully minimizes cases, where the same character is refered to by different names in different batches (i.e. in Batch 1 the character "John Smith" is referred to as "John" and in Batch 2 as "Mr. Smith"), leading to the extraction registern multiple character entries for the same character (in the example one character entry for "John" and one chracter for "Mr. Smith")
    => This is a relatively dirty Trick and could defenitley be achieved in a more effective way.

-Added a option to track the canonical/ in-chat date, when toggled.
    => When toggled on this does not make the LLM track the date on its on. This option only allows the extraction and injection to handle canonical dates that are already included in the Chat. To include these dates in the chat an "external" source is needed, e.g. a preset or different extension.

-The setting for card types, the canonical date and the name list is stored in the chat metadata. 
    => This means these settings can be adjusted to the needs of a specific chat.
    => The delete current chat memories button was changed to not delete these settings. 

