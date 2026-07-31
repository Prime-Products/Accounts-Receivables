import pandas as pd, json, re

cus = pd.DataFrame(json.load(open("/tmp/customers.json")))
df = pd.read_excel("/home/ubuntu/upload/Contactsall.xlsx", sheet_name="Print")

SUFFIX = r'\b(S\.?A\.?|A\.?E\.?|LTD|LIMITED|INC|CORP|CORPORATION|CO|PTE|LLC|GMBH|BV|NV|WLL|PLC|EPE|OE|IKE)\b'
def norm(s):
    if s is None or pd.isna(s): return ""
    s = str(s).upper()
    s = re.sub(SUFFIX, '', s)
    return re.sub(r'[^A-Z0-9\u0370-\u03FF]', '', s)

cus['nn'] = cus['name'].map(norm)
cus['grp'] = cus.apply(lambda r: (r['group'] or '').strip() or r['name'], axis=1)
cus['gn'] = cus['grp'].map(norm)

cmap = {}
for _, r in cus.iterrows():
    cmap.setdefault(r['nn'], (int(r['id']), r['name'], r['grp'], 'company'))
gmap = {}
for g, sub in cus.groupby('gn'):
    same = sub[sub['nn'] == g]
    rep = same.iloc[0] if len(same) else sub.iloc[0]
    gmap.setdefault(g, (int(rep['id']), rep['name'], rep['grp'], 'group'))

EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$')
def emails(r):
    out = []
    for col in ['email.1', 'email']:
        v = r[col]
        if v is None or pd.isna(v): continue
        for p in re.split(r'[;,]', str(v)):
            p = p.strip().lower()
            if EMAIL_RE.match(p) and p not in out:
                out.append(p)
    return out

def full_name(r):
    sn = "" if pd.isna(r['Surname']) else str(r['Surname']).strip()
    fn = "" if pd.isna(r['Name']) else str(r['Name']).strip()
    nm = re.sub(r'\s+', ' ', f"{fn} {sn}".strip())
    return re.sub(r'^[\-\s&,\.]+', '', nm).strip()[:255]

# Role tokens that appear in the name field of shared mailboxes. When Dept. is
# empty we promote the recognised token to the Position column so the row still
# says what the mailbox is for.
ROLE_TOKENS = [
    ("PURCHASING", "Purchasing"), ("PURCH", "Purchasing"), ("PU", "Purchasing"),
    ("SPARES", "Spares"), ("SUPPLY", "Supply"), ("PROCUREMENT", "Purchasing"),
    ("TECHNICAL", "Technical"), ("TECH", "Technical"),
    ("ACCOUNTING", "Accounting"), ("ACCOUNTS", "Accounting"), ("ACCOUNT", "Accounting"),
    ("PAYABLES", "Accounting"), ("FINANCE", "Accounting"),
    ("OPERATIONS", "Operations"), ("OPERATION", "Operations"),
    ("MARINE", "Marine"), ("VETTING", "Marine"), ("CREW", "Crew"),
    ("HSQE", "HSQE"), ("HSQ", "HSQE"), ("SAFETY", "Safety"),
]

def role_from_name(nm):
    up = re.sub(r'[^A-Z ]', ' ', nm.upper())
    words = set(up.split())
    for token, label in ROLE_TOKENS:
        if token in words:
            return label
    return ""

def position(r, nm=""):
    d = "" if pd.isna(r['Dept.']) else str(r['Dept.']).strip()
    c = "" if pd.isna(r['Comments']) else str(r['Comments']).strip()
    if not d:
        d = role_from_name(nm)
    if c and len(c) <= 30 and not re.search(r'\d{4}|@', c):
        if d and c.upper() != d.upper(): return f"{d} — {c}"[:255]
        return (d or c)[:255]
    return d[:255]

def phone(r):
    for k in ['Cell phone', 'Tel. 1', 'Tel. 2']:
        v = r[k]
        if v is None or pd.isna(v): continue
        p = re.sub(r'[^\d\+]', '', str(v).split(',')[0].split(';')[0])
        if len(re.sub(r'\D', '', p)) >= 7:
            return p[:20]
    return None

records, seen = [], set()
stats = dict(rows=0, no_company=0, unmatched=0, flagged=0, inactive=0, no_email=0, no_name=0, dupes=0)
for _, r in df.iterrows():
    stats['rows'] += 1
    cn = r['Name.1']
    if cn is None or pd.isna(cn):
        stats['no_company'] += 1; continue
    m = cmap.get(norm(cn)) or gmap.get(norm(cn))
    if not m:
        stats['unmatched'] += 1; continue
    flag = r['Table 01']
    if flag is not None and not pd.isna(flag) and str(flag).strip() in ('Invalid', 'Unsubscribe'):
        stats['flagged'] += 1; continue
    if r['Active'] == 0:
        stats['inactive'] += 1; continue
    es = emails(r)
    if not es:
        stats['no_email'] += 1; continue
    nm = full_name(r)
    if not nm:
        stats['no_name'] += 1; continue
    cid, cname, grp, tier = m
    pos, ph = position(r, nm), phone(r)
    # One row per person: personal address (email.1) wins, generic mailbox is the fallback.
    primary = es[0]
    key = (cid, primary)
    if key in seen:
        stats['dupes'] += 1; continue
    seen.add(key)
    records.append(dict(customerId=cid, name=nm, email=primary, phone=ph, title=pos or None,
                        company=cname, group=grp, tier=tier, erpCode=None if pd.isna(r['Code']) else str(r['Code']).strip()))

json.dump(records, open("/tmp/contacts_import.json", "w"), ensure_ascii=False)
print("STATS:", json.dumps(stats, indent=None))
print("records to insert:", len(records))
print("distinct customers:", len({r['customerId'] for r in records}))
print("distinct groups:", len({r['group'] for r in records}))
print("with phone:", sum(1 for r in records if r['phone']))
print("with position:", sum(1 for r in records if r['title']))
print("\nsample:")
for r in records[:6]: print(" ", r['group'], "|", r['name'], "|", r['title'], "|", r['email'], "|", r['phone'])
