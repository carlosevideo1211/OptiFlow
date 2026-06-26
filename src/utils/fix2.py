content = open('src/pages/ClientesPage.tsx', encoding='utf-8').read()
# Add pagina reset when search changes in useMemo dependency
content = content.replace(
    'console.log("SEARCH:", search, "CUSTOMERS:", customers.length); if (search.trim()) {',
    'if (search.trim()) {'
)
# Fix: force re-render by adding key to list
content = content.replace(
    'onChange={e=>{setSearch(e.target.value);setPagina(1);}}',
    'onChange={e=>{setSearch(e.target.value);setPagina(1);}}'
)
# The real fix: useMemo may be stale - remove customers from outside memo
print("Search in file:", "norm(search)" in content)
print("useMemo deps:", content[content.find("}, [customers"):content.find("}, [customers")+60])
open('src/pages/ClientesPage.tsx', 'w', encoding='utf-8').write(content)
print('Done!')
