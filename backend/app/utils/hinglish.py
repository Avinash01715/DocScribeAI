# backend/app/utils/hinglish.py
import re
from indic_transliteration import sanscript
from indic_transliteration.sanscript import transliterate

SCHWA_RULES = [
    ('|', '.'),
    ('meM', 'mein'),
    ('mem', 'mein'),
    ('aura', 'aur'),
    ('bahuta', 'bahut'),
    ('dina', 'din'),
    ('teja', 'tez'),
    ('ramesha', 'Ramesh'),
    ('jI', 'ji'),
    ('kI', 'ki'),
    ('hI', 'hi'),
    ('bhI', 'bhi'),
    ('darda', 'dard'),
    ('bukhAra', 'bukhaar'),
    ('bukhara', 'bukhaar'),
    ('khAnA', 'khana'),
    ('khAne', 'khane'),
    ('bAda', 'baad'),
    ('pAnI', 'paani'),
    ('taka', 'tak'),
    ('kIjiye', 'kijiye'),
    ('dIjiye', 'dijiye'),
    ('lein', 'lein'),
    ('subaha', 'subah'),
    ('shAma', 'shaam'),
    ('garama', 'garam'),
]

def devanagari_to_hinglish(text: str) -> str:
    """
    Converts Hindi Devanagari text to natural, spoken Hinglish (Latin Roman script).
    Example: 'नमस्ते रमेश जी, गले में दर्द है' -> 'Namaste Ramesh ji, gale mein dard hai'
    """
    if not text or not re.search(r'[\u0900-\u097f]', text):
        return text

    # Transliterate via OPTITRANS scheme
    t = transliterate(text, sanscript.DEVANAGARI, sanscript.OPTITRANS)

    # Apply conversational Hindi spelling adjustments
    for old, new in SCHWA_RULES:
        t = re.sub(re.escape(old), new, t, flags=re.IGNORECASE)

    # Clean up excess internal uppercase letters from transliteration
    words = t.split()
    cleaned = []
    for w in words:
        if w.isupper() and len(w) > 3:
            cleaned.append(w.capitalize())
        elif len(w) > 1 and w[0].islower() and not w.startswith('rx'):
            cleaned.append(w.lower())
        else:
            cleaned.append(w)

    result = ' '.join(cleaned)
    # Capitalize first letter of sentence
    result = re.sub(r'(^|[.!?]\s+)([a-z])', lambda m: m.group(1) + m.group(2).upper(), result)
    return result
