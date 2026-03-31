import re, os

files = ['index.html','about.html','contact.html','examples.html','how-it-works.html','privacy.html','privacy-old.html','pricing.html','terms.html','header.html']
css_snippet = '''
.nav-logo-img, .footer-logo-img {
  width: 40px;
  height: 40px;
  object-fit: contain;
  display: inline-block;
  margin-right: 0.6rem;
  vertical-align: middle;
}
.nav-logo .nav-logo-mark, .nav-logo .logo-mark, .footer-logo-mark { display: none; }
.nav-logo .nav-wordmark, .nav-logo .logo-wordmark { font-size: 1rem; font-weight: 700; letter-spacing: 0; }
'''

for fn in files:
    if not os.path.exists(fn):
        continue
    with open(fn, 'r', encoding='utf-8') as f:
        text = f.read()

    def repl_nav(m):
        return '<a href="index.html" class="nav-logo">\n  <img src="logo.png" alt="NeoBookworm.uk logo" class="nav-logo-img">\n  <span class="nav-wordmark logo-wordmark">NeoBookworm.uk</span>\n</a>'

    text_new, n = re.subn(r'<a[^>]*class="[^"]*nav-logo[^"]*"[^>]*>.*?</a>', repl_nav, text, flags=re.S)
    if n > 0:
        text = text_new

    text = re.sub(r'<div\s+class="footer-logo-mark">.*?</div>', '<div class="footer-logo-mark"><img src="logo.png" alt="NeoBookworm.uk logo" class="footer-logo-img"></div>', text, flags=re.S)

    if '</style>' in text and '.nav-logo-img' not in text:
        text = text.replace('</style>', css_snippet + '\n</style>', 1)

    with open(fn, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)

    print('edited', fn, 'nav', n)
