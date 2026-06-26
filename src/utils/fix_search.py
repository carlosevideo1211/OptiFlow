import re

def fix_file(path, replacements):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Add norm import if not present
    if "from '../utils/normalize'" not in content and "from '../../utils/normalize'" not in content:
        if "pages/consulta" in path or "pages/admin" in path:
            imp = "import { norm } from '../../utils/normalize';\n"
        else:
            imp = "import { norm } from '../utils/normalize';\n"
        # Insert after last import line
        lines = content.split('\n')
        last_import = 0
        for i, line in enumerate(lines):
            if line.startswith('import '):
                last_import = i
        lines.insert(last_import + 1, imp.strip())
        content = '\n'.join(lines)
    
    for old, new in replacements:
        if old in content:
            content = content.replace(old, new)
            print(f"  Fixed!")
        else:
            print(f"  Not found: {old[:50]}...")
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

fixes = [
    ("src/pages/ClientesPage.tsx", [
        ("const s = search.toLowerCase();\n      list = list.filter(c => c.name.toLowerCase().includes(s) || c.cpf?.includes(s) || c.cpf?.replace(/[^0-9]/g,'').includes(s.replace(/[^0-9]/g,'')) || c.phone?.includes(s));",
         "const s = norm(search);\n      list = list.filter(c => norm(c.name).includes(s) || c.cpf?.includes(s) || c.cpf?.replace(/[^0-9]/g,'').includes(s.replace(/[^0-9]/g,'')) || norm(c.phone).includes(s));"),
        ("list = list.filter(c => c.city?.toLowerCase().includes(cityFilter.toLowerCase()));",
         "list = list.filter(c => norm(c.city).includes(norm(cityFilter)));"),
    ]),
    ("src/pages/CadastrosPage.tsx", [
        ("const s = search.toLowerCase();\n    return suppliers.filter(f => f.name.toLowerCase().includes(s) || f.category.toLowerCase().includes(s));",
         "const s = norm(search);\n    return suppliers.filter(f => norm(f.name).includes(s) || norm(f.category).includes(s));"),
        ("const s = searchProf.toLowerCase();\n    return professionals.filter(p => p.active && (p.name.toLowerCase().includes(s) || p.specialty?.toLowerCase().includes(s)));",
         "const s = norm(searchProf);\n    return professionals.filter(p => p.active && (norm(p.name).includes(s) || norm(p.specialty).includes(s)));"),
        ("const s = searchFunc.toLowerCase();\n    return funcionarios.filter(f => f.active && (f.name.toLowerCase().includes(s) || f.cargo?.toLowerCase().includes(s)));",
         "const s = norm(searchFunc);\n    return funcionarios.filter(f => f.active && (norm(f.name).includes(s) || norm(f.cargo).includes(s)));"),
    ]),
    ("src/pages/ProdutosPage.tsx", [
        ("const s = search.toLowerCase();\n      list = list.filter(p => p.name.toLowerCase().includes(s) || p.code?.toLowerCase().includes(s) || p.brand?.toLowerCase().includes(s));",
         "const s = norm(search);\n      list = list.filter(p => norm(p.name).includes(s) || norm(p.code).includes(s) || norm(p.brand).includes(s));"),
    ]),
    ("src/pages/OrdemServicoPage.tsx", [
        ("const s = search.toLowerCase();\n      list = list.filter(o => o.customer_name.toLowerCase().includes(s) || String(o.os_number).includes(s));",
         "const s = norm(search);\n      list = list.filter(o => norm(o.customer_name).includes(s) || String(o.os_number).includes(s));"),
        ("customers.filter(c => c.name.toLowerCase().includes(form.customer_name.toLowerCase())).slice(0,8)",
         "customers.filter(c => norm(c.name).includes(norm(form.customer_name))).slice(0,8)"),
        ("customers.filter(c => c.name.toLowerCase().includes(form.customer_name.toLowerCase())).length === 0",
         "customers.filter(c => norm(c.name).includes(norm(form.customer_name))).length === 0"),
    ]),
    ("src/pages/VendasPage.tsx", [
        ("const s = search.toLowerCase();\n      list = list.filter(v => v.customer_name?.toLowerCase().includes(s) || String(v.sale_number).includes(s) || v.vendedor?.toLowerCase().includes(s));",
         "const s = norm(search);\n      list = list.filter(v => norm(v.customer_name).includes(s) || String(v.sale_number).includes(s) || norm(v.vendedor).includes(s));"),
        ("const s = productSearch.toLowerCase();\n    return products.filter(p => p.name.toLowerCase().includes(s) || p.brand?.toLowerCase().includes(s) || p.code?.toLowerCase().includes(s)).slice(0, 15);",
         "const s = norm(productSearch);\n    return products.filter(p => norm(p.name).includes(s) || norm(p.brand).includes(s) || norm(p.code).includes(s)).slice(0, 15);"),
        ("const s = osSearch.toLowerCase();\n    return available.filter(o => o.customer_name.toLowerCase().includes(s) || String(o.os_number).includes(s)).slice(0, 8);",
         "const s = norm(osSearch);\n    return available.filter(o => norm(o.customer_name).includes(s) || String(o.os_number).includes(s)).slice(0, 8);"),
    ]),
    ("src/pages/FinanceiroPage.tsx", [
        ("const s = search.toLowerCase();\n      list = list.filter(t => t.description.toLowerCase().includes(s) || t.category?.toLowerCase().includes(s));",
         "const s = norm(search);\n      list = list.filter(t => norm(t.description).includes(s) || norm(t.category).includes(s));"),
    ]),
    ("src/pages/AgendaPage.tsx", [
        ("searchClient.length > 1 && c.name.toLowerCase().includes(searchClient.toLowerCase())",
         "searchClient.length > 1 && norm(c.name).includes(norm(searchClient))"),
    ]),
    ("src/pages/BaixasTab.tsx", [
        ("b.customer_name?.toLowerCase().includes(search.toLowerCase()) || b.operator_name?.toLowerCase().includes(search.toLowerCase())",
         "norm(b.customer_name).includes(norm(search)) || norm(b.operator_name).includes(norm(search))"),
    ]),
    ("src/pages/consulta/ConsultaPage.tsx", [
        ("const s = search.toLowerCase();\n      list = list.filter(c => c.customer_name?.toLowerCase().includes(s) || c.professional_name?.toLowerCase().includes(s));",
         "const s = norm(search);\n      list = list.filter(c => norm(c.customer_name).includes(s) || norm(c.professional_name).includes(s));"),
    ]),
    ("src/pages/consulta/NovaConsultaModal.tsx", [
        ("!search || c.name.toLowerCase().includes(search.toLowerCase())",
         "!search || norm(c.name).includes(norm(search))"),
    ]),
]

for path, replacements in fixes:
    print(f"\nProcessing {path}...")
    fix_file(path, replacements)

print("\nDone!")
