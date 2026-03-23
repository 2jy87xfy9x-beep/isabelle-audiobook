"""Fix unescaped quotes and bare newlines in agent-generated patch JSON files."""
import json
import sys

def fix_json(raw):
    out = []
    i = 0
    n = len(raw)
    BS = chr(92)  # backslash

    while i < n:
        c = raw[i]
        if c == '"':
            # Start of JSON string
            out.append(c)
            i += 1
            while i < n:
                ch = raw[i]
                if ch == BS:
                    # Escape sequence — keep both chars
                    out.append(ch)
                    i += 1
                    if i < n:
                        out.append(raw[i])
                        i += 1
                elif ch == '"':
                    # Potential string end — peek ahead past whitespace
                    j = i + 1
                    while j < n and raw[j] in ' \t\n\r':
                        j += 1
                    nxt = raw[j] if j < n else ''
                    if nxt in ':,}]':
                        out.append(ch)
                        i += 1
                        break
                    else:
                        # Inner unescaped quote — escape it
                        out.append(BS + '"')
                        i += 1
                elif ch == '\n' or ch == '\r':
                    # Bare newline — encode as literal \n
                    out.append(BS + 'n')
                    i += 1
                else:
                    out.append(ch)
                    i += 1
        else:
            out.append(c)
            i += 1

    return ''.join(out)

path = sys.argv[1]
raw = open(path, encoding='utf-8').read()

try:
    data = json.loads(raw)
    print(f'Already valid: {len(data)} entries')
    sys.exit(0)
except json.JSONDecodeError:
    pass

fixed = fix_json(raw)
try:
    data = json.loads(fixed)
    print(f'Fixed. Entries: {len(data)}')
    open(path, 'w', encoding='utf-8').write(fixed)
    print('Saved.')
except json.JSONDecodeError as e:
    ctx = fixed[max(0, e.pos-60):e.pos+60]
    print(f'Still invalid at pos {e.pos}: {repr(ctx)}')
    sys.exit(1)
