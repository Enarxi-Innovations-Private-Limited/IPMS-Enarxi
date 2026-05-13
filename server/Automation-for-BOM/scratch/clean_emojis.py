import re
import os

def clean_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Common emojis and their text equivalents
    replacements = {
        '✅': '[OK]',
        '❌': '[X]',
        '⚠️': '[!]',
        '🔍': '[SEARCH]',
        '🚀': '[START]',
        '🔐': '[LOCK]',
        '⚡': '[FAST]',
        '🐢': '[SLOW]',
        '🔐': '[LOGIN]',
        '⏭️': '[SKIP]',
        '✓': '[V]',
        '🛒': '[CART]',
        '🐢': '[TURTLE]',
    }
    
    for emoji, text in replacements.items():
        content = content.replace(emoji, text)
    
    # Remove any other non-ASCII characters that might cause issues in print statements
    # But keep common symbols like ₹
    def replace_non_ascii(match):
        char = match.group(0)
        if char == '₹': return char
        return ''
    
    # This might be too aggressive, let's just target common emojis
    # A better way is to use a regex for emojis
    # Emoji range: [U+1F600-U+1F64F], [U+1F300-U+1F5FF], [U+1F680-U+1F6FF], [U+1F1E0-U+1F1FF], [U+2702-U+27B0], [U+24C2-U+1F251]
    # We'll just stick to the specific ones we saw.
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

clean_file('app/main.py')
clean_file('app/processor.py')
clean_file('automation/cart.py')
print("Emoji cleanup complete.")
