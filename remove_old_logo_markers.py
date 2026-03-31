import re, os

files = ['index.html','about.html','contact.html','examples.html','how-it-works.html','privacy.html','privacy-old.html','pricing.html','terms.html','header.html']

# Replacement HTML content for nav and footer
nav_replacement = '''<a href="index.html" class="nav-logo">
  <img src="logo.png" alt="NeoBookworm.uk logo" class="nav-logo-img">
  <span class="nav-wordmark logo-wordmark">NeoBookworm.uk</span>
</a>'''
footer_replacement = '<div class="footer-logo-mark"><img src="logo.png" alt="NeoBookworm.uk logo" class="footer-logo-img"></div>'

for fn in files:
    if not os.path.exists(fn):
        continue
    with open(fn, 'r', encoding='utf-8') as f:
        text = f.read()

    # Normalize nav identity to new structure
    text, nav_count = re.subn(r'<a[^>]*class="[^"]*nav-logo[^"]*"[^>]*>.*?</a>', nav_replacement, text, flags=re.S)

    # Remove any nav logo marks directly (as backup)
    text = re.sub(r'<div[^>]*class="[^"]*nav-logo-mark[^"]*"[^>]*>.*?</div>', '', text, flags=re.S)
    text = re.sub(r'<div[^>]*class="[^"]*logo-mark[^"]*"[^>]*>.*?</div>', '', text, flags=re.S)

    # Replace footer logo mark block if exists
    text, footer_count = re.subn(r'<div[^>]*class="[^"]*footer-logo-mark[^"]*"[^>]*>.*?</div>', footer_replacement, text, flags=re.S)

    # Remove old CSS rules if any
    text = re.sub(r'\.logo-mark\s*\{[^\}]*\}', '', text, flags=re.S)
    text = re.sub(r'\.nav-logo-mark\s*\{[^\}]*\}', '', text, flags=re.S)
    text = re.sub(r'\.footer-logo-mark\s*\{[^\}]*\}', '', text, flags=re.S)

    with open(fn, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)

    print(f'edited {fn}: nav {nav_count}, footer {footer_count}')
