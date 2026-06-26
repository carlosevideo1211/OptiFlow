content = open('src/pages/ClientesPage.tsx', encoding='utf-8').read()
content = content.replace(
    'if (search.trim()) {',
    'console.log("FILTERED WILL BE:", list.filter(c => norm(c.name).includes(norm(search))).length); if (search.trim()) {'
)
open('src/pages/ClientesPage.tsx', 'w', encoding='utf-8').write(content)
print('Done!')
