import re, os

files = ['index.html','about.html','contact.html','examples.html','how-it-works.html','privacy.html','privacy-old.html','pricing.html','terms.html']
pattern = re.compile(r'\.nav-logo \.nav-logo-mark\s*,\s*\.nav-logo \.logo-mark\s*\{[^\}]*\}', re.S)
pattern2 = re.compile(r'\.nav-logo \.logo-mark\s*,\s*\.nav-logo \.nav-logo-mark\s*\{[^\}]*\}', re.S)
for fn in files:
    if not os.path.exists(fn):
        continue
    with open(fn, 'r', encoding='utf-8') as f:
        text = f.read()
    new_text = pattern.sub('', text)
    new_text = pattern2.sub('', new_text)
    if new_text != text:
        with open(fn, 'w', encoding='utf-8', newline='\n') as f:
            f.write(new_text)
        print('cleaned', fn)
