import re, os, json

with open('backup-filmes.txt', 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

os.makedirs('public/filmes-json', exist_ok=True)

pattern = re.compile(
    r'ARQUIVO\s+\d+:\s+(\S+).*?--- IN[IÍ]CIO ---\n(.*?)\n--- FIM ---',
    re.DOTALL
)

count = 0
erros = []
for match in pattern.finditer(content):
    filename = match.group(1).strip()
    data = match.group(2)
    try:
        json.loads(data)
    except Exception as e:
        erros.append(f"{filename}: {e}")
    with open(f'public/filmes-json/{filename}', 'w', encoding='utf-8') as f:
        f.write(data)
    count += 1

print(f"Extraidos: {count} arquivos")
print(f"Erros: {len(erros)}")
for e in erros[:5]:
    print("  -", e)

print("\nArquivos gerados:")
files = sorted(os.listdir('public/filmes-json'))
print(f"  Total: {len(files)}")
print(f"  Primeiros: {files[:5]}")
print(f"  Ultimos: {files[-5:]}")

# Check for index.json
if 'index.json' in files:
    with open('public/filmes-json/index.json') as f:
        print(f"\nindex.json: {f.read()[:200]}")
else:
    print("\nAVISO: index.json NAO encontrado")
